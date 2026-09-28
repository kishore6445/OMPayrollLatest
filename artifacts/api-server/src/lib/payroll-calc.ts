export interface StatutoryProfile {
  pfEnrolled: boolean;
  esiEnrolled: boolean;
  ptApplicable: boolean;
  lwfApplicable: boolean;
}

export interface SalaryStructure {
  grossMonthly: number;
  wageType: string;
  basicAmount?: number;
  hraAmount?: number;
  components?: Array<{ name: string; code: string; amount: number; type: string }>;
}

export interface AttendanceData {
  presentDays: number;
  totalWorkingDays: number;
  lwpDays: number;
  otHours: number;
}

export interface PayrollTrace {
  step: string;
  formula: string;
  inputs: Record<string, string | number>;
  output: number;
  note?: string;
}

export interface PayrollFlags {
  negativeNetPay: boolean;
  belowMinWage: boolean;
  minWageThreshold: number;
  /** Whether the state's minimum wage rule is SME-confirmed (vs placeholder). */
  minWageConfirmed: boolean;
  /** Resolved minimum daily wage (zone-adjusted when applicable). */
  minDailyWage: number;
  /** Zone label suffix like " (Zone 3)" when a zone rate was applied, else "". */
  minWageZoneLabel: string;
}

export interface PayrollResult {
  grossPay: number;
  netPay: number;
  pfEmployee: number;
  pfEmployer: number;
  esi: number;
  esiEmployer: number;
  pt: number;
  lwf: number;
  otAmount: number;
  allowances: number;
  incentives: number;
  manualDeductions: number;
  totalDeductions: number;
  employerCost: number;
  flags: PayrollFlags;
  lineItems: Array<{ componentName: string; componentCode: string; componentType: string; amount: number }>;
  trace: PayrollTrace[];
}

export interface PtSlab {
  upTo: number;
  amount: number;
  /**
   * Optional February-only PT amount for this slab. Maharashtra levies a higher
   * PT in February (₹300 instead of ₹200 on the top slab) so the annual total
   * reaches ₹2,500. When set and the pay month is February, this overrides
   * `amount`. Other states / slabs leave it undefined.
   */
  februaryAmount?: number;
}

export interface StateComplianceRules {
  /** Canonical state name used for labelling reports. */
  state: string;
  /** Professional Tax slabs evaluated against monthly gross pay (ascending upTo). */
  ptSlabs: PtSlab[];
  /** Labour Welfare Fund fixed employee contribution per pay run. */
  lwfAmount: number;
  /**
   * Months (1-12) in which the state actually levies LWF. LWF is periodic, not
   * monthly: Maharashtra deducts in June and December ([6, 12]); Karnataka is
   * annual in December ([12]). LWF is only applied when the pay month is in this
   * list. An empty list means LWF is never levied for the state.
   */
  lwfMonths: number[];
  /** Minimum wage per present day (default / fallback rate, e.g. unskilled Zone 1). */
  minDailyWage: number;
  /**
   * Optional zone-based minimum daily wages. Some state notifications (e.g. the
   * Karnataka 22 May 2026 uniform minimum-wage notification) set different daily
   * rates per zone (Zone 1 = Greater Bengaluru, Zone 2 = other municipal areas,
   * Zone 3 = rural). Keys are zone labels (matched case-insensitively against a
   * site's `zone` tag); values are the daily rate for that zone. When a worker's
   * site has no zone (or the zone is not in this map), the engine falls back to
   * `minDailyWage`, which keeps existing single-value rules working unchanged.
   */
  minWageZones?: Record<string, number>;
  /**
   * Per-parameter SME confirmation. When true the value has been signed off by a
   * qualified payroll-compliance SME against the state notification schedule; when
   * false/undefined it is still a placeholder pending sign-off. The runtime values
   * come from the `compliance_rules` table (see buildStateRulesFromDb), which is
   * the source of truth for confirmation status.
   */
  ptConfirmed?: boolean;
  lwfConfirmed?: boolean;
  minWageConfirmed?: boolean;
}

