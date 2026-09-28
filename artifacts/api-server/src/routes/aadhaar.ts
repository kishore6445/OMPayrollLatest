/**
 * aadhaar.ts — UIDAI Aadhaar Secure QR verification endpoints
 *
 * POST /api/aadhaar/verify-qr      — verify a camera-decoded QR string
 * POST /api/aadhaar/extract-upload — extract + verify QR from JPEG / PNG / PDF file
 *
 * Both endpoints require workers:write permission (Admin or HR Manager only).
 * Consent metadata is read from X-Aadhaar-Consent header and logged.
 * Raw QR payload and Aadhaar UID are NEVER logged or echoed in responses.
 */

import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import {
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission,
} from "../lib/client-auth.js";
import { decodeAndVerifyQR, isSkipVerify } from "../lib/aadhaar-service.js";
import { extractAadhaarWithIdfy } from "../lib/idfy-aadhaar.js";
import { decodeQRFromImageBuffer, decodeQRFromPDFBuffer } from "../lib/aadhaar-qr-reader.js";
import { logger } from "../lib/logger.js";
import { queryOne, execute } from "@workspace/pg-client-db";
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  aadhaarFaceMode, aadhaarHash, getFaceRdCaptureRequest, isUidaiPublicTestAadhaar, isValidAadhaar, maskAadhaar, normalizeAadhaar, startFaceAuthentication, submitFaceRdPayload, uidaiPublicTestAadhaars,
} from "../lib/aadhaar-face-service.js";
import { startAadhaarDigilocker, completeAadhaarDigilocker } from "../lib/meon-digilocker-service.js";

const router: IRouter = Router();

const canWrite = [
  requireClientAuth,
  requirePasswordChanged,
  requireClientPermission("workers", "write"),
];

