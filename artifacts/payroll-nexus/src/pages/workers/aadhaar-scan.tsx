/**
 * aadhaar-scan.tsx — Aadhaar Secure QR scan + autofill panel
 *
 * Camera flow:
 *   1. Open high-resolution camera stream (facingMode: environment)
 *   2. User positions the front of the Aadhaar card in the guide
 *   3. Capture the front image and keep it in memory
 *   4. User turns the card over and captures the back image
 *   5. Decode Aadhaar Secure QR locally or on the backend
 *   6. Verify the decoded payload using UIDAI signature verification
 *   7. Show preview → conflict check → autofill
 *
 * Upload flow (unchanged): POST /api/aadhaar/extract-upload with JPEG/PNG/PDF
 * No photograph is extracted or stored at any point.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera, Upload, X, CheckCircle2, AlertCircle,
  ShieldCheck, ShieldAlert, Loader2, Info,
} from "lucide-react";
import { Button }  from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Badge }   from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AadhaarAddress {
  line1:    string;
  line2:    string;
  district: string;
  state:    string;
  pin:      string;
}

interface AadhaarExtract {
  aadhaarReference: string;
  name:        string;
  dob:         string;
  gender:      "M" | "F";
  nationality: string;
  fatherName?: string;
  address:     AadhaarAddress;
}

export interface AadhaarAutofill {
  adharcardno?: string;
  EmpName?:     string;
  DOB?:         string;
  Sex?:         string;
  Nationality?: string;
  FHName?:      string;
  cmbFH?:      string;
  localadd1?:   string;
  localadd2?:   string;
  localDist?:   string;
  LOCALSTATE?:  string;
  localpin?:    string;
}

interface ConflictField {
  key:     keyof AadhaarAutofill;
  label:   string;
  current: string;
  aadhaar: string;
}

type Phase =
  | { kind: "idle" }
  | { kind: "consent";    trigger: "camera" | "upload"; file?: File }
  | { kind: "camera" }
  | { kind: "verifying";  method: string }
  | { kind: "preview";    result: AadhaarExtract; method: string; authenticity: "UIDAI_VERIFIED" | "OCR_ONLY" | "AUTHENTICITY_NOT_VERIFIED" }
  | { kind: "conflict";   result: AadhaarExtract; conflicts: ConflictField[]; method: string; authenticity: "UIDAI_VERIFIED" | "OCR_ONLY" | "AUTHENTICITY_NOT_VERIFIED" }
  | { kind: "error";      message: string };

type CameraStatus = "scanning" | "capturing" | "capture_failed";
type CameraSide = "front" | "back";

const FIELD_LABELS: Record<keyof AadhaarAutofill, string> = {
  adharcardno: "Aadhaar Card Number",
  EmpName:     "Employee Name",
  DOB:         "Date of Birth",
  Sex:         "Gender",
  Nationality: "Nationality",
  FHName:     "Father / Spouse Name",
  cmbFH:      "F/H Indicator",
  localadd1:   "Address Line 1",
  localadd2:   "Address Line 2",
  localDist:   "District",
  LOCALSTATE:  "State",
  localpin:    "PIN Code",
};

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AadhaarPanelProps {
  currentValues: {
    EmpName?:     string | null;
    FHName?:      string | null;
    DOB?:         string | null;
    Sex?:         string | null;
    Nationality?: string | null;
    localadd1?:   string | null;
    localadd2?:   string | null;
    localDist?:   string | null;
    LOCALSTATE?:  string | null;
    localpin?:    string | null;
    MobNo?:       string | null;
  };
  onAutofill: (fields: AadhaarAutofill) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token") ?? ""}` };
}

function consentHeader(method: string): string {
  const record = {
    timestamp: new Date().toISOString(),
    method,
    purpose: "EMPLOYEE_ONBOARDING",
  };
  return btoa(JSON.stringify(record));
}

function formatDob(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return [d, m, y].filter(Boolean).join("/");
}

function genderLabel(g: string): string {
  return g === "M" ? "Male" : g === "F" ? "Female" : g;
}

function extractToAutofill(r: AadhaarExtract): AadhaarAutofill {
  return {
    adharcardno: r.aadhaarReference.replace(/\s/g, ""),
    EmpName:     r.name,
    DOB:         r.dob,
    Sex:         r.gender,
    Nationality: r.nationality,
    FHName:      r.fatherName ?? "",
    cmbFH:       r.fatherName ? "F" : "",
    localadd1:   r.address.line1,
    localadd2:   r.address.line2,
    localDist:   r.address.district,
    LOCALSTATE:  r.address.state,
    localpin:    r.address.pin,
  };
}

/** Encode raw bytes (or fall back to UTF-8 text) as base64 */
function encodeBase64(rawBytes: Uint8Array | null, fallbackText: string): string {
  const bytes = rawBytes && rawBytes.length > 0
    ? rawBytes
    : new TextEncoder().encode(fallbackText);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}


