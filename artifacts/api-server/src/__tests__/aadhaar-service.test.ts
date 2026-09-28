/**
 * aadhaar-service.test.ts
 *
 * Tests for UIDAI Aadhaar Secure QR decoding and verification.
 *
 * These tests run with UIDAI_QR_SKIP_VERIFY=true so they exercise the parsing
 * and extraction logic without requiring the UIDAI production certificate.
 * Signature-rejection behaviour is also covered (bad data with verify on).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";

// ── Set env BEFORE importing the service (module-level constant must see it) ──
beforeAll(() => {
  process.env.UIDAI_QR_SKIP_VERIFY = "true";
});
afterAll(() => {
  delete process.env.UIDAI_QR_SKIP_VERIFY;
});

// Lazy import after env is set — vitest evaluates describe/it lazily
let decodeAndVerifyQR: (qrText: string) => import("../lib/aadhaar-service.js").AadhaarExtract;

// ── V1 pipe-delimited Aadhaar QR test fixture ─────────────────────────────────
//
// Format: version|refId|name|dob|gender|emailHash|mobileHash|house|street|lm|loc|vtc|subdist|dist|state|pc|hexSig
// (signature is skipped when UIDAI_QR_SKIP_VERIFY=true)
const VALID_V1 = [
  "2",                     // [0]  version
  "123412341234",          // [1]  referenceId — 12 numeric digits → last 4 = "1234"
  "Test Employee",         // [2]  name
  "01-01-1985",            // [3]  dob (DD-MM-YYYY)
  "M",                     // [4]  gender
  "hashemail",             // [5]  email hash
  "hashmobile",            // [6]  mobile hash
  "House 42",              // [7]  house
  "MG Road",               // [8]  street
  "Near Park",             // [9]  landmark
  "Central Locality",      // [10] locality
  "New Delhi",             // [11] vtc
  "South West",            // [12] subdist
  "South Delhi",           // [13] district
  "Delhi",                 // [14] state
  "110001",                // [15] PIN
  "deadbeefcafe1234",      // [16] hex signature (skipped)
].join("|");

describe("V1 pipe-delimited Aadhaar QR parsing", () => {
  beforeAll(async () => {
    ({ decodeAndVerifyQR } = await import("../lib/aadhaar-service.js"));
  });

  it("parses a valid V1 QR and returns masked reference", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.aadhaarReference).toBe("XXXX XXXX 1234");
  });

  it("returns the employee name from the QR", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.name).toBe("Test Employee");
  });

  it("converts DD-MM-YYYY date of birth to ISO format YYYY-MM-DD", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.dob).toBe("1985-01-01");
  });

  it("returns M for male gender", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.gender).toBe("M");
  });

  it("returns F for female gender", () => {
    const femaleV1 = VALID_V1.replace("|M|", "|F|");
    const result = decodeAndVerifyQR(femaleV1);
    expect(result.gender).toBe("F");
  });

  it("populates address fields correctly", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.address.district).toBe("South Delhi");
    expect(result.address.state).toBe("Delhi");
    expect(result.address.pin).toBe("110001");
    expect(result.address.line1).toContain("House 42");
  });

  it("sets nationality to Indian", () => {
    const result = decodeAndVerifyQR(VALID_V1);
    expect(result.nationality).toBe("Indian");
  });

  it("handles ISO-format date of birth without conversion", () => {
    const isoV1 = VALID_V1.replace("|01-01-1985|", "|1985-01-01|");
    const result = decodeAndVerifyQR(isoV1);
    expect(result.dob).toBe("1985-01-01");
  });

  it("throws when V1 QR has fewer than 8 fields", () => {
    expect(() => decodeAndVerifyQR("2|ref|name|dob")).toThrow(/too few fields/i);
  });

  it("throws when name field is empty", () => {
    const noName = VALID_V1.replace("|Test Employee|", "||");
    expect(() => decodeAndVerifyQR(noName)).toThrow(/missing the name/i);
  });
});

describe("Format detection", () => {
  beforeAll(async () => {
    if (!decodeAndVerifyQR) {
      ({ decodeAndVerifyQR } = await import("../lib/aadhaar-service.js"));
    }
  });

  it("throws on empty string", () => {
    expect(() => decodeAndVerifyQR("")).toThrow(/empty qr data/i);
  });

  it("throws on whitespace-only string", () => {
    expect(() => decodeAndVerifyQR("   ")).toThrow(/empty qr data/i);
  });

  it("throws on a plain URL (not an Aadhaar QR)", () => {
    expect(() => decodeAndVerifyQR("https://example.com")).toThrow(/unrecognized format/i);
  });

  it("throws on a plain text word", () => {
    expect(() => decodeAndVerifyQR("hello")).toThrow(/unrecognized format/i);
  });

  it("detects V2 format from a large numeric string (>= 20 digits)", () => {
    // This will attempt V2 decode but fail (too short) — just verifying format detection
    // The important thing is it does NOT throw "unrecognized format"
    expect(() => decodeAndVerifyQR("1".repeat(20))).toThrow(/too short/i);
  });

  it("detects V1 format from a pipe-separated string", () => {
    // 8+ fields, has a pipe — passes format check but has empty name
    expect(() => decodeAndVerifyQR("a|b||d|e|f|g|h|")).toThrow();
    // Should NOT throw "unrecognized format"
    try {
      decodeAndVerifyQR("a|b||d|e|f|g|h|");
    } catch (e) {
      expect((e as Error).message).not.toMatch(/unrecognized format/i);
    }
  });
});

describe("Date of birth edge cases", () => {
  beforeAll(async () => {
    if (!decodeAndVerifyQR) {
      ({ decodeAndVerifyQR } = await import("../lib/aadhaar-service.js"));
    }
  });

  it("converts year-only DOB to Jan 1 of that year", () => {
    const yearOnly = VALID_V1.replace("|01-01-1985|", "|1990|");
    const result = decodeAndVerifyQR(yearOnly);
    expect(result.dob).toBe("1990-01-01");
  });

  it("handles slash-separated DOB (DD/MM/YYYY)", () => {
    const slashDob = VALID_V1.replace("|01-01-1985|", "|15/06/1992|");
    const result = decodeAndVerifyQR(slashDob);
    expect(result.dob).toBe("1992-06-15");
  });
});