// ── Multer file upload (memory storage, 5 MB cap, JPEG/PNG/PDF only) ─────────

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Upload a JPEG, PNG, or PDF.`));
    }
  },
});

function multerMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "File too large — maximum 5 MB" });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

function idfyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  upload.fields([
    { name: "front", maxCount: 1 },
    { name: "back", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ])(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Aadhaar image too large — maximum 5 MB per side" });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

// ── Consent logging (no Aadhaar reference in log) ────────────────────────────

interface ConsentRecord {
  timestamp?: string;
  method?: string;
  purpose?: string;
}

function parseConsent(req: Request): ConsentRecord {
  const raw = req.headers["x-aadhaar-consent"];
  if (!raw || typeof raw !== "string") return {};
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as ConsentRecord;
  } catch {
    return {};
  }
}

function logConsent(req: Request, method: string): void {
  const consent = parseConsent(req);
  const userId = (req as Request & { clientUser?: { id: number; username: string } }).clientUser?.id ?? "unknown";
  const username = (req as Request & { clientUser?: { id: number; username: string } }).clientUser?.username ?? "unknown";
  logger.info(
    {
      event: "aadhaar_consent",
      userId,
      username,
      method: consent.method ?? method,
      purpose: consent.purpose ?? "EMPLOYEE_ONBOARDING",
      consentTimestamp: consent.timestamp ?? new Date().toISOString(),
      // aadhaarReference intentionally omitted from log
    },
    "Aadhaar consent recorded for employee onboarding",
  );
}


// ── Meon DigiLocker Aadhaar ─────────────────────────────────────────────────
router.post("/aadhaar/digilocker/start", ...canWrite, async (req: Request, res: Response) => {
  try {
    const userId = (req as Request & { clientUser?: { id: number } }).clientUser!.id;
    const result = await startAadhaarDigilocker(userId);
    logConsent(req, "MEON_DIGILOCKER_AADHAAR");
    res.json(result);
  } catch (err) {
    logger.warn({ event: "meon_aadhaar_start_failed", err: err instanceof Error ? err.message : String(err) }, "Meon Aadhaar DigiLocker start failed");
    res.status(422).json({ error: err instanceof Error ? err.message : "Unable to start Aadhaar DigiLocker" });
  }
});

router.post("/aadhaar/digilocker/complete", ...canWrite, async (req: Request, res: Response) => {
  const sessionToken = String((req.body as any)?.sessionToken ?? "").trim();
  if (!sessionToken) { res.status(400).json({ error: "sessionToken is required" }); return; }
  try {
    const userId = (req as Request & { clientUser?: { id: number } }).clientUser!.id;
    const data = await completeAadhaarDigilocker(sessionToken, userId);
    logger.info({ event: "meon_aadhaar_complete", userId }, "Aadhaar fetched from Meon DigiLocker");
    res.json({ verified: true, provider: "meon-digilocker", source: "DIGILOCKER", data });
  } catch (err) {
    logger.warn({ event: "meon_aadhaar_complete_failed", err: err instanceof Error ? err.message : String(err) }, "Meon Aadhaar DigiLocker completion failed");
    res.status(422).json({ error: err instanceof Error ? err.message : "Unable to fetch Aadhaar data" });
  }
});

// ── POST /api/aadhaar/verify-qr ───────────────────────────────────────────────
//
// Accepts camera-decoded QR payload in two equivalent forms:
//   { qrData }                  — legacy, plain text string (backward-compat)
//   { qrText, qrPayloadBase64 } — new: prefers raw bytes for V2 Secure QR
//
// qrPayloadBase64 carries the raw bytes from the QR decoder (result.getRawBytes()).
// For Aadhaar V2, these are the UTF-8 bytes of the large decimal string — functionally
// the same as qrText but forwarded verbatim to avoid any string transcoding loss.

router.post("/aadhaar/verify-qr", ...canWrite, async (req: Request, res: Response) => {
  const body = req.body as { qrData?: unknown; qrText?: unknown; qrPayloadBase64?: unknown };

  // Resolve the QR text: prefer raw bytes decoded from base64 payload, fall back to plain text
  let qrText: string | null = null;

  if (body.qrPayloadBase64 && typeof body.qrPayloadBase64 === "string") {
    try {
      // Decode base64 → Buffer → UTF-8 string (preserves original byte stream from decoder)
      qrText = Buffer.from(body.qrPayloadBase64, "base64").toString("utf8").trim();
    } catch {
      qrText = null;
    }
  }

  // Fall back to explicit qrText or legacy qrData
  if (!qrText) {
    const candidate = body.qrText ?? body.qrData;
    qrText = (typeof candidate === "string" ? candidate : null);
  }

  if (!qrText || qrText.trim().length === 0) {
    res.status(400).json({ error: "qrData (or qrText) is required and must be a non-empty string" });
    return;
  }
  if (qrText.length > 100_000) {
    res.status(400).json({ error: "qrData too large" });
    return;
  }

  logConsent(req, "CAMERA_QR");

  try {
    const extract = decodeAndVerifyQR(qrText);
    res.json({
      verified: true,
      source: "AADHAAR_SECURE_QR",
      authenticity: isSkipVerify() ? "AUTHENTICITY_NOT_VERIFIED" : "UIDAI_VERIFIED",
      signatureVerified: !isSkipVerify(),
      data: extract,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message;
    logger.warn({ event: "aadhaar_verify_failed", err: msg }, "Aadhaar QR verification failed");
    res.status(422).json({ error: msg });
  }
});

// ── POST /api/aadhaar/extract-upload ─────────────────────────────────────────

router.post(
  "/aadhaar/extract-upload",
  ...canWrite,
  multerMiddleware,
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Include a JPEG, PNG, or PDF in the 'file' field." });
      return;
    }

    const { mimetype, buffer } = req.file;
    const method = mimetype === "application/pdf" ? "UPLOAD_PDF" : "UPLOAD_IMAGE";

    logConsent(req, method);

    try {
      let qrText: string;

      if (mimetype === "application/pdf") {
        qrText = await decodeQRFromPDFBuffer(buffer);
      } else {
        qrText = await decodeQRFromImageBuffer(buffer, mimetype);
      }

      const extract = decodeAndVerifyQR(qrText);
      res.json({
      verified: true,
      source: "AADHAAR_SECURE_QR",
      authenticity: isSkipVerify() ? "AUTHENTICITY_NOT_VERIFIED" : "UIDAI_VERIFIED",
      signatureVerified: !isSkipVerify(),
      data: extract,
    });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      logger.warn({ event: "aadhaar_upload_failed", mimeType: mimetype, err: msg }, "Aadhaar upload extraction failed");
      res.status(422).json({ error: msg });
    }
  },
);


// ── POST /api/aadhaar/extract-idfy ───────────────────────────────────────────
//
// Captured Aadhaar front + optional back images -> one IDfy Aadhaar OCR task.
// API credentials remain on the backend. The raw IDfy response is never exposed.

router.post(
  "/aadhaar/extract-idfy",
  ...canWrite,
  idfyMiddleware,
  async (req: Request, res: Response) => {
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const front = files?.front?.[0];
    const back = files?.back?.[0];

    // Backward compatibility: also accept the old single `file` field.
    const legacy = files?.file?.[0];
    const frontFile = front ?? legacy;

    if (!frontFile) {
      res.status(400).json({ error: "No Aadhaar front image uploaded." });
      return;
    }

    if (frontFile.mimetype === "application/pdf" || back?.mimetype === "application/pdf") {
      res.status(400).json({ error: "IDfy Aadhaar OCR requires JPEG or PNG images." });
      return;
    }

    logConsent(req, "IDFY_AADHAAR_OCR");

    try {
      const data = await extractAadhaarWithIdfy(
        frontFile.buffer,
        frontFile.mimetype,
        back?.buffer,
        back?.mimetype,
      );
      res.json({
        verified: true,
        source: back ? "IDFY_AADHAAR_OCR_BOTH_SIDES" : "IDFY_AADHAAR_OCR",
        authenticity: "OCR_ONLY",
        signatureVerified: false,
        data,
      });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      logger.warn({ event: "aadhaar_idfy_failed", err: msg }, "IDfy Aadhaar extraction failed");
      res.status(422).json({ error: msg });
    }
  },
);

// ── POST /api/aadhaar/decode-captured-qr ──────────────────────────────────────
//
// Receives a cropped QR image (JPEG or PNG) captured from the camera guide frame.
// Attempts QR decoding server-side using sharp (preprocessing) + jsQR.
// Returns only { qrText } — no Aadhaar data, no UIDAI verification here.
// The caller passes qrText to verify-qr to complete the Aadhaar verification.
//
// Security notes:
//   - Multer memoryStorage: no data written to disk, deleted automatically after response
//   - Image must be <5 MB and JPEG or PNG only (no PDF — this is a captured crop)
//   - Response contains only the raw QR payload string; never Aadhaar fields or UID

const uploadCrop = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = ["image/jpeg", "image/png"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("decode-captured-qr only accepts JPEG or PNG — this is a captured frame crop."));
    }
  },
});

function multerCropMiddleware(req: Request, res: Response, next: NextFunction): void {
  uploadCrop.single("file")(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: "Crop too large — maximum 5 MB" });
      return;
    }
    if (err instanceof Error) {
      res.status(400).json({ error: err.message });
      return;
    }
    next();
  });
}

router.post(
  "/aadhaar/decode-captured-qr",
  ...canWrite,
  multerCropMiddleware,
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: "No file uploaded. Include a JPEG or PNG crop in the 'file' field." });
      return;
    }

    const { mimetype, buffer } = req.file;

    try {
      // Use the same sharp+jsQR pipeline as the image upload path.
      // No temp file is created; buffer is held only in memory for this request.
      const qrText = await decodeQRFromImageBuffer(buffer, mimetype);

      // Return only the raw QR text — caller sends it to verify-qr for Aadhaar verification.
      // Buffer goes out of scope here; Node.js GC reclaims it.
      res.json({ qrText });
    } catch (err: unknown) {
      const msg = (err as Error).message;
      logger.warn(
        { event: "aadhaar_capture_decode_failed", err: msg },
        "Backend QR decode of captured crop failed",
      );
      // 200 with null so the frontend knows to show the retry UI rather than treating this as an auth/permission error
      res.json({ qrText: null, error: msg });
    }
  },
);


// ── Aadhaar Face Authentication (Face RD / AUA provider handoff) ─────────────

type FaceSessionRow = {
  id: string;
  user_id: number;
  emp_code: string | null;
  aadhaar_hash: string;
  aadhaar_last4: string;
  status: "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";
  provider_session_id: string | null;
  provider_txn_id: string | null;
  created_at: Date;
  expires_at: Date;
  verified_at: Date | null;
  failure_code: string | null;
  failure_message: string | null;
  mobile_token_hash: string | null;
  mobile_claimed_at: Date | null;
  mobile_completed_at: Date | null;
};

function publicBaseUrl(req: Request): string {
  const configured = process.env.PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost").split(",")[0].trim();
  return `${proto}://${host}`;
}

