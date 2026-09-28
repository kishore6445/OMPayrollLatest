import { describe, expect, it } from "vitest";
import { computeInvoice, InvalidGrossPayError, type InvoiceLineInput } from "@workspace/billing";

const round2 = (n: number): number => Math.round(n * 100) / 100;

function makeRecord(i: number, grossPay: number | string): InvoiceLineInput {
  return {
    workerId: `worker-${i}`,
    workerName: `Worker ${i}`,
    employeeCode: `NX${String(i).padStart(3, "0")}`,
    siteId: `site-${i % 3}`,
    presentDays: "26",
    grossPay,
  };
}

type LineKey = "grossPay" | "serviceFee" | "totalBeforeGst" | "gst" | "totalAmount";

const TOTAL_KEY_MAP: Record<LineKey, keyof ReturnType<typeof computeInvoice>["totals"]> = {
  grossPay: "grossPayTotal",
  serviceFee: "serviceFeeTotal",
  totalBeforeGst: "subtotal",
  gst: "gst",
  totalAmount: "totalAmount",
};

function expectHeaderEqualsSumOfLines(result: ReturnType<typeof computeInvoice>) {
  for (const key of Object.keys(TOTAL_KEY_MAP) as LineKey[]) {
    const sum = round2(result.lineItems.reduce((s, li) => s + Number(li[key]), 0));
    const header = Number(result.totals[TOTAL_KEY_MAP[key]]);
    expect(header, `header ${TOTAL_KEY_MAP[key]} must equal sum of line ${key}`).toBe(sum);
  }
}

function expectLinesInternallyConsistent(
  result: ReturnType<typeof computeInvoice>,
  serviceFeeRate: number,
  gstRate: number,
) {
  for (const li of result.lineItems) {
    const grossPay = Number(li.grossPay);
    const serviceFee = Number(li.serviceFee);
    const totalBeforeGst = Number(li.totalBeforeGst);
    const gst = Number(li.gst);
    const totalAmount = Number(li.totalAmount);

    expect(serviceFee).toBe(round2(grossPay * serviceFeeRate));
    expect(totalBeforeGst).toBe(round2(grossPay + serviceFee));
    expect(gst).toBe(round2(totalBeforeGst * gstRate));
    expect(totalAmount).toBe(round2(totalBeforeGst + gst));

    // Every monetary string must be a clean 2-decimal-max number.
    for (const v of [li.grossPay, li.serviceFee, li.totalBeforeGst, li.gst, li.totalAmount]) {
      expect(Number(v)).toBe(round2(Number(v)));
    }
  }
}

