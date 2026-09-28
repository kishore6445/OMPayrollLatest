import { describe, it, expect } from "vitest";
import {
  calculatePayroll,
  resolveStateRules,
  resolveMinDailyWage,
  buildStateRulesFromDb,
  type ComplianceRuleInput,
} from "../lib/payroll-calc";

// Zone-based minimum wages (Karnataka 22 May 2026 notification): the daily
// threshold depends on the site's zone — Zone 1 (Greater Bengaluru) ₹899,
// Zone 2 ₹821, Zone 3 ₹743. Sites without a zone (and states with flat
// single-value rules) keep the state default, so existing behaviour is
// unchanged. These are pure calc-engine tests.

const fullAttendance = { presentDays: 26, totalWorkingDays: 26, lwpDays: 0, otHours: 0 };
const noStatutory = { pfEnrolled: false, esiEnrolled: false, ptApplicable: false, lwfApplicable: false };

function kaRule(configJson: string): ComplianceRuleInput {
  return { state: "Karnataka", type: "min_wage", configJson, effectiveFrom: "2024-01-01", isPlaceholder: "false" };
}

describe("resolveMinDailyWage", () => {
  const rules = resolveStateRules("Karnataka");

  it("registry defaults carry Karnataka zone rates", () => {
    expect(rules.minWageZones).toEqual({ "Zone 1": 899, "Zone 2": 821, "Zone 3": 743 });
  });

  it("resolves each zone's rate", () => {
    expect(resolveMinDailyWage(rules, "Zone 1")).toBe(899);
    expect(resolveMinDailyWage(rules, "Zone 2")).toBe(821);
    expect(resolveMinDailyWage(rules, "Zone 3")).toBe(743);
  });

  it("matches zone labels case-insensitively with whitespace trimmed", () => {
    expect(resolveMinDailyWage(rules, " zone 2 ")).toBe(821);
    expect(resolveMinDailyWage(rules, "ZONE 3")).toBe(743);
  });

  it("falls back to the flat default for no zone / unknown zone", () => {
    expect(resolveMinDailyWage(rules, null)).toBe(rules.minDailyWage);
    expect(resolveMinDailyWage(rules, undefined)).toBe(rules.minDailyWage);
    expect(resolveMinDailyWage(rules, "Zone 9")).toBe(rules.minDailyWage);
  });

  it("falls back to the flat default when the state has no zone map (Maharashtra)", () => {
    const mh = resolveStateRules("Maharashtra");
    expect(mh.minWageZones).toBeUndefined();
    expect(resolveMinDailyWage(mh, "Zone 2")).toBe(mh.minDailyWage);
  });
});

describe("buildStateRulesFromDb zoneRates parsing", () => {
  it("parses zoneRates from a min_wage rule's configJson", () => {
    const map = buildStateRulesFromDb(
      [kaRule('{"minDailyWage":899,"zoneRates":{"Zone 1":899,"Zone 2":821,"Zone 3":743}}')],
      "2026-06",
    );
    const ka = map.get("Karnataka")!;
    expect(ka.minDailyWage).toBe(899);
    expect(ka.minWageZones).toEqual({ "Zone 1": 899, "Zone 2": 821, "Zone 3": 743 });
  });

  it("a DB rule without zoneRates is a flat single-value rule (backwards compatible)", () => {
    const map = buildStateRulesFromDb([kaRule('{"minDailyWage":900}')], "2026-06");
    const ka = map.get("Karnataka")!;
    expect(ka.minDailyWage).toBe(900);
    // The DB rule fully defines the zone map: absent zoneRates = no zones,
    // even though the registry default for Karnataka has zones.
    expect(ka.minWageZones).toBeUndefined();
    expect(resolveMinDailyWage(ka, "Zone 3")).toBe(900);
  });

  it("drops invalid zone entries and ignores malformed zoneRates", () => {
    const map = buildStateRulesFromDb(
      [kaRule('{"minDailyWage":899,"zoneRates":{"Zone 1":899,"":500,"Zone X":"abc","Zone Y":-5}}')],
      "2026-06",
    );
    expect(map.get("Karnataka")!.minWageZones).toEqual({ "Zone 1": 899 });

    const bad = buildStateRulesFromDb([kaRule('{"minDailyWage":899,"zoneRates":[821]}')], "2026-06");
    expect(bad.get("Karnataka")!.minWageZones).toBeUndefined();
  });
});