function constantTimeSecretMatch(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function mobileTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mobileTokenFromRequest(req: Request): string {
  return String(req.headers["x-ompay-face-token"] ?? req.query.token ?? "").trim();
}


router.get("/aadhaar/face/test-config", ...canWrite, (_req: Request, res: Response) => {
  const mode = aadhaarFaceMode();
  res.json({
    mode,
    uidaiTestAadhaars: mode === "uidai_test" ? uidaiPublicTestAadhaars() : [],
    authUrl: mode === "uidai_test" ? (process.env.UIDAI_TEST_AUTH_URL || "https://developer.uidai.gov.in/authserver/2.5") : null,
    auaCode: mode === "uidai_test" ? (process.env.UIDAI_TEST_AUA_CODE || "public") : null,
    subAuaCode: mode === "uidai_test" ? (process.env.UIDAI_TEST_SUB_AUA_CODE || "public") : null,
    faceRdRequestConfigured: mode === "uidai_test" ? Boolean((process.env.UIDAI_TEST_FACE_RD_REQUEST || "").trim()) : null,
    authProxyConfigured: mode === "uidai_test" ? Boolean((process.env.UIDAI_TEST_AUTH_PROXY_URL || "").trim()) : null,
  });
});

router.post("/aadhaar/face/start", ...canWrite, async (req: Request, res: Response) => {
  const body = req.body as { aadhaarNumber?: unknown; empCode?: unknown; consent?: unknown };
  const aadhaarNumber = normalizeAadhaar(String(body.aadhaarNumber ?? ""));
  const consent = body.consent === true;
  if (!consent) {
    res.status(400).json({ error: "Explicit Aadhaar authentication consent is required" });
    return;
  }
  if (!isValidAadhaar(aadhaarNumber)) {
    res.status(400).json({ error: "Enter a valid 12-digit Aadhaar number" });
    return;
  }
  if (aadhaarFaceMode() === "uidai_test") {
    const allowReal = (process.env.UIDAI_TEST_ALLOW_REAL_AADHAAR || "false").toLowerCase() === "true";
    if (!allowReal && !isUidaiPublicTestAadhaar(aadhaarNumber)) {
      res.status(400).json({ error: "UIDAI test mode accepts only UIDAI-published test Aadhaar numbers." });
      return;
    }
  }

  const user = req.clientUser!;
  const sessionId = randomUUID();
  const purpose = "EMPLOYEE_ONBOARDING";
  const consentAt = new Date();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const baseUrl = publicBaseUrl(req);
  const callbackUrl = `${baseUrl}/api/aadhaar/face/provider-callback`;
  const mobileToken = randomBytes(32).toString("base64url");

  try {
    const provider = await startFaceAuthentication({
      aadhaarNumber, sessionId, callbackUrl, purpose,
    });

    await execute(
      `INSERT INTO aadhaar_face_sessions
       (id, user_id, emp_code, aadhaar_hash, aadhaar_last4, status, provider_session_id, purpose, consent_at, expires_at, mobile_token_hash)
       VALUES ($1,$2,$3,$4,$5,'PENDING',$6,$7,$8,$9,$10)`,
      [
        sessionId, user.id, String(body.empCode ?? "").trim() || null,
        aadhaarHash(aadhaarNumber), aadhaarNumber.slice(-4), provider.providerSessionId,
        purpose, consentAt, expiresAt, mobileTokenHash(mobileToken),
      ],
    );

    logger.info({
      event: "aadhaar_face_started", userId: user.id, sessionId, mode: aadhaarFaceMode(),
      aadhaarMasked: maskAadhaar(aadhaarNumber), purpose,
    }, "Aadhaar Face authentication session started");

    res.status(201).json({
      sessionId, status: "PENDING", aadhaarMasked: maskAadhaar(aadhaarNumber),
      handoffUrl: `ompayroll://aadhaar-face?session=${encodeURIComponent(sessionId)}&token=${encodeURIComponent(mobileToken)}&baseUrl=${encodeURIComponent(baseUrl)}`,
      providerHandoffUrl: provider.providerHandoffUrl ?? null,
      expiresAt: expiresAt.toISOString(), mode: aadhaarFaceMode(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to start Aadhaar Face authentication";
    logger.warn({ event: "aadhaar_face_start_failed", userId: user.id, err: message }, message);
    res.status(502).json({ error: message });
  }
});

router.get("/aadhaar/face/:sessionId", ...canWrite, async (req: Request, res: Response) => {
  const user = req.clientUser!;
  const row = await queryOne<FaceSessionRow>(
    `SELECT * FROM aadhaar_face_sessions WHERE id = $1 AND user_id = $2`,
    [req.params.sessionId, user.id],
  );
  if (!row) { res.status(404).json({ error: "Verification session not found" }); return; }

  let status = row.status;
  if (status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`, [row.id]);
    status = "EXPIRED";
  }

  res.json({
    sessionId: row.id, status, aadhaarMasked: `XXXXXXXX${row.aadhaar_last4}`,
    verifiedAt: row.verified_at ?? null, providerTxnId: row.provider_txn_id ?? null,
    error: status === "FAILED" ? (row.failure_message ?? "Face authentication failed") : null,
    mode: aadhaarFaceMode(),
  });
});


/**
 * Android companion endpoint. It is authenticated with a random, short-lived token embedded in
 * the handoff QR. It never returns the Aadhaar number; only the masked identifier and expiry.
 */
router.get("/aadhaar/face/mobile/:sessionId", async (req: Request, res: Response) => {
  const token = mobileTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Mobile handoff token is required" }); return; }
  const row = await queryOne<FaceSessionRow>(`SELECT * FROM aadhaar_face_sessions WHERE id=$1`, [req.params.sessionId]);
  if (!row || !row.mobile_token_hash || !constantTimeSecretMatch(mobileTokenHash(token), row.mobile_token_hash)) {
    res.status(401).json({ error: "Invalid mobile handoff" }); return;
  }
  if (row.status === "PENDING" && new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`, [row.id]);
    res.status(410).json({ sessionId: row.id, status: "EXPIRED" }); return;
  }
  await execute(`UPDATE aadhaar_face_sessions SET mobile_claimed_at=COALESCE(mobile_claimed_at,NOW()) WHERE id=$1`, [row.id]);
  res.json({
    sessionId: row.id,
    status: row.status,
    aadhaarMasked: `XXXXXXXX${row.aadhaar_last4}`,
    expiresAt: row.expires_at,
    purpose: "EMPLOYEE_ONBOARDING",
    mode: aadhaarFaceMode(),
  });
});

/**
 * Supplies the opaque Face RD capture request created by the authorized provider. OMpayroll does
 * not manufacture PID options/transaction parameters because those are provider/UIDAI contract data.
 */
router.get("/aadhaar/face/mobile/:sessionId/rd-request", async (req: Request, res: Response) => {
  const token = mobileTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Mobile handoff token is required" }); return; }
  const row = await queryOne<FaceSessionRow>(`SELECT * FROM aadhaar_face_sessions WHERE id=$1`, [req.params.sessionId]);
  if (!row || !row.mobile_token_hash || !constantTimeSecretMatch(mobileTokenHash(token), row.mobile_token_hash)) {
    res.status(401).json({ error: "Invalid mobile handoff" }); return;
  }
  if (row.status !== "PENDING") { res.status(409).json({ error: `Session is ${row.status}` }); return; }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`, [row.id]);
    res.status(410).json({ error: "Session expired" }); return;
  }
  if (!row.provider_session_id) { res.status(409).json({ error: "Provider session is not initialized" }); return; }
  try {
    const request = await getFaceRdCaptureRequest(row.provider_session_id);
    res.json({ request });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to create Face RD request";
    res.status(502).json({ error: message });
  }
});

/**
 * Receives the opaque encrypted PID/result produced by Aadhaar Face RD on Android and immediately
 * forwards it to the configured AUA/Sub-AUA provider. The biometric payload is never stored.
 */
router.post("/aadhaar/face/mobile/:sessionId/rd-result", async (req: Request, res: Response) => {
  const token = mobileTokenFromRequest(req);
  if (!token) { res.status(401).json({ error: "Mobile handoff token is required" }); return; }
  const row = await queryOne<FaceSessionRow>(`SELECT * FROM aadhaar_face_sessions WHERE id=$1`, [req.params.sessionId]);
  if (!row || !row.mobile_token_hash || !constantTimeSecretMatch(mobileTokenHash(token), row.mobile_token_hash)) {
    res.status(401).json({ error: "Invalid mobile handoff" }); return;
  }
  if (row.status !== "PENDING") { res.json({ status: row.status }); return; }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1 AND status='PENDING'`, [row.id]);
    res.status(410).json({ status: "EXPIRED" }); return;
  }

  const faceRdPayload = String((req.body as { faceRdPayload?: unknown }).faceRdPayload ?? "").trim();
  if (!faceRdPayload || faceRdPayload.length > 2_000_000) {
    res.status(400).json({ error: "A valid Face RD payload is required" }); return;
  }
  if (!row.provider_session_id) { res.status(409).json({ error: "Provider session is not initialized" }); return; }

  try {
    const result = await submitFaceRdPayload({
      providerSessionId: row.provider_session_id,
      merchantSessionId: row.id,
      faceRdPayload,
    });
    // Never log or persist faceRdPayload.
    if (result.status === "VERIFIED" || result.status === "FAILED") {
      await execute(
        `UPDATE aadhaar_face_sessions SET status=$2, provider_txn_id=$3, verified_at=$4,
         failure_code=$5, failure_message=$6, mobile_completed_at=NOW(), mobile_token_hash=NULL
         WHERE id=$1 AND status='PENDING'`,
        [row.id, result.status, result.transactionId ?? null, result.status === "VERIFIED" ? new Date() : null,
         result.status === "FAILED" ? (result.errorCode ?? null) : null,
         result.status === "FAILED" ? (result.errorMessage ?? "Face authentication failed") : null],
      );
    } else {
      await execute(`UPDATE aadhaar_face_sessions SET mobile_completed_at=NOW() WHERE id=$1`, [row.id]);
    }
    res.json({ status: result.status, transactionId: result.transactionId ?? null,
      errorCode: result.errorCode ?? null, errorMessage: result.errorMessage ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unable to submit Face RD result";
    logger.warn({ event: "aadhaar_face_mobile_submit_failed", sessionId: row.id, err: message }, message);
    res.status(502).json({ error: message });
  }
});

/**
 * Provider callback. Configure AADHAAR_FACE_CALLBACK_SECRET with the AUA/Sub-AUA partner
 * and have the partner send the same value in X-Aadhaar-Face-Secret.
 */
router.post("/aadhaar/face/provider-callback", async (req: Request, res: Response) => {
  const expected = process.env.AADHAAR_FACE_CALLBACK_SECRET;
  const actual = String(req.headers["x-aadhaar-face-secret"] ?? "");
  if (!expected || !constantTimeSecretMatch(actual, expected)) {
    res.status(401).json({ error: "Invalid callback authentication" });
    return;
  }

  const body = req.body as {
    merchantSessionId?: unknown; sessionId?: unknown; providerSessionId?: unknown;
    status?: unknown; verified?: unknown; transactionId?: unknown; errorCode?: unknown; errorMessage?: unknown;
  };
  const sessionId = String(body.merchantSessionId ?? body.sessionId ?? "").trim();
  if (!sessionId) { res.status(400).json({ error: "sessionId is required" }); return; }

  const existing = await queryOne<FaceSessionRow>(`SELECT * FROM aadhaar_face_sessions WHERE id=$1`, [sessionId]);
  if (!existing) { res.status(404).json({ error: "Session not found" }); return; }
  if (existing.status !== "PENDING") { res.json({ ok: true, status: existing.status }); return; }
  if (new Date(existing.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1`, [sessionId]);
    res.json({ ok: true, status: "EXPIRED" });
    return;
  }

  const normalizedStatus = String(body.status ?? "").toUpperCase();
  const verified = body.verified === true || ["SUCCESS", "VERIFIED", "Y", "YES"].includes(normalizedStatus);
  const failed = body.verified === false || ["FAILED", "FAILURE", "N", "NO"].includes(normalizedStatus);
  if (!verified && !failed) { res.status(400).json({ error: "Callback must contain a terminal verification status" }); return; }

  await execute(
    `UPDATE aadhaar_face_sessions
       SET status=$2, provider_txn_id=$3, verified_at=$4, failure_code=$5, failure_message=$6
     WHERE id=$1 AND status='PENDING'`,
    [
      sessionId, verified ? "VERIFIED" : "FAILED", String(body.transactionId ?? "").trim() || null,
      verified ? new Date() : null, verified ? null : String(body.errorCode ?? "").slice(0,80) || null,
      verified ? null : String(body.errorMessage ?? "Face authentication failed").slice(0,240),
    ],
  );

  logger.info({ event: "aadhaar_face_completed", sessionId, verified, providerTxnId: body.transactionId ?? null },
    "Aadhaar Face authentication completed");
  res.json({ ok: true, status: verified ? "VERIFIED" : "FAILED" });
});

// Non-production UAT helper. This does NOT call CIDR; it simulates the terminal Auth response
// so OMpayroll can be exercised with UIDAI-published dummy Aadhaar values before signing material exists.
router.post("/aadhaar/face/:sessionId/uidai-test-complete", ...canWrite, async (req: Request, res: Response) => {
  if (aadhaarFaceMode() !== "uidai_test" || process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not available" }); return;
  }
  const user = req.clientUser!;
  const row = await queryOne<FaceSessionRow>(
    `SELECT * FROM aadhaar_face_sessions WHERE id=$1 AND user_id=$2`, [req.params.sessionId, user.id],
  );
  if (!row) { res.status(404).json({ error: "Session not found" }); return; }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1`, [row.id]);
    res.status(410).json({ error: "Session expired" }); return;
  }
  await execute(
    `UPDATE aadhaar_face_sessions SET status='VERIFIED', verified_at=NOW(), provider_txn_id=$2, mobile_token_hash=NULL WHERE id=$1 AND status='PENDING'`,
    [row.id, `uidai-test-simulated-${randomUUID()}`],
  );
  res.json({ verified: true, status: "VERIFIED", simulated: true, environment: "UIDAI_TEST" });
});

// Development/staging helper: lets the full OMpayroll UI be tested before live provider credentials exist.
router.post("/aadhaar/face/:sessionId/mock-complete", ...canWrite, async (req: Request, res: Response) => {
  if (aadhaarFaceMode() !== "mock" || process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "Not available" }); return;
  }
  const user = req.clientUser!;
  const row = await queryOne<FaceSessionRow>(
    `SELECT * FROM aadhaar_face_sessions WHERE id=$1 AND user_id=$2`, [req.params.sessionId, user.id],
  );
  if (!row) { res.status(404).json({ error: "Session not found" }); return; }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await execute(`UPDATE aadhaar_face_sessions SET status='EXPIRED' WHERE id=$1`, [row.id]);
    res.status(410).json({ error: "Session expired" }); return;
  }
  await execute(
    `UPDATE aadhaar_face_sessions SET status='VERIFIED', verified_at=NOW(), provider_txn_id=$2 WHERE id=$1 AND status='PENDING'`,
    [row.id, `mock-${randomUUID()}`],
  );
  res.json({ verified: true, status: "VERIFIED" });
});

export default router;
