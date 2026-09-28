/**
 * aadhaar-qr-reader.ts — Extract QR code text from image (JPEG/PNG) or PDF buffers
 *
 * Images  → sharp decodes to RGBA → jsqr (pure JS) decodes QR
 * PDFs    → scan raw PDF bytes for embedded JPEG streams → sharp → jsqr
 *           (works for the vast majority of e-Aadhaar PDFs where QR is a JPEG XObject)
 *
 * sharp is in the esbuild external list — it loads as a native module at runtime.
 * No canvas dependency required.
 */

import sharp from "sharp";
import { logger } from "./logger.js";

// ─── jsqr wrapper ─────────────────────────────────────────────────────────────

async function decodeQRFromRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Promise<string | null> {
  // jsqr is pure JS — bundled with the API server
  const mod = await import("jsqr") as { default: (d: Uint8ClampedArray, w: number, h: number, opts?: object) => { data: string } | null };
  const jsQR = mod.default;

  // Try normal then inverted (handles white-on-dark QR codes)
  const code = jsQR(data, width, height, { inversionAttempts: "dontInvert" })
    ?? jsQR(data, width, height, { inversionAttempts: "onlyInvert" });
  return code?.data ?? null;
}

// ─── Image (JPEG / PNG) → RGBA via sharp ─────────────────────────────────────

export async function decodeQRFromImageBuffer(buf: Buffer, _mimeType: string): Promise<string> {
  // Attempt 1 — native resolution
  const { data: d1, info: i1 } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const code1 = await decodeQRFromRgba(new Uint8ClampedArray(d1), i1.width, i1.height);
  if (code1) return code1;

  // Attempt 2 — upscale for small/dense QR codes
  const targetWidth = Math.max(i1.width, 1200);
  const { data: d2, info: i2 } = await sharp(buf)
    .resize({ width: targetWidth, withoutEnlargement: false })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const code2 = await decodeQRFromRgba(new Uint8ClampedArray(d2), i2.width, i2.height);
  if (code2) return code2;

  throw new Error(
    "No QR code found in the image. Ensure the Aadhaar QR is clearly visible and in focus, then try again.",
  );
}

// ─── PDF: extract embedded JPEG streams ───────────────────────────────────────
//
// e-Aadhaar PDFs embed the QR code as a JPEG image XObject.
// We scan the raw PDF bytes for JPEG SOI (0xFF 0xD8) / EOI (0xFF 0xD9) markers
// to extract all embedded JPEGs, then QR-decode each one.
// This avoids needing a canvas or PDF renderer and works in all environments.

function extractJPEGsFromPDF(buf: Buffer): Buffer[] {
  const jpegs: Buffer[] = [];
  let pos = 0;

  while (pos < buf.length - 1) {
    if (buf[pos] === 0xFF && buf[pos + 1] === 0xD8) {
      const start = pos;
      let end = pos + 2;
      let found = false;

      while (end < buf.length - 1) {
        if (buf[end] === 0xFF && buf[end + 1] === 0xD9) {
          end += 2;
          found = true;
          break;
        }
        end++;
      }

      if (found) {
        const candidate = buf.subarray(start, end);
        // Skip tiny false-positive JPEG fragments — real QR images are at least 5 KB
        if (candidate.length > 5_000) jpegs.push(candidate);
        pos = end;
      } else {
        pos++;
      }
    } else {
      pos++;
    }
  }

  return jpegs;
}

export async function decodeQRFromPDFBuffer(buf: Buffer): Promise<string> {
  const jpegs = extractJPEGsFromPDF(buf);

  if (jpegs.length === 0) {
    throw new Error(
      "No embedded images found in this PDF. " +
      "This may be a vector-rendered QR code. " +
      "Please take a clear photo of the Aadhaar QR and upload it as a JPEG or PNG instead.",
    );
  }

  logger.debug({ jpegCount: jpegs.length }, "PDF JPEG extraction: found candidates");

  // Prefer candidates closest to a typical QR image size range
  const sorted = [...jpegs].sort((a, b) => {
    const ideal = 50_000;
    return Math.abs(a.length - ideal) - Math.abs(b.length - ideal);
  });

  for (const jpegBuf of sorted.slice(0, 10)) {
    try {
      const code = await decodeQRFromImageBuffer(jpegBuf, "image/jpeg");
      if (code) return code;
    } catch {
      // Not a QR or unreadable — try next candidate
    }
  }

  throw new Error(
    "Found images in PDF but none contained a readable Aadhaar QR code. " +
    "Ensure the PDF is an official e-Aadhaar document, or upload a photo of the QR as JPEG or PNG.",
  );
}
