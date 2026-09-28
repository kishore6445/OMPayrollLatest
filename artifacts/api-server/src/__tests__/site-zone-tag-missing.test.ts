import { describe, it, expect } from "vitest";
import { isZoneTagMissing } from "../lib/site-readiness";
import { buildStateRulesFromDb, type ComplianceRuleInput } from "../lib/payroll-calc";

// GET /sites returns a `zoneTagMissing` readiness flag: true only for an
// active, untagged site in a state whose effective min-wage rule defines
// zone-based rates. A regression here (e.g. flagging flat-rule Maharashtra
// sites, or losing the inactive-site exclusion) would silently mislead
// admins, so these tests pin the exact helper the route uses.

function minWageRule(state: string, configJson: string): ComplianceRuleInput {
  return { state, type: "min_wage", configJson, effectiveFrom: "2024-01-01", isPlaceholder: "false" };
}

const dbRules: ComplianceRuleInput[] = [
  // Karnataka: zone-based rates (Zone 1 Bengaluru, Zone 2, Zone 3)
  minWageRule("Karnataka", '{"minDailyWage":899,"zoneRates":{"Zone 1":899,"Zone 2":821,"Zone 3":743}}'),
  // Maharashtra: flat single-value rule, no zoneRates
  minWageRule("Maharashtra", '{"minDailyWage":477}'),
];

const stateRules = buildStateRulesFromDb(dbRules, "2026-07-01");

function site(overrides: Partial<{ status: string | null; zone: string | null; state: string }> = {}) {
  return { status: "active", zone: null, state: "Karnataka", ...overrides };
}

describe("zoneTagMissing flag (GET /sites readiness hint)", () => {
  it("flags an untagged active site in a zone-rate state (Karnataka)", () => {
    expect(isZoneTagMissing(site(), stateRules)).toBe(true);
  });

  it("does NOT flag a tagged Karnataka site", () => {
    expect(isZoneTagMissing(site({ zone: "Zone 2" }), stateRules)).toBe(false);
    expect(isZoneTagMissing(site({ zone: "Zone 1" }), stateRules)).toBe(false);
  });

  it("does NOT flag an untagged site in a flat-rule state (Maharashtra)", () => {
    expect(isZoneTagMissing(site({ state: "Maharashtra" }), stateRules)).toBe(false);
  });

  it("does NOT flag an inactive untagged Karnataka site", () => {
    expect(isZoneTagMissing(site({ status: "inactive" }), stateRules)).toBe(false);
  });

  it("does NOT flag a site in a state with no min-wage rule at all", () => {
    expect(isZoneTagMissing(site({ state: "Tamil Nadu" }), stateRules)).toBe(false);
  });

  it("treats an empty-string zone tag as missing", () => {
    expect(isZoneTagMissing(site({ zone: "" }), stateRules)).toBe(true);
  });

  it("stops flagging when the effective Karnataka DB rule has no zoneRates", () => {
    // A flat Karnataka DB rule (no zoneRates) fully replaces the zone map,
    // so untagged sites are no longer flagged — the flag tracks the
    // effective rule, not the registry default.
    const flatKa = buildStateRulesFromDb([minWageRule("Karnataka", '{"minDailyWage":900}')], "2026-07-01");
    expect(isZoneTagMissing(site(), flatKa)).toBe(false);
  });
});
