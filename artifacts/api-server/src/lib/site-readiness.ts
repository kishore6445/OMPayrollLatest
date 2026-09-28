import type { StateComplianceRules } from "./payroll-calc";

// Readiness hint used by GET /sites: an active site in a state whose
// effective min-wage rule defines zone-based rates, but with no zone tag,
// silently falls back to the state default (e.g. Karnataka Zone 1 /
// Bengaluru rate) during payroll. Flag it so admins can tag the site.
// Purely informational — no calc behaviour change.
export function isZoneTagMissing(
  site: { status: string | null; zone: string | null; state: string },
  stateRules: Map<string, StateComplianceRules>,
): boolean {
  return (
    site.status !== "inactive" &&
    !site.zone &&
    Boolean(stateRules.get(site.state)?.minWageZones)
  );
}
