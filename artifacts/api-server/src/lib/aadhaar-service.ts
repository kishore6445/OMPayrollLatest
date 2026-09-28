/**
 * aadhaar-service.ts — UIDAI Aadhaar Secure QR decoder + verifier
 *
 * Supported formats:
 *   V2 — big-integer encoded, zlib-compressed XML, RSA-SHA256 signature (current Secure QR)
 *   V1 — pipe-delimited text fields with hex RSA signature (legacy)
 *
 * Security:
 *   - Verifies UIDAI RSA digital signature before returning any data.
 *   - Masks Aadhaar UID to XXXX XXXX NNNN before returning.
 *   - Discards photo bytes entirely.
 *   - Never logs raw QR payload or full Aadhaar UID.
 *
 * Configuration:
 *   UIDAI_QR_CERT        — PEM-encoded UIDAI production public certificate.
 *                          Obtain from https://uidai.gov.in/ecosystem/authentication-devices-documents/about-aadhaar-qr-code-reader.html
 *   UIDAI_QR_SKIP_VERIFY — Set "true" to bypass signature check (dev only).
 *
 * Startup behaviour:
 *   - Development (NODE_ENV ≠ "production"): if UIDAI_QR_CERT is not set,
 *     signature verification is automatically skipped with a warning.
 *   - Production (NODE_ENV = "production"): if UIDAI_QR_CERT is not set and
 *     UIDAI_QR_SKIP_VERIFY ≠ "true", the server throws immediately at startup.
 */

import { inflateRawSync, inflateSync, gunzipSync } from "node:zlib";
import * as forge from "node-forge";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AadhaarExtract {
  aadhaarReference: string; // XXXX XXXX NNNN (masked)
  name: string;
  dob: string;              // YYYY-MM-DD
  gender: "M" | "F";
  nationality: "Indian";
  address: {
    line1: string;
    line2: string;
    district: string;
    state: string;
    pin: string;
  };
}

// ─── Certificate & verification configuration ─────────────────────────────────

const CERT_PEM: string | null = (process.env.UIDAI_QR_CERT ?? "").trim() || null;
const EXPLICIT_SKIP = process.env.UIDAI_QR_SKIP_VERIFY === "true";

// In non-production environments, auto-skip when no cert is configured.
// This lets the feature work immediately in development without any extra setup.
const DEV_AUTO_SKIP = !CERT_PEM && process.env.NODE_ENV !== "production";

/** Returns true if signature verification should be skipped for this request. */
export function isSkipVerify(): boolean {
  return EXPLICIT_SKIP || (!CERT_PEM && process.env.NODE_ENV !== "production");
}

// ── Startup guards ────────────────────────────────────────────────────────────

if (EXPLICIT_SKIP) {
  logger.warn(
    "UIDAI_QR_SKIP_VERIFY=true — Aadhaar signature verification is DISABLED. NEVER enable in production.",
  );
} else if (DEV_AUTO_SKIP) {
  logger.warn(
    "UIDAI_QR_CERT is not set — Aadhaar signature verification is auto-skipped in development. " +
    "Set UIDAI_QR_CERT to the UIDAI public certificate PEM before deploying to production.",
  );
} else if (!CERT_PEM && process.env.NODE_ENV === "production") {
  throw new Error(
    "UIDAI_QR_CERT environment variable is required in production. " +
    "Obtain the PEM-encoded UIDAI public certificate from:\n" +
    "  https://uidai.gov.in/ecosystem/authentication-devices-documents/about-aadhaar-qr-code-reader.html\n" +
    "Set it as the UIDAI_QR_CERT secret in your deployment environment. " +
    "For development only, set UIDAI_QR_SKIP_VERIFY=true to bypass verification.",
  );
}

