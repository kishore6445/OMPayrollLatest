import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { StatutoryResult } from "./idfy-statutory-service.js";

export interface AuthBridgeUanInput {
  uan: string;
  employeeName: string;
  fatherName?: string;
  contactNumber?: string;
  dob?: string;
}

function authHeaders() {
  const username = (process.env.AUTHBRIDGE_USERNAME ?? "").trim();
  const password = process.env.AUTHBRIDGE_PASSWORD ?? "";
  if (!username || !password) throw new Error("AuthBridge credentials are not configured");

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // AuthBridge v1.7 expects yyyymmddhhmmss.
  const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const nonsense = randomBytes(8).toString("hex").toUpperCase();
  const signature = createHash("sha512").update(`${password}|${timestamp}|${nonsense}`).digest("hex").toUpperCase();
  return { username, timestamp, nonsense, signature };
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift() ?? name.trim(), lastName: parts.join(" ") };
}

function parseAuthBridgeResult(raw: any, fallbackReference: string): StatutoryResult {
  const referenceId = String(raw?.requestId ?? raw?.response?.requestId ?? fallbackReference);
  const check = raw?.instantResponse?.response?.checks?.[0] ?? raw?.response?.checks?.[0] ?? null;
  const status = String(check?.status ?? "").trim().toLowerCase();
  const severity = String(check?.severity ?? "").trim().toLowerCase();
  const disposition = String(check?.disposition ?? "").trim().toLowerCase();
  const comments = String(check?.comments ?? check?.Comments ?? raw?.msg ?? "").trim();

  const completed = status === "completed";
  const exactMatch = severity === "clear" && (disposition.includes("exact match") || disposition.includes("match found"));
  const noMatch = severity === "discrepant" || disposition.includes("no match") || disposition.includes("not found");

  if (completed && exactMatch) {
    return { kind: "uan", status: "VERIFIED", verified: true, provider: "authbridge", referenceId, message: comments || "UAN verified by AuthBridge." };
  }
  if (completed && noMatch) {
    return { kind: "uan", status: disposition.includes("not found") || disposition.includes("no match") ? "NOT_FOUND" : "MISMATCH", verified: false, provider: "authbridge", referenceId, message: comments || "AuthBridge could not confirm this UAN." };
  }
  if (raw?.status === "success" && raw?.code === "200" && !check) {
    return { kind: "uan", status: "FAILED", verified: false, provider: "authbridge", referenceId, message: "AuthBridge accepted the request but did not return an instantaneous UAN result." };
  }
  return { kind: "uan", status: "FAILED", verified: false, provider: "authbridge", referenceId, message: comments || "AuthBridge UAN verification did not return a completed result." };
}

export async function verifyUanWithAuthBridge(input: AuthBridgeUanInput): Promise<StatutoryResult> {
  if (!/^\d{12}$/.test(input.uan)) throw new Error("UAN must be exactly 12 digits");
  if (!input.employeeName.trim()) throw new Error("Employee name is required for AuthBridge UAN verification");
  if (!input.fatherName?.trim()) throw new Error("Father / spouse name is required for AuthBridge UAN verification");
  if (!input.contactNumber?.replace(/\D/g, "")) throw new Error("Employee contact number is required for AuthBridge UAN verification");
  if (!input.dob?.trim()) throw new Error("Date of birth is required for AuthBridge UAN verification");

  const apiUrl = (process.env.AUTHBRIDGE_UAN_API_URL ?? "https://authbridge.info/client_api_demo/AuthApi/post_data").trim();
  const locationID = (process.env.AUTHBRIDGE_LOCATION_ID ?? "").trim();
  const processID = (process.env.AUTHBRIDGE_PROCESS_ID ?? "").trim();
  if (!locationID || !processID) throw new Error("AuthBridge location/process IDs are not configured");

  const uniqueID = `ompay-${randomUUID()}`;
  const { firstName, lastName } = splitName(input.employeeName);
  const contactNumber = input.contactNumber.replace(/\D/g, "");
  const sourceVerification = (process.env.AUTHBRIDGE_UAN_SOURCE_VERIFICATION ?? "Employment Verification via UAN").trim();

  const body = {
    uniqueID,
    firstName,
    middleName: "",
    lastName,
    fatherName: input.fatherName.trim(),
    contactNumber,
    DOB: input.dob,
    locationID,
    processID,
    checks: [
      {
        checkUID: 1,
        type: 261,
        sourceVerification,
        sourceAddress: "",
        checkFields: {
          "5743": input.employeeName.trim(),
          "5748": input.uan,
        },
      },
    ],
  };

  const resp = await fetch(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const raw: any = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`AuthBridge UAN verification failed (${resp.status})`);
  if (String(raw?.status ?? "").toLowerCase() !== "success" || String(raw?.code ?? "") !== "200") {
    throw new Error(String(raw?.msg ?? "AuthBridge rejected the UAN verification request"));
  }
  return parseAuthBridgeResult(raw, uniqueID);
}