function normText(v: string | null | undefined): string {
  return (v ?? "").normalize("NFKD").replace(/[^a-zA-Z0-9\s]/g, " ").replace(/\s+/g, " ").trim().toUpperCase();
}
function normGender(v: string | null | undefined): string {
  const n = normText(v);
  if (n.startsWith("F")) return "F";
  if (n.startsWith("T")) return "T";
  if (n.startsWith("M")) return "M";
  return n;
}
function normDate(v: string | null | undefined): string {
  const x=(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  const m=x.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : x;
}
function tokenScore(a: string, b: string): number {
  const A=new Set(normText(a).split(" ").filter(Boolean)), B=new Set(normText(b).split(" ").filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit=0; for (const t of A) if (B.has(t)) hit++;
  return Math.round((2*hit/(A.size+B.size))*100);
}
function buildVerification(r: AadhaarExtract, current: AadhaarPanelProps["currentValues"], authenticity: string) {
  const en=normText(current.EmpName), an=normText(r.name);
  const nameScore=tokenScore(en,an);
  const nameStatus=!en?"NOT_AVAILABLE": en===an?"MATCH":nameScore>=75?"PARTIAL_MATCH":"MISMATCH";
  const ed=normDate(current.DOB), ad=normDate(r.dob);
  const dobStatus=!ed||!ad?"NOT_AVAILABLE": /^\d{4}-01-01$/.test(ad)?"YEAR_ONLY":ed===ad?"MATCH":"MISMATCH";
  const eg=normGender(current.Sex), ag=normGender(r.gender);
  const genderStatus=!eg||!ag?"NOT_AVAILABLE":eg===ag?"MATCH":"MISMATCH";
  const empAddr=[current.localadd1,current.localadd2,current.localDist,current.LOCALSTATE,current.localpin].filter(Boolean).join(" ");
  const aadAddr=[r.address.line1,r.address.line2,r.address.district,r.address.state,r.address.pin].filter(Boolean).join(" ");
  let addressScore=tokenScore(empAddr,aadAddr);
  if (current.localpin && r.address.pin && current.localpin.trim()===r.address.pin.trim()) addressScore=Math.min(100,addressScore+15);
  if (current.LOCALSTATE && r.address.state && normText(current.LOCALSTATE)===normText(r.address.state)) addressScore=Math.min(100,addressScore+10);
  const addressStatus=!empAddr||!aadAddr?"NOT_AVAILABLE":addressScore>=85?"MATCH":addressScore>=60?"PARTIAL_MATCH":"MISMATCH";
  const mobileStatus="NOT_AVAILABLE";
  const criticalMismatch=[nameStatus,dobStatus,genderStatus].includes("MISMATCH");
  const overall=authenticity!=="UIDAI_VERIFIED"?"REVIEW_REQUIRED":criticalMismatch?"FAILED":([nameStatus,dobStatus,genderStatus,addressStatus].includes("PARTIAL_MATCH")||[dobStatus,addressStatus,mobileStatus].includes("YEAR_ONLY")||mobileStatus==="NOT_AVAILABLE")?"REVIEW_REQUIRED":"VERIFIED";
  return {nameStatus,nameScore,dobStatus,genderStatus,addressStatus,addressScore,mobileStatus,overall};
}

// ── Module-level canvas utilities ─────────────────────────────────────────────
// All functions are pure (no React) so they are safe to call from async handlers.

function cropCanvas(
  src: HTMLCanvasElement,
  x: number, y: number, w: number, h: number,
): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c;
}

// The camera UI now guides the user to place only the Aadhaar Secure QR inside
// a centered square. Decode that square first so the dense UIDAI QR gets more
// pixels and less background clutter. Keep a full-frame fallback for cards that
// are slightly off-center.
function qrGuideCrop(src: HTMLCanvasElement): HTMLCanvasElement {
  const side = Math.max(240, Math.floor(Math.min(src.width, src.height) * 0.68));
  const x = Math.max(0, Math.floor((src.width - side) / 2));
  const y = Math.max(0, Math.floor((src.height - side) / 2));
  const w = Math.min(side, src.width - x);
  const h = Math.min(side, src.height - y);
  return cropCanvas(src, x, y, w, h);
}

function filterCanvas(src: HTMLCanvasElement, filter: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width; c.height = src.height;
  const ctx = c.getContext("2d")!;
  ctx.filter = filter;
  ctx.drawImage(src, 0, 0);
  return c;
}

function upscaleCanvas(src: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = src.width * factor; c.height = src.height * factor;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality = 0.88): Promise<Blob> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Unable to create Aadhaar image.");
  return blob;
}