// Warn if cert is configured but close to expiry
if (CERT_PEM) {
  try {
    const cert = forge.pki.certificateFromPem(CERT_PEM);
    const notAfter = (cert.validity as { notAfter: Date }).notAfter;
    const daysLeft = (notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysLeft < 0) {
      logger.error("UIDAI_QR_CERT has EXPIRED — update UIDAI_QR_CERT immediately");
    } else if (daysLeft < 30) {
      logger.warn({ daysLeft: Math.round(daysLeft) }, "UIDAI_QR_CERT expires soon — plan cert rotation");
    }
  } catch (e) {
    throw new Error("UIDAI_QR_CERT is not a valid PEM certificate: " + (e as Error).message);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bigIntToBuffer(decimal: string): Buffer {
  const hex = BigInt(decimal.trim()).toString(16);
  return Buffer.from(hex.length % 2 === 0 ? hex : "0" + hex, "hex");
}

function maskUid(uid: string): string {
  const digits = uid.replace(/\D/g, "");
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function parseDob(raw: string): string {
  // Accepts DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD, or just YYYY
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  if (iso) return raw;
  const parts = raw.split(/[-/]/);
  if (parts.length === 3) {
    const [a, b, c] = parts;
    // DD-MM-YYYY → YYYY-MM-DD
    if ((c?.length ?? 0) === 4) return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
  }
  // Only year (some older QRs)
  if (/^\d{4}$/.test(raw)) return `${raw}-01-01`;
  return raw; // return as-is and let the form handle it
}

function normalizeGender(g: string): "M" | "F" {
  const u = (g ?? "").toUpperCase();
  return u.startsWith("F") ? "F" : "M";
}

function extractXmlAttrs(xml: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /\s(\w+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

function buildExtract(attrs: Record<string, string>): AadhaarExtract {
  const uid = attrs.uid ?? "";
  const name = (attrs.name ?? "").trim();
  if (!name) throw new Error("Aadhaar QR is missing the name field");

  const parts = [
    attrs.house,
    attrs.street,
    attrs.lm,      // landmark
    attrs.loc,     // locality
    attrs.vtc,     // village / town / city
    attrs.subdist,
  ].filter(Boolean) as string[];

  const line1 = parts.slice(0, 3).join(", ").slice(0, 200);
  const line2 = parts.slice(3).join(", ").slice(0, 200);

  return {
    aadhaarReference: maskUid(uid),
    name,
    dob: parseDob(attrs.dob ?? attrs.yob ?? ""),
    gender: normalizeGender(attrs.gender ?? "M"),
    nationality: "Indian",
    address: {
      line1,
      line2,
      district: (attrs.dist ?? "").slice(0, 30),
      state: (attrs.state ?? "").slice(0, 20),
      pin: (attrs.pc ?? "").slice(0, 10),
    },
  };
}

// ─── Signature verification ───────────────────────────────────────────────────

function verifyRsaSha256(data: Buffer, signature: Buffer): boolean {
  if (isSkipVerify()) return true;
  try {
    const cert = forge.pki.certificateFromPem(CERT_PEM!);
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    const md = forge.md.sha256.create();
    md.update(data.toString("binary"));
    return publicKey.verify(md.digest().bytes(), signature.toString("binary"));
  } catch (e: unknown) {
    throw new Error("Signature verification error: " + (e as Error).message);
  }
}

function verifyRsaSha1(data: Buffer, signature: Buffer): boolean {
  if (isSkipVerify()) return true;
  try {
    const cert = forge.pki.certificateFromPem(CERT_PEM!);
    const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
    const md = forge.md.sha1.create();
    md.update(data.toString("binary"));
    return publicKey.verify(md.digest().bytes(), signature.toString("binary"));
  } catch (e: unknown) {
    throw new Error("V1 signature verification error: " + (e as Error).message);
  }
}

// ─── V2 Secure QR (big-integer, zlib-compressed XML) ─────────────────────────

function decodeV2(qrText: string): AadhaarExtract {
  const buf = bigIntToBuffer(qrText);
  if (buf.length < 260) throw new Error("QR data too short — not a valid Aadhaar Secure QR");

  const signature = buf.subarray(buf.length - 256);
  const dataBuf   = buf.subarray(0, buf.length - 256);

  if (!isSkipVerify()) {
    const ok = verifyRsaSha256(dataBuf, signature);
    if (!ok) throw new Error("UIDAI digital signature verification failed — QR may be tampered or cert mismatch");
  }

  let xml = "";
  const strategies: Array<() => Buffer> = [
    () => inflateRawSync(dataBuf),
    () => inflateSync(dataBuf),
    () => gunzipSync(dataBuf),
    () => inflateRawSync(dataBuf.subarray(2)),
    () => inflateRawSync(dataBuf.subarray(1)),
  ];

  for (const fn of strategies) {
    try { xml = fn().toString("utf8"); break; } catch { /* try next */ }
  }

  if (!xml) throw new Error("Failed to decompress Aadhaar Secure QR data");
  if (!xml.includes("PrintLetterBarcodeData")) {
    throw new Error("Not an Aadhaar Secure QR — unexpected content after decompression");
  }

  return buildExtract(extractXmlAttrs(xml));
}

// ─── V1 pipe-delimited QR ─────────────────────────────────────────────────────

function decodeV1(qrText: string): AadhaarExtract {
  const parts = qrText.split("|");
  if (parts.length < 8) throw new Error("Not a valid Aadhaar V1 QR — too few fields");

  const hexSig = parts[parts.length - 1] ?? "";
  if (!hexSig) throw new Error("Aadhaar V1 QR missing signature");

  const signature = Buffer.from(hexSig, "hex");
  const signedStr = parts.slice(0, -1).join("|") + "|";

  if (!isSkipVerify()) {
    let ok = false;
    try { ok = verifyRsaSha256(Buffer.from(signedStr, "utf8"), signature); } catch { /* fall through */ }
    if (!ok) {
      try { ok = verifyRsaSha1(Buffer.from(signedStr, "utf8"), signature); } catch { /* fall through */ }
    }
    if (!ok) throw new Error("UIDAI V1 digital signature verification failed");
  }

  // V1 field layout:
  // [0]=version [1]=referenceId [2]=name [3]=dob [4]=gender
  // [5]=email_hash [6]=mobile_hash
  // [7]=house [8]=street [9]=lm [10]=loc [11]=vtc [12]=subdist [13]=dist [14]=state [15]=pc [last]=sig
  const refId = parts[1] ?? "";
  const name  = (parts[2] ?? "").trim();
  if (!name) throw new Error("Aadhaar QR is missing the name field");
  const addr  = [parts[7], parts[8], parts[9], parts[10], parts[11], parts[12]].filter(Boolean) as string[];

  return {
    aadhaarReference: maskUid(refId),
    name,
    dob:     parseDob(parts[3] ?? ""),
    gender:  normalizeGender(parts[4] ?? "M"),
    nationality: "Indian",
    address: {
      line1:    addr.slice(0, 3).join(", ").slice(0, 200),
      line2:    addr.slice(3).join(", ").slice(0, 200),
      district: (parts[13] ?? "").slice(0, 30),
      state:    (parts[14] ?? "").slice(0, 20),
      pin:      (parts[15] ?? "").slice(0, 10),
    },
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Decode and verify an Aadhaar QR string (camera or extracted from file).
 * Throws on invalid/tampered QR. Never logs raw payload.
 */
export function decodeAndVerifyQR(qrText: string): AadhaarExtract {
  const text = qrText.trim();
  if (!text) throw new Error("Empty QR data");

  if (/^\d{20,}$/.test(text)) {
    return decodeV2(text);
  } else if (text.includes("|")) {
    return decodeV1(text);
  } else {
    throw new Error("Not an Aadhaar Secure QR — unrecognized format");
  }
}