// State-specific statutory parameters. These are now only the FALLBACK defaults:
// at runtime the engine prefers admin-managed values from the `compliance_rules`
// table (see buildStateRulesFromDb + the overrideRules arg of calculatePayroll),
// which also carries each parameter's SME-confirmation status. Values without a
// confirmation flag below are placeholders — validate against the current state
// notification schedules before filing.
const STATE_COMPLIANCE_RULES: Record<string, StateComplianceRules> = {
  Karnataka: {
    state: "Karnataka",
    // SME-confirmed (July 2026): exempt up to ₹24,999; ₹200/month at ₹25,000+,
    // ₹300 in February (Amendment Act 2025, annual cap ₹2,500).
    ptSlabs: [
      { upTo: 24999, amount: 0 },
      { upTo: Infinity, amount: 200, februaryAmount: 300 },
    ],
    // SME-confirmed (July 2026): employee share ₹6/year, levied annually in
    // December — a frequency the engine models via lwfMonths.
    lwfAmount: 6,
    lwfMonths: [12],
    // SME-confirmed (July 2026): unskilled daily rates per the 22 May 2026
    // uniform minimum-wage notification, which is zone-based (Zone 1 = Greater
    // Bengaluru, Zone 2 = other municipal corporations, Zone 3 = rest of the
    // state). `minDailyWage` is the Zone 1 default used when a site has no zone.
    minDailyWage: 899,
    minWageZones: { "Zone 1": 899, "Zone 2": 821, "Zone 3": 743 },
    ptConfirmed: true,
    lwfConfirmed: true,
    minWageConfirmed: true,
  },
  Maharashtra: {
    state: "Maharashtra",
    ptSlabs: [
      { upTo: 7500, amount: 0 },
      { upTo: 10000, amount: 175 },
      // Top slab is ₹200/month but ₹300 in February (annual PT = ₹2,500).
      { upTo: Infinity, amount: 200, februaryAmount: 300 },
    ],
    lwfAmount: 25,
    lwfMonths: [6, 12],
    minDailyWage: 477,
    // SME-confirmed: PT slabs (incl. February special) and minimum daily wage.
    // LWF amount is confirmed but its half-yearly (Jun/Dec) frequency is not yet
    // modelled by the engine, so it is kept unconfirmed here pending that change.
    ptConfirmed: true,
    minWageConfirmed: true,
  },
};

export const DEFAULT_STATE = "Karnataka";

/** Resolve the statutory rule set for a state, falling back to the default state. */
export function resolveStateRules(state?: string | null): StateComplianceRules {
  if (state && STATE_COMPLIANCE_RULES[state]) return STATE_COMPLIANCE_RULES[state];
  return STATE_COMPLIANCE_RULES[DEFAULT_STATE];
}

/**
 * A row from the `compliance_rules` table that drives per-state statutory params.
 * One row per (state, type); `type` is "pt" | "lwf" | "min_wage". `configJson`
 * holds the parameter payload:
 *   - pt:       { "slabs": [{ "upTo": number | null, "amount": number }, ...] }
 *   - lwf:      { "amount": number, "months": number[] }  // months 1-12 the state levies LWF
 *   - min_wage: { "minDailyWage": number, "zoneRates"?: { [zone: string]: number } }
 * `minDailyWage` is the default daily rate (used when a worker's site has no
 * zone, or the zone is missing from `zoneRates`); `zoneRates` optionally maps
 * zone labels (e.g. "Zone 1") to zone-specific daily rates.
 * A `null` (or missing) `upTo` on the final PT slab means "unbounded" (Infinity).
 */
export interface ComplianceRuleInput {
  state: string;
  type: string;
  configJson: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  /** "false" once a payroll-compliance SME has signed off this parameter. */
  isPlaceholder?: string | null;
}

function normalizeDate(d: string): string {
  // Accept "YYYY-MM" (batch month) or "YYYY-MM-DD"; pad month to a full date so
  // lexical comparison against effectiveFrom/effectiveTo is correct.
  return d.length === 7 ? `${d}-01` : d;
}

