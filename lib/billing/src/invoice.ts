const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * Thrown when an invoice input record carries a gross pay value that cannot
 * be parsed into a finite number (null, empty string, malformed numeric) or
 * that is negative. Failing loudly here prevents NaN from silently
 * propagating into every line item and header total of the generated
 * invoice, and stops a corrupted negative amount from producing negative
 * line items that reduce the invoice total — effectively crediting the
 * client. Negative gross pay is never a valid payroll outcome.
 */
export class InvalidGrossPayError extends Error {
  readonly workerId: string;
  readonly workerName: string;
  readonly employeeCode: string | null;
  readonly rawValue: unknown;

  constructor(rec: InvoiceLineInput) {
    const label = rec.employeeCode || rec.workerName || rec.workerId;
    super(
      `Invalid gross pay value ${JSON.stringify(rec.grossPay)} for worker ${label} (id: ${rec.workerId}). ` +
        `Invoice generation aborted to avoid producing corrupted totals.`,
    );
    this.name = "InvalidGrossPayError";
    this.workerId = rec.workerId;
    this.workerName = rec.workerName;
    this.employeeCode = rec.employeeCode;
    this.rawValue = rec.grossPay;
  }
}

export interface InvoiceLineInput {
  workerId: string;
  workerName: string;
  employeeCode: string | null;
  siteId: string | null;
  presentDays: string;
  grossPay: number | string;
}

export interface ComputedInvoiceLine {
  workerId: string;
  workerName: string;
  employeeCode: string | null;
  siteId: string | null;
  presentDays: string;
  grossPay: string;
  serviceFee: string;
  totalBeforeGst: string;
  gst: string;
  totalAmount: string;
}

export interface ComputedInvoiceTotals {
  workerCount: number;
  grossPayTotal: string;
  serviceFeeTotal: string;
  subtotal: string;
  gst: string;
  totalAmount: string;
}

export interface ComputedInvoice {
  lineItems: ComputedInvoiceLine[];
  totals: ComputedInvoiceTotals;
}

/**
 * Computes per-worker invoice line items and the derived invoice header totals.
 *
 * The header totals are ALWAYS the sum of the rounded per-worker line items —
 * never an independently rounded aggregate. Aggregating bottom-up guarantees
 * the annexure reconciles exactly with the invoice header; two independent
 * rounding paths drift by a few rupees and silently bill the client a total
 * the line items don't add up to.
 *
 * This is the single source of truth for invoice rounding/aggregation math,
 * shared by the API invoice generator and the demo seed.
 */
export function computeInvoice(
  records: InvoiceLineInput[],
  serviceFeeRate: number,
  gstRate = 0.18,
): ComputedInvoice {
  const lines = records.map((rec) => {
    const raw = rec.grossPay as unknown;
    const parsed =
      typeof raw === "number"
        ? raw
        : typeof raw === "string" && raw.trim() !== ""
          ? Number(raw)
          : NaN;
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new InvalidGrossPayError(rec);
    }
    const grossPay = round2(parsed);
    const serviceFee = round2(grossPay * serviceFeeRate);
    const totalBeforeGst = round2(grossPay + serviceFee);
    const gst = round2(totalBeforeGst * gstRate);
    const totalAmount = round2(totalBeforeGst + gst);
    return {
      input: rec,
      grossPay,
      serviceFee,
      totalBeforeGst,
      gst,
      totalAmount,
    };
  });

  const sumOf = (key: "grossPay" | "serviceFee" | "totalBeforeGst" | "gst" | "totalAmount") =>
    round2(lines.reduce((s, li) => s + li[key], 0));

  return {
    lineItems: lines.map((li) => ({
      workerId: li.input.workerId,
      workerName: li.input.workerName,
      employeeCode: li.input.employeeCode,
      siteId: li.input.siteId,
      presentDays: li.input.presentDays,
      grossPay: String(li.grossPay),
      serviceFee: String(li.serviceFee),
      totalBeforeGst: String(li.totalBeforeGst),
      gst: String(li.gst),
      totalAmount: String(li.totalAmount),
    })),
    totals: {
      workerCount: records.length,
      grossPayTotal: String(sumOf("grossPay")),
      serviceFeeTotal: String(sumOf("serviceFee")),
      subtotal: String(sumOf("totalBeforeGst")),
      gst: String(sumOf("gst")),
      totalAmount: String(sumOf("totalAmount")),
    },
  };
}