async function compressForIdfy(source: HTMLCanvasElement): Promise<Blob> {
  // IDfy recommends 2–3 MB images and rejects oversized request bodies.
  // Start at 0.88 quality and reduce only if the JPEG is still too large.
  for (const quality of [0.88, 0.80, 0.72, 0.64]) {
    const blob = await canvasToJpegBlob(source, quality);
    if (blob.size <= 2_200_000) return blob;
  }
  throw new Error("Captured Aadhaar image is too large. Move closer and capture again.");
}

// ── Decoder strategy 1: ZXing with TRY_HARDER + QR_CODE-only hints ────────────

interface ZxingResult { text: string; rawBytes: Uint8Array | null }

async function zxingDecodeCanvas(canvas: HTMLCanvasElement): Promise<ZxingResult | null> {
  try {
    const {
      QRCodeReader, BinaryBitmap, HybridBinarizer,
      HTMLCanvasElementLuminanceSource, DecodeHintType, BarcodeFormat,
    } = await import("@zxing/library");

    const hints = new Map<number, unknown>();
    hints.set(DecodeHintType.TRY_HARDER, true);
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);

    const reader = new QRCodeReader();
    const lum    = new HTMLCanvasElementLuminanceSource(canvas);
    const bmp    = new BinaryBitmap(new HybridBinarizer(lum));
    const result = reader.decode(bmp, hints);

    const raw = result.getRawBytes();
    return {
      text:     result.getText(),
      rawBytes: raw ? new Uint8Array(raw) : null,
    };
  } catch {
    return null; // NotFoundException and others — normal during scanning
  }
}

// ── Decoder strategy 2: jsQR on raw RGBA pixels ───────────────────────────────

async function jsqrDecodeCanvas(canvas: HTMLCanvasElement): Promise<string | null> {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const { default: jsQR } = await import("jsqr") as {
      default: (data: Uint8ClampedArray, w: number, h: number, opts?: object) => { data: string } | null
    };
    const result = jsQR(imageData.data, width, height, { inversionAttempts: "attemptBoth" });
    return result?.data ?? null;
  } catch {
    return null;
  }
}

// ── Multi-version decode pipeline ─────────────────────────────────────────────
// Tries 6 preprocessed versions; returns the first successful decode.

