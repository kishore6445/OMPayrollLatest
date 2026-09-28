import { describe, it, expect } from "vitest";
import { calculatePayroll, resolveStateRules, buildStateRulesFromDb } from "../lib/payroll-calc";

// Unit tests for the Maharashtra February-special Professional Tax rule.
// Maharashtra levies a higher PT in February (₹300 on the top slab instead of
// the standard ₹200) so the annual PT total reaches ₹2,500. These are pure
// calc-engine tests — no database required.

const fullAttendance = { presentDays: 26, totalWorkingDays: 26, lwpDays: 0, otHours: 0 };
const ptOnlyStatutory = { pfEnrolled: false, esiEnrolled: false, ptApplicable: true, lwfApplicable: false };

// A monthly gross comfortably above the Maharashtra top PT slab (> ₹10,000).
const topSlabSalary = { grossMonthly: 25000, wageType: "monthly" };

describe("Maharashtra February-special PT", () => {
  it("charges the standard ₹200 for a non-February month", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-06");
    expect(res.pt).toBe(200);
  });

  it("charges the higher ₹300 in February", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-02");
    expect(res.pt).toBe(300);
  });

  it("accepts a full YYYY-MM-DD pay month for February", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-02-01");
    expect(res.pt).toBe(300);
  });

  it("defaults to the standard amount when no pay month is supplied", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra");
    expect(res.pt).toBe(200);
  });

  it("does not apply the February bump to lower slabs (no februaryAmount set)", () => {
    // Gross in the ₹175 band (₹7,501–₹10,000); that slab has no februaryAmount.
    const midSalary = { grossMonthly: 9000, wageType: "monthly" };
    const feb = calculatePayroll(midSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-02");
    expect(feb.pt).toBe(175);
  });

  it("records the February levy in the trace", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", undefined, "2026-02");
    const ptStep = res.trace.find((t) => t.step === "Professional Tax");
    expect(ptStep).toBeTruthy();
    expect(ptStep!.formula).toMatch(/February/i);
    expect(ptStep!.note).toMatch(/February/i);
  });

  it("Karnataka also has a February special (Amendment Act 2025) — ₹300 in February", () => {
    // SME-confirmed July 2026: KA top slab (₹25,000+) is ₹200/month standard,
    // ₹300 in February (annual cap ₹2,500).
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Karnataka", "prorated_earned", undefined, "2026-02");
    expect(res.pt).toBe(300);
  });

  it("Karnataka charges the standard ₹200 in a non-February month", () => {
    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Karnataka", "prorated_earned", undefined, "2026-06");
    expect(res.pt).toBe(200);
  });

  it("Karnataka exempts gross below ₹25,000 even in February", () => {
    const midSalary = { grossMonthly: 20000, wageType: "monthly" };
    const feb = calculatePayroll(midSalary, fullAttendance, ptOnlyStatutory, "Karnataka", "prorated_earned", undefined, "2026-02");
    expect(feb.pt).toBe(0);
  });
});

describe("February amount survives the DB rule round-trip", () => {
  it("buildStateRulesFromDb preserves februaryAmount on the top slab", () => {
    const rows = [
      {
        state: "Maharashtra",
        type: "pt",
        effectiveFrom: "2024-01-01",
        configJson: JSON.stringify({
          slabs: [
            { upTo: 7500, amount: 0 },
            { upTo: 10000, amount: 175 },
            { upTo: null, amount: 200, februaryAmount: 300 },
          ],
        }),
      },
    ];
    const map = buildStateRulesFromDb(rows, "2026-02");
    const mh = map.get("Maharashtra")!;
    const top = mh.ptSlabs[mh.ptSlabs.length - 1];
    expect(top.amount).toBe(200);
    expect(top.februaryAmount).toBe(300);

    const res = calculatePayroll(topSlabSalary, fullAttendance, ptOnlyStatutory, "Maharashtra", "prorated_earned", mh, "2026-02");
    expect(res.pt).toBe(300);
  });

  it("default fallback rule already carries the February amount", () => {
    const mh = resolveStateRules("Maharashtra");
    const top = mh.ptSlabs[mh.ptSlabs.length - 1];
    expect(top.februaryAmount).toBe(300);
  });
});