function parseConfig(json: string): Record<string, unknown> {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

// Pick the rule of a given type with the latest effectiveFrom that is in force as of `asOf`.
function pickEffectiveRule(rows: ComplianceRuleInput[], type: string, asOf: string): ComplianceRuleInput | undefined {
  return rows
    .filter((r) => r.type === type)
    .filter((r) => normalizeDate(r.effectiveFrom) <= asOf && (!r.effectiveTo || normalizeDate(r.effectiveTo) >= asOf))
    .sort((a, b) => (normalizeDate(a.effectiveFrom) < normalizeDate(b.effectiveFrom) ? 1 : -1))[0];
}

function parsePtSlabs(json: string, fallback: PtSlab[]): PtSlab[] {
  const raw = parseConfig(json).slabs;
  if (!Array.isArray(raw) || raw.length === 0) return fallback;
  const slabs: PtSlab[] = [];
  for (const s of raw) {
    if (!s || typeof s !== "object") continue;
    const amount = Number((s as Record<string, unknown>).amount);
    const upToRaw = (s as Record<string, unknown>).upTo;
    const upTo = upToRaw === null || upToRaw === undefined ? Infinity : Number(upToRaw);
    if (Number.isNaN(amount) || Number.isNaN(upTo)) continue;
    const febRaw = (s as Record<string, unknown>).februaryAmount;
    const februaryAmount = febRaw === null || febRaw === undefined ? undefined : Number(febRaw);
    slabs.push(
      februaryAmount !== undefined && !Number.isNaN(februaryAmount)
        ? { upTo, amount, februaryAmount }
        : { upTo, amount },
    );
  }
  if (slabs.length === 0) return fallback;
  return slabs.sort((a, b) => a.upTo - b.upTo);
}

// Parse the LWF levy months ("months": number[]) from a lwf rule's configJson,
// keeping only valid month numbers (1-12). Falls back to the default when the
// field is absent or yields no valid months (e.g. a typo), to avoid silently
// disabling LWF entirely.
function parseLwfMonths(json: string, fallback: number[]): number[] {
  const raw = parseConfig(json).months;
  if (!Array.isArray(raw)) return fallback;
  const months = raw
    .map((m) => Number(m))
    .filter((m) => Number.isInteger(m) && m >= 1 && m <= 12);
  return months.length > 0 ? months : fallback;
}

// Parse optional zone-based min-wage rates ("zoneRates": { [zone]: number }) from
// a min_wage rule's configJson. Invalid entries (blank keys, non-numeric rates)
// are dropped; an empty/missing/malformed map yields undefined so the engine
// falls back to the flat minDailyWage — existing single-value rules keep working.
function parseZoneRates(json: string): Record<string, number> | undefined {
  const raw = parseConfig(json).zoneRates;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const rate = Number(v);
    if (k.trim().length > 0 && Number.isFinite(rate) && rate > 0) out[k] = rate;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolve the minimum daily wage for a worker, honouring the site's zone tag
 * when the state's rule carries zone-based rates. Zone labels are matched
 * case-insensitively (trimmed). No zone / unknown zone / no zone map → the
 * flat `minDailyWage` default.
 */
export function resolveMinDailyWage(rules: StateComplianceRules, zone?: string | null): number {
  if (zone && rules.minWageZones) {
    const norm = zone.trim().toLowerCase();
    for (const [label, rate] of Object.entries(rules.minWageZones)) {
      if (label.trim().toLowerCase() === norm && Number.isFinite(rate)) return rate;
    }
  }
  return rules.minDailyWage;
}

/**
 * Build a per-state rule set from `compliance_rules` rows, effective as of `asOf`
 * (a batch month "YYYY-MM" or full date). DB-configured values override the
 * hardcoded defaults; any parameter without a matching/parseable rule falls back
 * to its default. States seen only in `rows` (not in defaults) are included too.
 */
export function buildStateRulesFromDb(rows: ComplianceRuleInput[], asOf: string): Map<string, StateComplianceRules> {
  const ref = normalizeDate(asOf);
  const states = new Set<string>([...Object.keys(STATE_COMPLIANCE_RULES), ...rows.map((r) => r.state)]);
  const map = new Map<string, StateComplianceRules>();
  for (const state of states) {
    const base = STATE_COMPLIANCE_RULES[state] ?? STATE_COMPLIANCE_RULES[DEFAULT_STATE];
    const stateRows = rows.filter((r) => r.state === state);
    const ptRow = pickEffectiveRule(stateRows, "pt", ref);
    const lwfRow = pickEffectiveRule(stateRows, "lwf", ref);
    const minRow = pickEffectiveRule(stateRows, "min_wage", ref);
    const lwfAmount = lwfRow ? Number(parseConfig(lwfRow.configJson).amount) : NaN;
    const minDailyWage = minRow ? Number(parseConfig(minRow.configJson).minDailyWage) : NaN;
    map.set(state, {
      state,
      ptSlabs: ptRow ? parsePtSlabs(ptRow.configJson, base.ptSlabs) : base.ptSlabs,
      lwfAmount: Number.isFinite(lwfAmount) ? lwfAmount : base.lwfAmount,
      lwfMonths: lwfRow ? parseLwfMonths(lwfRow.configJson, base.lwfMonths) : base.lwfMonths,
      minDailyWage: Number.isFinite(minDailyWage) ? minDailyWage : base.minDailyWage,
      // Zone rates travel with the min_wage rule: when a DB rule is in force it
      // fully defines the zone map (absent zoneRates = flat single-value rule);
      // only fall back to the registry's zones when there is no DB rule at all.
      minWageZones: minRow ? parseZoneRates(minRow.configJson) : base.minWageZones,
      ptConfirmed: ptRow ? ptRow.isPlaceholder === "false" : base.ptConfirmed,
      lwfConfirmed: lwfRow ? lwfRow.isPlaceholder === "false" : base.lwfConfirmed,
      minWageConfirmed: minRow ? minRow.isPlaceholder === "false" : base.minWageConfirmed,
    });
  }
  return map;
}

const PF_RATE = 0.12;
const PF_WAGE_CAP = 15000;
const ESI_EMPLOYEE_RATE = 0.0075;
const ESI_EMPLOYER_RATE = 0.0325;
const ESI_GROSS_CAP = 21000;
const OT_RATE_MULTIPLIER = 2;

export type PfWageBasis = "full_monthly" | "prorated_earned";

export function calculatePayroll(
  salary: SalaryStructure,
  attendance: AttendanceData,
  statutory: StatutoryProfile,
  state: string = DEFAULT_STATE,
  pfWageBasis: PfWageBasis = "prorated_earned",
  overrideRules?: StateComplianceRules,
  payMonth?: string,
  /**
   * Zone tag of the worker's site (e.g. "Zone 1"). Used to resolve zone-based
   * minimum-wage thresholds when the state's min_wage rule carries zoneRates;
   * falls back to the state's flat minDailyWage when absent/unknown.
   */
  siteZone?: string | null
): PayrollResult {
  const trace: PayrollTrace[] = [];
  const lineItems: PayrollResult["lineItems"] = [];

  const rules = overrideRules ?? resolveStateRules(state);
  const resolvedState = rules.state;

  const totalWorkingDays = attendance.totalWorkingDays || 26;
  const presentDays = Math.min(attendance.presentDays, totalWorkingDays);
  const dailyRate = salary.grossMonthly / totalWorkingDays;
  const grossPay = Math.round(presentDays * dailyRate * 100) / 100;

  trace.push({
    step: "Gross Pay",
    formula: "(grossMonthly / totalWorkingDays) × presentDays",
    inputs: { grossMonthly: salary.grossMonthly, totalWorkingDays, presentDays },
    output: grossPay,
    note: salary.wageType === "daily" ? "Daily wage worker" : undefined,
  });

  const dailyOtRate = (dailyRate / 8) * OT_RATE_MULTIPLIER;
  const otAmount = Math.round(attendance.otHours * dailyOtRate * 100) / 100;
  if (otAmount > 0) {
    trace.push({
      step: "OT Amount",
      formula: "(dailyRate / 8) × 2 × otHours",
      inputs: { dailyRate: Math.round(dailyRate * 100) / 100, otHours: attendance.otHours },
      output: otAmount,
    });
    lineItems.push({ componentName: "OT Allowance", componentCode: "OT", componentType: "earning", amount: otAmount });
  }

  const totalGrossWithOt = grossPay + otAmount;

  const basic = salary.basicAmount ?? Math.round(salary.grossMonthly * 0.5 * 100) / 100;
  const hra = salary.hraAmount ?? Math.round(salary.grossMonthly * 0.2 * 100) / 100;

  const basicEarned = Math.round((basic / salary.grossMonthly) * grossPay * 100) / 100;
  const hraEarned = Math.round((hra / salary.grossMonthly) * grossPay * 100) / 100;
  const specialEarned = Math.round((grossPay - basicEarned - hraEarned) * 100) / 100;

  trace.push({
    step: "Basic Earned",
    formula: "(basicMonthly / grossMonthly) × grossPay",
    inputs: { basicMonthly: basic, grossMonthly: salary.grossMonthly, grossPay },
    output: basicEarned,
  });
  trace.push({
    step: "HRA Earned",
    formula: "(hraMonthly / grossMonthly) × grossPay",
    inputs: { hraMonthly: hra, grossMonthly: salary.grossMonthly, grossPay },
    output: hraEarned,
  });

  lineItems.push({ componentName: "Basic", componentCode: "BASIC", componentType: "earning", amount: basicEarned });
  lineItems.push({ componentName: "HRA", componentCode: "HRA", componentType: "earning", amount: hraEarned });
  if (specialEarned > 0) {
    lineItems.push({ componentName: "Special Allowance", componentCode: "SPEC_ALLOW", componentType: "earning", amount: specialEarned });
  }

  const allowances = otAmount;
  const incentives = 0;
  const manualDeductions = 0;

  const pfWageCeiling = Math.min(salary.grossMonthly, PF_WAGE_CAP);
  const attendanceFactor = totalWorkingDays > 0 ? presentDays / totalWorkingDays : 0;
  const pfWage = pfWageBasis === "prorated_earned"
    ? Math.round(pfWageCeiling * attendanceFactor * 100) / 100
    : pfWageCeiling;
  const pfEmployee = statutory.pfEnrolled ? Math.round(pfWage * PF_RATE * 100) / 100 : 0;
  const pfEmployer = statutory.pfEnrolled ? Math.round(pfWage * PF_RATE * 100) / 100 : 0;

  const pfFormula = pfWageBasis === "prorated_earned"
    ? "min(grossMonthly, ₹15,000) × (presentDays / totalWorkingDays) × 12%"
    : "min(grossMonthly, ₹15,000) × 12%";
  const pfBasisNote = pfWageBasis === "prorated_earned"
    ? "PF wage prorated for unpaid-leave (LWP) days: ceiling reduced by present/total ratio so PF reflects wage actually earned this month."
    : "PF wage on full monthly ceiling, NOT prorated for unpaid-leave (LWP) days (entity configured to full_monthly basis).";

  if (statutory.pfEnrolled) {
    trace.push({
      step: "PF Employee",
      formula: pfFormula,
      inputs: pfWageBasis === "prorated_earned"
        ? { pfWageCeiling, presentDays, totalWorkingDays, pfWage, rate: "12%" }
        : { pfWage, rate: "12%" },
      output: pfEmployee,
      note: pfBasisNote,
    });
    trace.push({
      step: "PF Employer",
      formula: pfFormula,
      inputs: pfWageBasis === "prorated_earned"
        ? { pfWageCeiling, presentDays, totalWorkingDays, pfWage, rate: "12%" }
        : { pfWage, rate: "12%" },
      output: pfEmployer,
      note: "Employer contribution equal to employee share (simplified). Does not include admin charges.",
    });
    lineItems.push({ componentName: "PF Employee", componentCode: "PF_EMP", componentType: "deduction", amount: pfEmployee });
    lineItems.push({ componentName: "PF Employer", componentCode: "PF_EMPR", componentType: "employer_contribution", amount: pfEmployer });
  }

  const esi = statutory.esiEnrolled && totalGrossWithOt <= ESI_GROSS_CAP
    ? Math.round(totalGrossWithOt * ESI_EMPLOYEE_RATE * 100) / 100
    : 0;
  const esiEmployer = statutory.esiEnrolled && totalGrossWithOt <= ESI_GROSS_CAP
    ? Math.round(totalGrossWithOt * ESI_EMPLOYER_RATE * 100) / 100
    : 0;

  if (statutory.esiEnrolled) {
    trace.push({
      step: "ESI Employee",
      formula: "grossWithOT × 0.75% (if grossWithOT ≤ ₹21,000)",
      inputs: { grossWithOT: totalGrossWithOt, cap: ESI_GROSS_CAP, rate: "0.75%" },
      output: esi,
      note: totalGrossWithOt > ESI_GROSS_CAP ? "Exempt: gross exceeds ₹21,000 cap." : "PLACEHOLDER – not legally validated.",
    });
    trace.push({
      step: "ESI Employer",
      formula: "grossWithOT × 3.25% (if grossWithOT ≤ ₹21,000)",
      inputs: { grossWithOT: totalGrossWithOt, cap: ESI_GROSS_CAP, rate: "3.25%" },
      output: esiEmployer,
    });
    if (esi > 0) {
      lineItems.push({ componentName: "ESI Employee", componentCode: "ESI_EMP", componentType: "deduction", amount: esi });
      lineItems.push({ componentName: "ESI Employer", componentCode: "ESI_EMPR", componentType: "employer_contribution", amount: esiEmployer });
    }
  }

  let pt = 0;
  if (statutory.ptApplicable) {
    const isFebruary = payMonth ? normalizeDate(payMonth).slice(5, 7) === "02" : false;
    const slab = rules.ptSlabs.find((s) => grossPay <= s.upTo) ?? rules.ptSlabs[rules.ptSlabs.length - 1];
    const februaryApplied = isFebruary && slab?.februaryAmount !== undefined;
    pt = februaryApplied ? slab!.februaryAmount! : (slab?.amount ?? 0);
    trace.push({
      step: "Professional Tax",
      formula: februaryApplied
        ? `${resolvedState} February PT slab on grossPay (higher February levy)`
        : `${resolvedState} PT slab on grossPay`,
      inputs: februaryApplied
        ? { grossPay, state: resolvedState, payMonth: payMonth ?? "", standardAmount: slab?.amount ?? 0 }
        : { grossPay, state: resolvedState },
      output: pt,
      note: rules.ptConfirmed
        ? (februaryApplied
            ? `${resolvedState} February PT (₹${slab!.februaryAmount} vs standard ₹${slab?.amount}). Confirmed by compliance SME.`
            : `${resolvedState} PT slabs. Confirmed by compliance SME.`)
        : (februaryApplied
            ? `PLACEHOLDER – ${resolvedState} February PT (₹${slab!.februaryAmount} vs standard ₹${slab?.amount}). Validate against the state notification schedule.`
            : `PLACEHOLDER – ${resolvedState} PT slabs. Validate against the state notification schedule.`),
    });
    if (pt > 0) {
      lineItems.push({ componentName: "Professional Tax", componentCode: "PT", componentType: "deduction", amount: pt });
    }
  }

  // LWF is periodic, not monthly: it is only levied in the months listed in
  // rules.lwfMonths (Maharashtra Jun+Dec, Karnataka Dec). When no pay month is
  // supplied the month cannot be confirmed, so LWF is not applied (avoids
  // over-deducting). Deducting every month would over-collect ~6-12x.
  const lwfMonthNum = payMonth ? Number(normalizeDate(payMonth).slice(5, 7)) : undefined;
  const lwfMonthApplies = lwfMonthNum !== undefined && rules.lwfMonths.includes(lwfMonthNum);
  const lwf = statutory.lwfApplicable && lwfMonthApplies ? rules.lwfAmount : 0;
  if (statutory.lwfApplicable) {
    const monthsLabel = rules.lwfMonths.length > 0 ? rules.lwfMonths.join(", ") : "none";
    trace.push({
      step: "LWF",
      formula: `${resolvedState} LWF ₹${rules.lwfAmount} levied in month(s) ${monthsLabel}`,
      inputs: { state: resolvedState, payMonth: payMonth ?? "", levyMonths: monthsLabel },
      output: lwf,
      note: !lwfMonthApplies
        ? `Not levied this month: ${resolvedState} deducts LWF only in month(s) ${monthsLabel}.`
        : rules.lwfConfirmed
          ? `${resolvedState} LWF fixed amount. Confirmed by compliance SME.`
          : `PLACEHOLDER – ${resolvedState} fixed amount. Validate against the state LWF schedule.`,
    });
    if (lwf > 0) {
      lineItems.push({ componentName: "LWF", componentCode: "LWF", componentType: "deduction", amount: lwf });
    }
  }

  const totalDeductions = pfEmployee + esi + pt + lwf + manualDeductions;
  const netPay = Math.round((totalGrossWithOt - totalDeductions) * 100) / 100;

  trace.push({
    step: "Total Deductions",
    formula: "PF_Employee + ESI_Employee + PT + LWF + ManualDeductions",
    inputs: { pfEmployee, esi, pt, lwf, manualDeductions },
    output: totalDeductions,
  });

  trace.push({
    step: "Net Pay",
    formula: "grossPay + OT − totalDeductions",
    inputs: { grossPay, otAmount, totalDeductions },
    output: netPay,
  });

  const employerCost = Math.round((totalGrossWithOt + pfEmployer + esiEmployer) * 100) / 100;


  trace.push({
    step: "Employer Cost",
    formula: "grossWithOT + PF_Employer + ESI_Employer",
    inputs: { grossWithOT: totalGrossWithOt, pfEmployer, esiEmployer },
    output: employerCost,
    note: "Total cost to employer. Does not include admin charges, gratuity or bonus.",
  });

  // Zone-resolved minimum daily wage: uses the site's zone rate when the state
  // rule carries zoneRates, otherwise the flat state default.
  const minDailyWage = resolveMinDailyWage(rules, siteZone);
  const zoneApplied = minDailyWage !== rules.minDailyWage || (!!siteZone && !!rules.minWageZones);
  const zoneLabel = zoneApplied && siteZone ? ` (${siteZone.trim()})` : "";
  const minWageThreshold = presentDays > 0
    ? Math.round(minDailyWage * presentDays * 100) / 100
    : 0;
  const belowMinWage = presentDays > 0 && grossPay < minWageThreshold;
  const negativeNetPay = netPay < 0;

  if (belowMinWage) {
    trace.push({
      step: "Minimum Wage Check",
      formula: "grossPay < minDailyWage × presentDays",
      inputs: { grossPay, minDailyWage, presentDays, threshold: minWageThreshold, state: resolvedState, zone: siteZone?.trim() ?? "" },
      output: 0,
      note: rules.minWageConfirmed
        ? `BELOW MINIMUM WAGE. ${resolvedState} unskilled min wage ₹${minDailyWage}/day${zoneLabel} (confirmed by compliance SME).`
        : `BELOW MINIMUM WAGE (placeholder). ${resolvedState} unskilled min wage ~₹${minDailyWage}/day${zoneLabel}. Verify with payroll compliance SME.`,
    });
  }

  if (negativeNetPay) {
    trace.push({
      step: "Negative Net Pay",
      formula: "netPay < 0",
      inputs: { netPay },
      output: netPay,
      note: "Net pay is negative. Review deductions or apply override.",
    });
  }

  return {
    grossPay,
    netPay,
    pfEmployee,
    pfEmployer,
    esi,
    esiEmployer,
    pt,
    lwf,
    otAmount,
    allowances,
    incentives,
    manualDeductions,
    totalDeductions,
    employerCost,
    flags: {
      negativeNetPay,
      belowMinWage,
      minWageThreshold,
      minWageConfirmed: !!rules.minWageConfirmed,
      minDailyWage,
      minWageZoneLabel: zoneLabel,
    },
    lineItems,
    trace,
  };
}