async function decodeFromCrop(crop: HTMLCanvasElement): Promise<ZxingResult | null> {
  const versions: HTMLCanvasElement[] = [
    crop,                                                                   // 1. original
    filterCanvas(crop, "grayscale(1)"),                                     // 2. grayscale
    filterCanvas(crop, "grayscale(1) contrast(3)"),                         // 3. high contrast
    filterCanvas(crop, "grayscale(1) contrast(1.6) brightness(1.1)"),       // 4. sharpened (approx)
    upscaleCanvas(crop, 2),                                                 // 5. 2× upscale
    filterCanvas(crop, "invert(1) grayscale(1)"),                           // 6. inverted
  ];

  for (const v of versions) {
    const zx = await zxingDecodeCanvas(v);
    if (zx) return zx;

    const jq = await jsqrDecodeCanvas(v);
    if (jq) return { text: jq, rawBytes: null };
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────


function VerificationSummary({ result, currentValues, authenticity }: { result: AadhaarExtract; currentValues: AadhaarPanelProps["currentValues"]; authenticity: "UIDAI_VERIFIED" | "OCR_ONLY" | "AUTHENTICITY_NOT_VERIFIED" }) {
  const v = buildVerification(result, currentValues, authenticity);
  const statusClass=(x:string)=>x==="MATCH"||x==="VERIFIED"?"text-green-700":x==="MISMATCH"||x==="FAILED"?"text-red-700":"text-amber-700";
  const maskedMobile=(currentValues.MobNo??"").replace(/\D/g,"").slice(-4);
  return <div className="rounded-md border p-3 space-y-2 bg-slate-50/60">
    <div className="flex items-center justify-between gap-2">
      <span className="font-medium text-sm">Aadhaar Verification</span>
      <Badge variant="outline" className={statusClass(v.overall)}>{v.overall.replaceAll("_"," ")}</Badge>
    </div>
    <div className="text-xs">Authenticity: <span className={authenticity==="UIDAI_VERIFIED"?"text-green-700 font-medium":"text-amber-700 font-medium"}>{authenticity.replaceAll("_"," ")}</span></div>
    <table className="w-full text-xs"><tbody className="divide-y">
      <tr><td className="py-1">Name</td><td>{currentValues.EmpName||"—"}</td><td>{result.name||"—"}</td><td className={statusClass(v.nameStatus)}>{v.nameStatus.replaceAll("_"," ")}</td></tr>
      <tr><td className="py-1">DOB</td><td>{currentValues.DOB||"—"}</td><td>{formatDob(result.dob)}</td><td className={statusClass(v.dobStatus)}>{v.dobStatus.replaceAll("_"," ")}</td></tr>
      <tr><td className="py-1">Gender</td><td>{currentValues.Sex||"—"}</td><td>{genderLabel(result.gender)}</td><td className={statusClass(v.genderStatus)}>{v.genderStatus.replaceAll("_"," ")}</td></tr>
      <tr><td className="py-1">Address</td><td colSpan={2}>{[result.address.line1,result.address.line2,result.address.district,result.address.state,result.address.pin].filter(Boolean).join(", ")||"—"}</td><td className={statusClass(v.addressStatus)}>{v.addressStatus.replaceAll("_"," ")} {v.addressStatus!=="NOT_AVAILABLE"?`(${v.addressScore}%)`:""}</td></tr>
      <tr><td className="py-1">Mobile</td><td>{maskedMobile?`******${maskedMobile}`:"—"}</td><td>UIDAI hash</td><td className="text-amber-700">NOT AVAILABLE IN THIS QR/OCR FLOW</td></tr>
    </tbody></table>
    <p className="text-[11px] text-muted-foreground">Mobile verification requires UIDAI Paperless Offline e-KYC (signed XML + share code). This screen never guesses or exposes the Aadhaar-registered mobile number.</p>
  </div>;
}

export function AadhaarPanel({ currentValues, onAutofill }: AadhaarPanelProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [resolutions, setResolutions] = useState<Record<string, "keep" | "use">>({});

  // Camera-specific state
  const [cameraStatus, setCameraStatus]       = useState<CameraStatus>("scanning");
  const [cameraSide, setCameraSide]           = useState<CameraSide>("front");
  const [captureError, setCaptureError]       = useState("");
  const [captureResolution, setCaptureResolution] = useState(""); // dev-only

  const fileInputRef     = useRef<HTMLInputElement>(null);
  const videoRef         = useRef<HTMLVideoElement>(null);
  const scannerRef       = useRef<{ stop: () => void } | null>(null);
  const scanIntervalRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const scannedRef       = useRef(false); // dedup guard — prevents duplicate API calls
  const frontImageRef     = useRef<File | null>(null);

  // ── Stop everything (camera, interval, stream) ────────────────────────────

  const stopCamera = useCallback(() => {
    if (scanIntervalRef.current !== null) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    scannerRef.current?.stop();
    scannerRef.current = null;
  }, []);

  // ── Decode success handler ────────────────────────────────────────────────
  // Called by both the background live-scan and the manual capture path.

  function handleDecodeSuccess(text: string, rawBytes: Uint8Array | null): void {
    if (scannedRef.current) return;
    scannedRef.current = true;
    stopCamera();
    const payloadBase64 = encodeBase64(rawBytes, text);
    setPhase({ kind: "verifying", method: "CAMERA_QR" });
    void callVerifyQr(text, payloadBase64, "CAMERA_QR");
  }

  async function callVerifyQr(text: string, payloadBase64: string, method: string): Promise<void> {
    try {
      const resp = await fetch("/api/aadhaar/verify-qr", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders(),
          "X-Aadhaar-Consent": consentHeader(method),
        },
        body: JSON.stringify({ qrText: text, qrPayloadBase64: payloadBase64 }),
      });
      const json = await resp.json() as {
        verified?: boolean;
        data?: AadhaarExtract;
        error?: string;
        authenticity?: "UIDAI_VERIFIED" | "OCR_ONLY" | "AUTHENTICITY_NOT_VERIFIED";
      };
      if (!resp.ok || !json.verified || !json.data) {
        throw new Error(json.error ?? "UIDAI Aadhaar QR verification failed");
      }
      stopCamera();
      setPhase({
        kind: "preview",
        result: json.data,
        method,
        authenticity: json.authenticity ?? "AUTHENTICITY_NOT_VERIFIED",
      });
    } catch (e: unknown) {
      scannedRef.current = false;
      setPhase({ kind: "error", message: (e as Error).message ?? "UIDAI Aadhaar QR verification failed" });
    }
  }

  // ── Camera scanner lifecycle ──────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    scannedRef.current = false;
    setCameraStatus("scanning");
    setCaptureError("");
    if (import.meta.env.DEV) setCaptureResolution("");

    try {
      // Request high-resolution stream (browser will deliver the best it supports)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

      video.srcObject = stream;
      await video.play();

      // Display actual resolution in dev mode only (no Aadhaar data logged)
      if (import.meta.env.DEV) {
        const showRes = () => setCaptureResolution(`${video.videoWidth}×${video.videoHeight}`);
        if (video.videoWidth) showRes();
        else video.addEventListener("loadedmetadata", showRes, { once: true });
      }

      // Unified stop handle: clears interval + stops stream tracks + nulls srcObject
      const stopAll = () => {
        if (scanIntervalRef.current !== null) {
          clearInterval(scanIntervalRef.current);
          scanIntervalRef.current = null;
        }
        stream.getTracks().forEach(t => t.stop());
        if (videoRef.current) videoRef.current.srcObject = null;
      };
      scannerRef.current = { stop: stopAll };

      // PRIMARY PATH: continuously scan the Aadhaar Secure QR and send the
      // decoded payload to our UIDAI signature-verification endpoint. IDfy is
      // only a fallback when the user explicitly captures card images and no
      // QR can be decoded.
      let decoding = false;
      scanIntervalRef.current = setInterval(() => {
        if (decoding || scannedRef.current || !videoRef.current?.videoWidth) return;
        decoding = true;
        void (async () => {
          try {
            const v = videoRef.current!;
            const frame = document.createElement("canvas");
            frame.width = v.videoWidth;
            frame.height = v.videoHeight;
            const fctx = frame.getContext("2d");
            if (!fctx) return;
            fctx.drawImage(v, 0, 0, frame.width, frame.height);

            // PRIMARY: decode the centered square shown by the UI. This gives
            // Aadhaar's dense Secure QR far more usable pixels and avoids the
            // room/card background confusing the detector.
            let decoded = await decodeFromCrop(qrGuideCrop(frame));

            // Fallback: also try the full frame in case the QR is slightly
            // outside the guide while the user is positioning the card.
            if (!decoded) decoded = await decodeFromCrop(frame);

            if (decoded && !scannedRef.current) {
              handleDecodeSuccess(decoded.text, decoded.rawBytes);
            }
          } finally {
            decoding = false;
          }
        })();
      }, 650);
    } catch (e: unknown) {
      const msg = (e as Error).message ?? String(e);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed")) {
        setPhase({ kind: "error", message: "Camera permission denied. Please allow camera access and try again." });
      } else {
        setPhase({ kind: "error", message: `Camera error: ${msg}` });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (phase.kind === "camera") {
      startCamera();
    }
    // Always clean up on phase change or unmount (success → verifying, cancel → idle, unmount)
    return () => {
      stopCamera();
    };
  }, [phase.kind, startCamera, stopCamera]);

  // ── Manual capture + decode ────────────────────────────────────────────────
  // Captures a still frame, crops the guide region, tries 6 preprocessing
  // versions × ZXing + jsQR, then falls back to the backend decoder.

  async function captureAndDecode(): Promise<void> {
    const video = videoRef.current;
    if (!video?.videoWidth || scannedRef.current) return;

    setCameraStatus("capturing");
    setCaptureError("");

    try {
      // UIDAI-ONLY CAMERA PATH. Capture a frame and decode the Aadhaar Secure QR.
      // Never fall through to IDfy from the Scan Aadhaar action.
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Unable to capture the camera frame.");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 1) Fast local decode. Try the centered QR guide first, then full frame.
      let qr = await decodeFromCrop(qrGuideCrop(canvas));
      if (!qr) qr = await decodeFromCrop(canvas);
      if (qr) {
        handleDecodeSuccess(qr.text, qr.rawBytes);
        return;
      }

      // 2) Stronger server-side decode of the same captured frame.
      // This endpoint only decodes QR; it does NOT call IDfy.
      const blob = await canvasToJpegBlob(canvas, 0.92);
      const fd = new FormData();
      fd.append("file", new File([blob], "aadhaar-secure-qr.jpg", { type: "image/jpeg" }));
      const resp = await fetch("/api/aadhaar/decode-captured-qr", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-Aadhaar-Consent": consentHeader("CAMERA_QR"),
        },
        body: fd,
      });
      const json = await resp.json() as { qrText?: string | null; error?: string };
      if (resp.ok && json.qrText) {
        handleDecodeSuccess(json.qrText, null);
        return;
      }

      // IMPORTANT: no IDfy fallback here. A QR scan that cannot be decoded must
      // remain a QR failure so the user can retry with the QR closer/in focus.
      setCameraStatus("capture_failed");
      setCaptureError("UIDAI Secure QR was not detected. Put only the QR code inside the square, make it fill most of the square, hold steady, avoid glare, and retry.");
    } catch (e: unknown) {
      setCameraStatus("capture_failed");
      setCaptureError("UIDAI QR scan error: " + ((e as Error).message ?? String(e)));
    }
  }


  async function callUpload(file: File, method: string) {
    // UIDAI-only upload path: image/PDF uploads are decoded for Aadhaar Secure QR
    // and verified by our UIDAI endpoint. They never route to IDfy automatically.
    setPhase({ kind: "verifying", method });
    try {
      const fd = new FormData();
      fd.append("file", file);
      const resp = await fetch("/api/aadhaar/extract-upload", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "X-Aadhaar-Consent": consentHeader(method),
        },
        body: fd,
      });
      const json = await resp.json() as { verified?: boolean; data?: AadhaarExtract; error?: string; authenticity?: "UIDAI_VERIFIED" | "OCR_ONLY" | "AUTHENTICITY_NOT_VERIFIED" };
      if (!resp.ok || !json.verified || !json.data) {
        throw new Error(json.error ?? "Extraction failed");
      }
      setPhase({ kind: "preview", result: json.data, method, authenticity: json.authenticity ?? "AUTHENTICITY_NOT_VERIFIED" });
    } catch (e: unknown) {
      setPhase({ kind: "error", message: (e as Error).message });
    }
  }

  // ── Consent confirm ────────────────────────────────────────────────────────

  function handleConsentConfirm() {
    if (phase.kind !== "consent") return;
    if (phase.trigger === "camera") {
      frontImageRef.current = null;
      setCameraSide("front");
      setPhase({ kind: "camera" });
    } else {
      const { file } = phase;
      if (file) {
        const method = file.type === "application/pdf" ? "UPLOAD_PDF" : "UPLOAD_IMAGE";
        void callUpload(file, method);
      }
    }
  }

  // ── Preview confirm → conflict check → autofill ───────────────────────────

  function handlePreviewConfirm() {
    if (phase.kind !== "preview") return;
    const proposed = extractToAutofill(phase.result);
    const conflicts: ConflictField[] = [];

    for (const [key, aadhaarVal] of Object.entries(proposed) as [keyof AadhaarAutofill, string][]) {
      if (!aadhaarVal) continue;
      if (key === "adharcardno") continue;
      const current = (currentValues as Record<string, string | null | undefined>)[key as string];
      if (current && current.trim() && current.trim() !== aadhaarVal.trim()) {
        conflicts.push({ key, label: FIELD_LABELS[key], current: current.trim(), aadhaar: aadhaarVal.trim() });
      }
    }

    if (conflicts.length === 0) {
      onAutofill(proposed);
      setPhase({ kind: "idle" });
    } else {
      const init: Record<string, "keep" | "use"> = {};
      conflicts.forEach((c) => { init[c.key] = "use"; });
      setResolutions(init);
      setPhase({ kind: "conflict", result: phase.result, conflicts, method: phase.method, authenticity: phase.authenticity });
    }
  }

  // ── Conflict confirm ──────────────────────────────────────────────────────

  function handleConflictConfirm() {
    if (phase.kind !== "conflict") return;
    const proposed = extractToAutofill(phase.result);
    const final: AadhaarAutofill = {};

    for (const [key, val] of Object.entries(proposed) as [keyof AadhaarAutofill, string][]) {
      if (key === "adharcardno") { final[key] = val; continue; }
      const conflict = phase.conflicts.find((c) => c.key === key);
      if (conflict) {
        if (resolutions[key] === "use") final[key] = val;
      } else {
        if (val) final[key] = val;
      }
    }

    onAutofill(final);
    setPhase({ kind: "idle" });
  }

  // ── File input ────────────────────────────────────────────────────────────

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const allowed = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowed.includes(file.type)) {
      setPhase({ kind: "error", message: `Unsupported file type: ${file.type}. Upload a JPEG, PNG, or PDF.` });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setPhase({ kind: "error", message: "File too large — maximum 5 MB" });
      return;
    }
    setPhase({ kind: "consent", trigger: "upload", file });
  }

  function reset() {
    stopCamera();
    scannedRef.current = false;
    frontImageRef.current = null;
    setCameraSide("front");
    setPhase({ kind: "idle" });
    setResolutions({});
    setCameraStatus("scanning");
    setCaptureError("");
  }

  const open = phase.kind !== "idle";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Trigger buttons */}
      <div className="flex items-center gap-2 mt-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => setPhase({ kind: "consent", trigger: "camera" })}
        >
          <Camera className="h-3.5 w-3.5" />
          Scan Aadhaar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-50"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Upload Aadhaar
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.pdf"
          className="hidden"
          onChange={handleFileChange}
        />
        <span className="text-[11px] text-muted-foreground">JPEG / PNG / PDF</span>
      </div>

      <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); }}>
        <DialogContent className="max-w-lg">

          {/* ── Consent ─────────────────────────────────────────────────── */}
          {phase.kind === "consent" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-blue-600" />
                  Aadhaar Consent Required
                </DialogTitle>
                <DialogDescription className="text-left pt-1">
                  Please confirm that the employee has voluntarily provided their Aadhaar
                  for onboarding and identity verification, as per the Aadhaar
                  (Targeted Delivery of Financial and Other Subsidies, Benefits and Services) Act, 2016.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 space-y-1">
                <p className="font-medium">Employee Declaration</p>
                <p>
                  The employee has voluntarily provided their Aadhaar card for
                  onboarding and identity verification. Consent has been recorded
                  with timestamp, user, and purpose.
                </p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                <Button type="button" onClick={handleConsentConfirm}>
                  <ShieldCheck className="h-4 w-4 mr-1.5" />
                  Confirm Consent &amp; Continue
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Camera scan ──────────────────────────────────────────────── */}
          {phase.kind === "camera" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Camera className="h-5 w-5 text-blue-600" />
                  Scan Aadhaar Secure QR
                </DialogTitle>
                <DialogDescription>
                  {cameraStatus === "capture_failed"
                    ? "Place only the Aadhaar QR inside the square and try again."
                    : "Place the Aadhaar Secure QR inside the square below. Do not scan the full card or both sides."}
                </DialogDescription>
              </DialogHeader>

              {/* Video + guide overlay */}
              <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* UIDAI QR-only guide. The decoder prioritizes this exact centered region. */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div
                    className="relative w-[62%] max-w-[330px] aspect-square rounded-lg border-2 border-white/90"
                    style={{ boxShadow: "0 0 0 9999px rgba(0,0,0,0.48)" }}
                  >
                    <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-black/65 px-2 py-1 text-xs font-medium text-white">
                      Place Aadhaar QR inside this square
                    </div>
                    {/* Strong square corner markers make it obvious that only the QR is needed. */}
                    <div className="absolute -top-0.5 -left-0.5 w-7 h-7 border-t-4 border-l-4 border-blue-400 rounded-tl-md" />
                    <div className="absolute -top-0.5 -right-0.5 w-7 h-7 border-t-4 border-r-4 border-blue-400 rounded-tr-md" />
                    <div className="absolute -bottom-0.5 -left-0.5 w-7 h-7 border-b-4 border-l-4 border-blue-400 rounded-bl-md" />
                    <div className="absolute -bottom-0.5 -right-0.5 w-7 h-7 border-b-4 border-r-4 border-blue-400 rounded-br-md" />
                  </div>
                </div>

                {/* Capturing spinner overlay */}
                {cameraStatus === "capturing" && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-2">
                    <Loader2 className="h-10 w-10 animate-spin text-white" />
                    <span className="text-white/90 text-sm">Scanning UIDAI Secure QR…</span>
                  </div>
                )}

                {/* Status hint */}
                {cameraStatus !== "capturing" && (
                  <div className="absolute bottom-3 left-0 right-0 text-center pointer-events-none">
                    <span className="text-xs text-white/80 bg-black/50 px-2 py-1 rounded">
                      {cameraStatus === "capture_failed"
                        ? "Fill the square with the QR · hold steady · avoid glare"
                        : "QR only · fill most of the square · hold steady for 1–2 seconds"}
                    </span>
                  </div>
                )}

                {/* Dev-only: actual camera resolution */}
                {import.meta.env.DEV && captureResolution && (
                  <div className="absolute top-2 left-2 pointer-events-none">
                    <span className="text-[10px] text-white/70 bg-black/40 px-1.5 py-0.5 rounded font-mono">
                      {captureResolution}
                    </span>
                  </div>
                )}
              </div>

              {/* Capture failure message */}
              {cameraStatus === "capture_failed" && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{captureError}</span>
                </div>
              )}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={reset}
                  disabled={cameraStatus === "capturing"}
                >
                  <X className="h-4 w-4 mr-1.5" />
                  Cancel
                </Button>

                {cameraStatus === "capture_failed" ? (
                  <Button
                    type="button"
                    onClick={() => setCameraStatus("scanning")}
                  >
                    Retry Capture
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void captureAndDecode()}
                    disabled={cameraStatus === "capturing"}
                  >
                    {cameraStatus === "capturing" ? (
                      <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Decoding…</>
                    ) : (
                      <><Camera className="h-4 w-4 mr-1.5" />Scan UIDAI QR</>
                    )}
                  </Button>
                )}
              </DialogFooter>
            </>
          )}

          {/* ── Verifying ─────────────────────────────────────────────────── */}
          {phase.kind === "verifying" && (
            <>
              <DialogHeader>
                <DialogTitle>Extracting Aadhaar Details…</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
                <p className="text-sm text-muted-foreground">
                  {phase.method === "UPLOAD_PDF"
                    ? "Extracting Aadhaar details from PDF…"
                    : phase.method === "CAMERA_QR" ? "Verifying UIDAI Secure QR signature…" : "Decoding and verifying Aadhaar Secure QR…"}
                </p>
              </div>
            </>
          )}

          {/* ── Preview ───────────────────────────────────────────────────── */}
          {phase.kind === "preview" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Aadhaar Details Extracted
                </DialogTitle>
                <DialogDescription>
                  Review the details below. Click &quot;Use These Details&quot; to populate the form.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-blue-700 border-blue-300 bg-blue-50 gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    {phase.authenticity === "UIDAI_VERIFIED" ? "UIDAI Verified Aadhaar" : phase.authenticity === "OCR_ONLY" ? "OCR Only — Not UIDAI Verified" : "Authenticity Not Verified"}
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    {phase.method === "IDFY_AADHAAR_OCR" ? "Camera / IDfy"
                      : phase.method === "IDFY_AADHAAR_OCR_BOTH_SIDES" ? "Legacy OCR"
                      : phase.method === "UPLOAD_PDF" ? "PDF / UIDAI QR"
                        : phase.method === "CAMERA_QR" ? "Camera / UIDAI QR" : "Image / UIDAI QR"}
                  </Badge>
                </div>

                <VerificationSummary result={phase.result} currentValues={currentValues} authenticity={phase.authenticity} />

                <table className="w-full text-sm">
                  <tbody className="divide-y divide-border/40">
                    {[
                      ["Aadhaar Number", phase.result.aadhaarReference],
                      ["Name",           phase.result.name],
                      ["Father / Spouse", phase.result.fatherName],
                      ["Date of Birth",  formatDob(phase.result.dob)],
                      ["Gender",         genderLabel(phase.result.gender)],
                      ["Nationality",    phase.result.nationality],
                      ["Address Line 1", phase.result.address.line1],
                      ["Address Line 2", phase.result.address.line2],
                      ["District",       phase.result.address.district],
                      ["State",          phase.result.address.state],
                      ["PIN",            phase.result.address.pin],
                    ].map(([label, value]) => (
                      <tr key={label} className="text-left">
                        <td className="py-1.5 pr-4 text-muted-foreground w-36 align-top">{label}</td>
                        <td className="py-1.5 font-medium break-words">
                          {value || <span className="text-muted-foreground italic">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-start gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>
                    Fields that already have values will be shown for confirmation before overwriting.
                    Employee Code, Mobile, Email, PF, Bank details and Employment fields will not be changed.
                  </span>
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                <Button type="button" onClick={handlePreviewConfirm}>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Use These Details
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Conflict ──────────────────────────────────────────────────── */}
          {phase.kind === "conflict" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <ShieldAlert className="h-5 w-5 text-amber-600" />
                  Some Fields Already Have Values
                </DialogTitle>
                <DialogDescription>
                  Choose whether to keep the current value or use the Aadhaar value for each field.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                {phase.conflicts.map((conflict) => (
                  <div key={conflict.key} className="rounded-md border p-3 space-y-2">
                    <p className="text-sm font-medium">{conflict.label}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setResolutions((r) => ({ ...r, [conflict.key]: "keep" }))}
                        className={`rounded border p-2 text-left text-xs transition-colors ${
                          resolutions[conflict.key] === "keep"
                            ? "border-slate-500 bg-slate-100 ring-1 ring-slate-400"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="block font-medium text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Keep Current
                        </span>
                        {conflict.current}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResolutions((r) => ({ ...r, [conflict.key]: "use" }))}
                        className={`rounded border p-2 text-left text-xs transition-colors ${
                          resolutions[conflict.key] === "use"
                            ? "border-blue-500 bg-blue-50 ring-1 ring-blue-400"
                            : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <span className="block font-medium text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                          Use Aadhaar
                        </span>
                        {conflict.aadhaar}
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={reset}>Cancel</Button>
                <Button type="button" onClick={handleConflictConfirm}>
                  Apply Selected Values
                </Button>
              </DialogFooter>
            </>
          )}

          {/* ── Error ─────────────────────────────────────────────────────── */}
          {phase.kind === "error" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  Aadhaar Verification Failed
                </DialogTitle>
              </DialogHeader>
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {phase.message}
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={reset}>Close</Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setPhase({ kind: "consent", trigger: "upload" })}
                >
                  <Upload className="h-4 w-4 mr-1.5" />
                  Try Upload Instead
                </Button>
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>
    </>
  );
}
