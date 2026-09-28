import { describe, it, expect } from "vitest";
import { calculatePayroll, resolveStateRules, buildStateRulesFromDb } from "../lib/payroll-calc";

// Unit tests for the periodic (not monthly) Labour Welfare Fund deduction.
// LWF is levied only in the months a state actually collects it: Maharashtra in
// June and December (₹25), Karnataka annually in December (₹6, SME-confirmed).
// Deducting it every month would over-collect ~6-12x. These are pure calc-engine tests.

const fullAttendance = { presentDays: 26, totalWorkingDays: 26, lwpDays: 0, otHours: 0 };
const lwfOnlyStatutory = { pfEnrolled: false, esiEnrolled: false, ptApplicable: false, lwfApplicable: true };
const salary = { grossMonthly: 25000, wageType: "monthly" };

describe("Maharashtra periodic LWF", () => {
  it("deducts ₹25 in June (a levy month)", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-06");
    expect(res.lwf).toBe(25);
    expect(res.lineItems.some((li) => li.componentCode === "LWF")).toBe(true);
  });

  it("deducts ₹25 in December (a levy month)", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-12");
    expect(res.lwf).toBe(25);
  });

  it("does NOT deduct LWF in a non-levy month (July)", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-07");
    expect(res.lwf).toBe(0);
    expect(res.lineItems.some((li) => li.componentCode === "LWF")).toBe(false);
  });

  it("accepts a full YYYY-MM-DD pay month", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-06-15");
    expect(res.lwf).toBe(25);
  });
});

describe("Karnataka annual LWF", () => {
  it("deducts the SME-confirmed ₹6 only in December", () => {
    const dec = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Karnataka", "prorated_earned", undefined, "2026-12");
    expect(dec.lwf).toBe(6);
  });

  it("does NOT deduct LWF in June (Karnataka is annual, December only)", () => {
    const jun = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Karnataka", "prorated_earned", undefined, "2026-06");
    expect(jun.lwf).toBe(0);
  });
});

describe("LWF month gating edge cases", () => {
  it("does not deduct LWF when no pay month is supplied (month unknown)", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra");
    expect(res.lwf).toBe(0);
  });

  it("records a non-levy LWF trace step explaining it was skipped", () => {
    const res = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-07");
    const lwfStep = res.trace.find((t) => t.step === "LWF");
    expect(lwfStep).toBeTruthy();
    expect(lwfStep!.output).toBe(0);
    expect(lwfStep!.note).toMatch(/not levied/i);
  });

  it("does not deduct LWF when the worker is not LWF-applicable, even in a levy month", () => {
    const res = calculatePayroll(salary, fullAttendance, { ...lwfOnlyStatutory, lwfApplicable: false }, "Maharashtra", "prorated_earned", undefined, "2026-06");
    expect(res.lwf).toBe(0);
    expect(res.trace.find((t) => t.step === "LWF")).toBeFalsy();
  });
});

describe("LWF months survive the DB rule round-trip", () => {
  it("buildStateRulesFromDb parses the months array", () => {
    const rows = [
      {
        state: "Maharashtra",
        type: "lwf",
        effectiveFrom: "2024-01-01",
        configJson: JSON.stringify({ amount: 25, months: [6, 12] }),
      },
    ];
    const mh = buildStateRulesFromDb(rows, "2026-06").get("Maharashtra")!;
    expect(mh.lwfMonths).toEqual([6, 12]);
    expect(mh.lwfAmount).toBe(25);

    const jun = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", mh, "2026-06");
    expect(jun.lwf).toBe(25);
    const jul = calculatePayroll(salary, fullAttendance, lwfOnlyStatutory, "Maharashtra", "prorated_earned", mh, "2026-07");
    expect(jul.lwf).toBe(0);
  });

  it("falls back to default months when the DB rule omits or empties the months field", () => {
    const rows = [
      { state: "Maharashtra", type: "lwf", effectiveFrom: "2024-01-01", configJson: JSON.stringify({ amount: 25 }) },
    ];
    const mh = buildStateRulesFromDb(rows, "2026-06").get("Maharashtra")!;
    expect(mh.lwfMonths).toEqual([6, 12]);
  });

  it("default fallback registry already carries the levy months", () => {
    expect(resolveStateRules("Maharashtra").lwfMonths).toEqual([6, 12]);
    expect(resolveStateRules("Karnataka").lwfMonths).toEqual([12]);
  });
});