describe("calculatePayroll zone-aware minimum wage check", () => {
  // ₹20,000/month over 26 working days ≈ ₹769.23/day earned.
  // Zone 1 threshold 899 → below; Zone 3 threshold 743 → OK.
  const salary = { grossMonthly: 20000, wageType: "monthly" };

  it("flags a Zone 1 worker below the Zone 1 rate", () => {
    const res = calculatePayroll(salary, fullAttendance, noStatutory, "Karnataka", "prorated_earned", undefined, "2026-06", "Zone 1");
    expect(res.flags.belowMinWage).toBe(true);
    const step = res.trace.find((t) => t.step === "Minimum Wage Check")!;
    expect(step.inputs.minDailyWage).toBe(899);
    expect(step.inputs.zone).toBe("Zone 1");
    expect(step.note).toContain("₹899/day");
    expect(step.note).toContain("(Zone 1)");
  });

  it("does NOT flag the same worker at a Zone 3 site (lower threshold)", () => {
    const res = calculatePayroll(salary, fullAttendance, noStatutory, "Karnataka", "prorated_earned", undefined, "2026-06", "Zone 3");
    expect(res.flags.belowMinWage).toBe(false);
  });

  it("flags a Zone 3 worker earning below ₹743/day", () => {
    // ₹18,000/month over 26 days ≈ ₹692.31/day < 743
    const res = calculatePayroll({ grossMonthly: 18000, wageType: "monthly" }, fullAttendance, noStatutory, "Karnataka", "prorated_earned", undefined, "2026-06", "Zone 3");
    expect(res.flags.belowMinWage).toBe(true);
    const step = res.trace.find((t) => t.step === "Minimum Wage Check")!;
    expect(step.inputs.minDailyWage).toBe(743);
    expect(step.inputs.threshold).toBe(Math.round(743 * 26 * 100) / 100);
  });

  it("unzoned worker uses the flat state default (backwards compatible)", () => {
    const withZoneArg = calculatePayroll(salary, fullAttendance, noStatutory, "Karnataka", "prorated_earned", undefined, "2026-06", null);
    const withoutZoneArg = calculatePayroll(salary, fullAttendance, noStatutory, "Karnataka", "prorated_earned", undefined, "2026-06");
    expect(withZoneArg.flags.belowMinWage).toBe(true);
    expect(withoutZoneArg.flags.belowMinWage).toBe(true);
    const step = withZoneArg.trace.find((t) => t.step === "Minimum Wage Check")!;
    expect(step.inputs.minDailyWage).toBe(899);
    expect(step.inputs.zone).toBe("");
  });

  it("zone tag on a flat-rule state (Maharashtra) is ignored", () => {
    // MH flat rate 477/day; ₹11,000/month over 26 days ≈ ₹423/day → below.
    const res = calculatePayroll({ grossMonthly: 11000, wageType: "monthly" }, fullAttendance, noStatutory, "Maharashtra", "prorated_earned", undefined, "2026-06", "Zone 2");
    const step = res.trace.find((t) => t.step === "Minimum Wage Check")!;
    expect(step.inputs.minDailyWage).toBe(resolveStateRules("Maharashtra").minDailyWage);
  });

  it("zone-resolved threshold works with DB-built rules passed as overrides", () => {
    const map = buildStateRulesFromDb(
      [kaRule('{"minDailyWage":899,"zoneRates":{"Zone 1":899,"Zone 2":821,"Zone 3":743}}')],
      "2026-06",
    );
    const ka = map.get("Karnataka")!;
    // ₹21,000/month ≈ ₹807.69/day: below Zone 1 (899), above Zone 2 (821)? No — 807.69 < 821 → below Zone 2 too; above Zone 3 (743).
    const zone2 = calculatePayroll({ grossMonthly: 21000, wageType: "monthly" }, fullAttendance, noStatutory, "Karnataka", "prorated_earned", ka, "2026-06", "Zone 2");
    expect(zone2.flags.belowMinWage).toBe(true);
    const zone3 = calculatePayroll({ grossMonthly: 21000, wageType: "monthly" }, fullAttendance, noStatutory, "Karnataka", "prorated_earned", ka, "2026-06", "Zone 3");
    expect(zone3.flags.belowMinWage).toBe(false);
  });
});
