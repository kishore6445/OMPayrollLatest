import { randomUUID } from "node:crypto";
import type { StatutoryResult } from "./idfy-statutory-service.js";

export interface MeonEsicMockInput {
  esicNumber: string;
  employeeName: string;
}

/**
 * Development/demo-only Meon-shaped ESIC verification mock.
 *
 * This function NEVER calls Meon, ESIC, or any external API. It exists only
 * to exercise the OMpayroll verification workflow until Meon supplies the
 * sandbox credentials and the customer-specific API contract.
 */
export async function verifyEsicWithMeonMock(input: MeonEsicMockInput): Promise<StatutoryResult> {
  const esicNumber = input.esicNumber.replace(/\s/g, "");
  const employeeName = input.employeeName.trim();

  if (!/^\d{10}$/.test(esicNumber)) {
    return {
      kind: "esic",
      status: "NOT_FOUND",
      verified: false,
      provider: "meon-mock-sandbox",
      referenceId: `meon-mock-${randomUUID()}`,
      matchedName: null,
      message: "Invalid ESIC/IP number format. Demo simulation only — no live Meon/ESIC lookup was performed.",
    };
  }

  if (!employeeName) {
    return {
      kind: "esic",
      status: "FAILED",
      verified: false,
      provider: "meon-mock-sandbox",
      referenceId: `meon-mock-${randomUUID()}`,
      matchedName: null,
      message: "Employee name is required for ESIC verification.",
    };
  }

  return {
    kind: "esic",
    status: "VERIFIED",
    verified: true,
    provider: "meon-mock-sandbox",
    referenceId: `meon-mock-${randomUUID()}`,
    matchedName: employeeName,
    message: "Meon ESIC sandbox simulation only — workflow verified; no live ESIC record lookup was performed.",
  };
}