describe("computeInvoice rounding invariants", () => {
  it("empty record list produces zero totals and no line items", () => {
    const result = computeInvoice([], 0.08);
    expect(result.lineItems).toHaveLength(0);
    expect(result.totals.workerCount).toBe(0);
    expect(Number(result.totals.grossPayTotal)).toBe(0);
    expect(Number(result.totals.serviceFeeTotal)).toBe(0);
    expect(Number(result.totals.subtotal)).toBe(0);
    expect(Number(result.totals.gst)).toBe(0);
    expect(Number(result.totals.totalAmount)).toBe(0);
    expectHeaderEqualsSumOfLines(result);
  });

  it("single worker: header totals equal the single rounded line", () => {
    const result = computeInvoice([makeRecord(1, "18333.335")], 0.085);
    expect(result.lineItems).toHaveLength(1);
    expect(result.totals.workerCount).toBe(1);
    expectLinesInternallyConsistent(result, 0.085, 0.18);
    expectHeaderEqualsSumOfLines(result);
    const li = result.lineItems[0]!;
    expect(result.totals.grossPayTotal).toBe(li.grossPay);
    expect(result.totals.serviceFeeTotal).toBe(li.serviceFee);
    expect(result.totals.subtotal).toBe(li.totalBeforeGst);
    expect(result.totals.gst).toBe(li.gst);
    expect(result.totals.totalAmount).toBe(li.totalAmount);
  });

  it("150 workers with repeating fractional paise (10416.666...) reconcile exactly", () => {
    const records = Array.from({ length: 150 }, (_, i) =>
      makeRecord(i, 125000 / 12), // 10416.666666...
    );
    const result = computeInvoice(records, 0.08);
    expect(result.totals.workerCount).toBe(150);
    expectLinesInternallyConsistent(result, 0.08, 0.18);
    expectHeaderEqualsSumOfLines(result);
    // Independently-rounded aggregate would drift here; assert the header is
    // the bottom-up sum, not round2(rawTotal * rate).
    const rawGross = 150 * (125000 / 12);
    const independentlyRoundedFee = round2(round2(rawGross) * 0.08);
    const headerFee = Number(result.totals.serviceFeeTotal);
    const sumFee = round2(result.lineItems.reduce((s, li) => s + Number(li.serviceFee), 0));
    expect(headerFee).toBe(sumFee);
    // Sanity: the two paths genuinely differ for this input, so the assertion
    // above is meaningful (guards against the drift the helper exists to stop).
    expect(independentlyRoundedFee).not.toBe(sumFee);
  });

  it("many workers with varied awkward fractional amounts reconcile exactly", () => {
    const awkward = [
      "10416.666666667",
      "8333.333333333",
      "6249.995",
      "15000.005",
      "0.01",
      "999.994999",
      "12345.675",
      "7777.777",
    ];
    const records = Array.from({ length: 120 }, (_, i) =>
      makeRecord(i, awkward[i % awkward.length]!),
    );
    const result = computeInvoice(records, 0.0725, 0.18);
    expectLinesInternallyConsistent(result, 0.0725, 0.18);
    expectHeaderEqualsSumOfLines(result);
  });

  it("serviceFeeRate 0 yields zero fees and header still reconciles", () => {
    const records = Array.from({ length: 25 }, (_, i) => makeRecord(i, 10416.666666));
    const result = computeInvoice(records, 0);
    for (const li of result.lineItems) {
      expect(Number(li.serviceFee)).toBe(0);
      expect(li.totalBeforeGst).toBe(li.grossPay);
    }
    expect(Number(result.totals.serviceFeeTotal)).toBe(0);
    expectLinesInternallyConsistent(result, 0, 0.18);
    expectHeaderEqualsSumOfLines(result);
  });

  it("non-default gstRate (12%) reconciles exactly", () => {
    const records = Array.from({ length: 60 }, (_, i) => makeRecord(i, 9166.6666667 + i * 0.335));
    const result = computeInvoice(records, 0.1, 0.12);
    expectLinesInternallyConsistent(result, 0.1, 0.12);
    expectHeaderEqualsSumOfLines(result);
  });

  it("gstRate 0 yields zero GST and totalAmount equals subtotal", () => {
    const records = Array.from({ length: 10 }, (_, i) => makeRecord(i, "10416.67"));
    const result = computeInvoice(records, 0.08, 0);
    for (const li of result.lineItems) {
      expect(Number(li.gst)).toBe(0);
      expect(li.totalAmount).toBe(li.totalBeforeGst);
    }
    expect(result.totals.gst).toBe("0");
    expect(result.totals.totalAmount).toBe(result.totals.subtotal);
    expectHeaderEqualsSumOfLines(result);
  });

  it("accepts numeric-string grossPay (as stored in DB) identically to numbers", () => {
    const asStrings = computeInvoice(
      [makeRecord(1, "10416.666666"), makeRecord(2, "8333.333333")],
      0.08,
    );
    const asNumbers = computeInvoice(
      [makeRecord(1, 10416.666666), makeRecord(2, 8333.333333)],
      0.08,
    );
    expect(asStrings.totals).toEqual(asNumbers.totals);
    expect(asStrings.lineItems).toEqual(asNumbers.lineItems);
    expectHeaderEqualsSumOfLines(asStrings);
  });

  it("rejects corrupted grossPay values with a worker-identifying error instead of NaN totals", () => {
    const corruptedValues: unknown[] = ["", "   ", "abc", "12,500", null, undefined, NaN, Infinity, -Infinity, "NaN"];
    for (const bad of corruptedValues) {
      const records = [
        makeRecord(1, "10000"),
        makeRecord(2, bad as string),
        makeRecord(3, "20000"),
      ];
      expect(
        () => computeInvoice(records, 0.08),
        `grossPay ${JSON.stringify(bad)} must be rejected`,
      ).toThrow(InvalidGrossPayError);
      try {
        computeInvoice(records, 0.08);
      } catch (err) {
        const e = err as InvalidGrossPayError;
        expect(e.workerId).toBe("worker-2");
        expect(e.message).toContain("worker-2");
        expect(e.message).toContain("NX002");
      }
    }
  });

  it("rejects negative grossPay values with a worker-identifying error instead of crediting the client", () => {
    const negativeValues: (number | string)[] = [-1, -0.01, -12500, "-1", "-0.01", "-12500.55", " -300 "];
    for (const bad of negativeValues) {
      const records = [
        makeRecord(1, "10000"),
        makeRecord(2, bad),
        makeRecord(3, "20000"),
      ];
      expect(
        () => computeInvoice(records, 0.08),
        `grossPay ${JSON.stringify(bad)} must be rejected`,
      ).toThrow(InvalidGrossPayError);
      try {
        computeInvoice(records, 0.08);
      } catch (err) {
        const e = err as InvalidGrossPayError;
        expect(e.workerId).toBe("worker-2");
        expect(e.rawValue).toBe(bad);
        expect(e.message).toContain("worker-2");
        expect(e.message).toContain("NX002");
      }
    }
  });

  it("accepts zero grossPay (valid boundary, e.g. full LWP month) without throwing", () => {
    const result = computeInvoice([makeRecord(1, 0), makeRecord(2, "0")], 0.08);
    expect(result.lineItems).toHaveLength(2);
    for (const li of result.lineItems) {
      expect(Number(li.grossPay)).toBe(0);
      expect(Number(li.totalAmount)).toBe(0);
    }
    expect(Number(result.totals.totalAmount)).toBe(0);
    expectHeaderEqualsSumOfLines(result);
  });

  it("valid inputs never produce NaN in any line item or total", () => {
    const result = computeInvoice([makeRecord(1, "0"), makeRecord(2, 15000.5)], 0.1);
    for (const li of result.lineItems) {
      for (const v of [li.grossPay, li.serviceFee, li.totalBeforeGst, li.gst, li.totalAmount]) {
        expect(Number.isFinite(Number(v))).toBe(true);
      }
    }
    for (const v of [result.totals.grossPayTotal, result.totals.serviceFeeTotal, result.totals.subtotal, result.totals.gst, result.totals.totalAmount]) {
      expect(Number.isFinite(Number(v))).toBe(true);
    }
  });

  it("500 workers stress: headers reconcile across all five columns", () => {
    // Deterministic pseudo-random fractional amounts.
    let seed = 42;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const records = Array.from({ length: 500 }, (_, i) =>
      makeRecord(i, 3000 + next() * 47000),
    );
    const result = computeInvoice(records, 0.095, 0.18);
    expect(result.totals.workerCount).toBe(500);
    expectLinesInternallyConsistent(result, 0.095, 0.18);
    expectHeaderEqualsSumOfLines(result);
  });
});
