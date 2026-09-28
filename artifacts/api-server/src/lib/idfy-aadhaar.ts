/**
 * IDfy Aadhaar OCR integration.
 *
 * Uses IDfy's ind_aadhaar async task. Credentials stay server-side.
 * The caller provides a front-side Aadhaar image; IDfy returns OCR and QR-derived fields.
 */

import { randomUUID } from "node:crypto";

const IDFY_BASE_URL = "https://eve.idfy.com/v3";

function credentials(): { apiKey: string; accountId: string } {
  const apiKey = (process.env.IDFY_API_KEY ?? "").trim();
  const accountId = (process.env.IDFY_ACCOUNT_ID ?? "").trim();

  if (!apiKey || !accountId) {
    throw new Error(
      "IDfy is not configured. Set IDFY_API_KEY and IDFY_ACCOUNT_ID on the backend.",
    );
  }

  return { apiKey, accountId };
}

function headers(): Record<string, string> {
  const { apiKey, accountId } = credentials();
  return {
    "Content-Type": "application/json",
    "api-key": apiKey,
    "account-id": accountId,
  };
}

interface IdfyTaskResponse {
  request_id?: string;
  error?: string;
  message?: string;
}

interface IdfyTaskResult {
  status?: string;
  request_id?: string;
  type?: string;
  result?: {
    extraction_output?: Record<string, unknown>;
    qr_output?: Record<string, unknown>;
  };
  error?: string;
  message?: string;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function personName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return [record.first_name, record.middle_name, record.last_name]
      .map(stringValue)
      .filter(Boolean)
      .join(" ");
  }
  return stringValue(value);
}

function normalizeGender(value: unknown): "M" | "F" {
  const text = stringValue(value).toLowerCase();
  return text.startsWith("f") ? "F" : "M";
}

function normalizeDob(value: unknown): string {
  const text = stringValue(value);
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const parts = text.split(/[\/-]/);
  if (parts.length === 3 && parts[2]?.length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, "0")}-${parts[0].padStart(2, "0")}`;
  }
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  return text;
}

function maskAadhaar(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return value;
  return `XXXX XXXX ${digits.slice(-4)}`;
}

function mapResult(task: IdfyTaskResult) {
  const extraction = task.result?.extraction_output ?? {};
  const qr = task.result?.qr_output ?? {};

  const idNumber = firstNonEmpty(qr.id_number, extraction.id_number);
  const name = firstNonEmpty(qr.name_on_card, extraction.name_on_card);
  const dob = normalizeDob(firstNonEmpty(qr.date_of_birth, extraction.date_of_birth));
  const gender = normalizeGender(firstNonEmpty(qr.gender, extraction.gender));

  if (!name) throw new Error("IDfy completed but did not return the Aadhaar name.");
  if (!idNumber) throw new Error("IDfy completed but did not return the Aadhaar number.");

  const street = firstNonEmpty(qr.street_address, extraction.street_address);
  const house = firstNonEmpty(qr.house_number, extraction.house_number);
  const address = firstNonEmpty(qr.address, extraction.address);
  const district = firstNonEmpty(qr.district, extraction.district);
  const state = firstNonEmpty(qr.state, extraction.state);
  const pincode = firstNonEmpty(qr.pincode, extraction.pincode);

  return {
    aadhaarReference: maskAadhaar(idNumber),
    name,
    dob,
    gender,
    nationality: "Indian",
    fatherName: personName(extraction.fathers_name ?? qr.fathers_name),
    address: {
      line1: [house, street].filter(Boolean).join(", ").slice(0, 200),
      line2: address.slice(0, 200),
      district: district.slice(0, 50),
      state: state.slice(0, 50),
      pin: pincode.slice(0, 10),
    },
  };
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: `IDfy returned a non-JSON response (HTTP ${response.status})` };
  }
}

/**
 * Submit an Aadhaar front image to IDfy and wait for the async task to complete.
 * The image is sent as base64 as documented by IDfy.
 */
export async function extractAadhaarWithIdfy(
  imageBuffer: Buffer,
  mimeType: string,
  backImageBuffer?: Buffer,
  backMimeType?: string,
): Promise<ReturnType<typeof mapResult>> {
  if (!imageBuffer.length) throw new Error("Aadhaar image is empty.");
  if (!/^image\/(jpeg|png)$/.test(mimeType)) {
    throw new Error("IDfy Aadhaar OCR requires a JPEG or PNG image.");
  }
  if (backImageBuffer && !backMimeType) {
    throw new Error("IDfy Aadhaar back image MIME type is missing.");
  }
  if (backMimeType && !/^image\/(jpeg|png)$/.test(backMimeType)) {
    throw new Error("IDfy Aadhaar back image must be JPEG or PNG.");
  }

  // IDfy's ind_aadhaar task accepts document1 (front) and document2 (back).
  // Sending both in one task lets IDfy combine OCR from both sides.
  const base64 = imageBuffer.toString("base64");
  const taskId = randomUUID();
  const groupId = randomUUID();

  const data: Record<string, string> = {
    document1: base64,
  };
  if (backImageBuffer) {
    data.document2 = backImageBuffer.toString("base64");
  }

  const submitResponse = await fetch(`${IDFY_BASE_URL}/tasks/async/extract/ind_aadhaar`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      task_id: taskId,
      group_id: groupId,
      data,
      consent: "yes",
    }),
  });

  const submit = (await parseJson(submitResponse)) as IdfyTaskResponse;
  if (!submitResponse.ok) {
    throw new Error(
      `IDfy Aadhaar request failed (${submitResponse.status}): ${submit.message ?? submit.error ?? "Unknown error"}`,
    );
  }

  //debugger;

  const requestId = stringValue(submit.request_id);
  if (!requestId) {
    throw new Error("IDfy did not return a request_id.");
  }

  // Poll the documented GET task endpoint. IDfy's async API can take several minutes;
  // this endpoint waits up to 300 seconds, after which the frontend can ask again if needed.
//   const deadline = Date.now() + 300_000;

//   while (Date.now() < deadline) {
//     await new Promise((resolve) => setTimeout(resolve, 1500));

//     const resultResponse = await fetch(
//       `${IDFY_BASE_URL}/tasks?request_id=${encodeURIComponent(requestId)}`,
//       { method: "GET", headers: headers() },
//     );

//     const task = (await parseJson(resultResponse)) as IdfyTaskResult;
//     if (!resultResponse.ok) {
//       throw new Error(
//         `IDfy task lookup failed (${resultResponse.status}): ${task.message ?? task.error ?? "Unknown error"}`,
//       );
//     }
//     const status = stringValue(task.status).toLowerCase();
//   console.log("IDFY REQUEST ID:", requestId);
// console.log("IDFY TASK STATUS:", status);
// console.log("IDFY TASK RESPONSE:", JSON.stringify(task));




//     if (status === "completed") return mapResult(task);
//     if (["failed", "error", "invalid"].includes(status)) {
//       throw new Error(`IDfy Aadhaar extraction ${status}.`);
//     }
//   }

//   throw new Error("IDfy Aadhaar extraction is still processing. Please retry in a few seconds.");
// Poll IDfy until the task completes or times out.
const deadline = Date.now() + 300_000;

let lastStatus = "";
let lastTask: IdfyTaskResult = {};

while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 1500));

  let resultResponse: Response;

  try {
    resultResponse = await fetch(
      `${IDFY_BASE_URL}/tasks?request_id=${encodeURIComponent(requestId)}`,
      {
        method: "GET",
        headers: headers(),
      },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    console.error("IDFY POLLING NETWORK ERROR:", {
      requestId,
      message,
    });

    throw new Error(
      `IDfy task polling failed. request_id=${requestId}. Network error: ${message}`,
    );
  }

  //const task = (await parseJson(resultResponse)) as IdfyTaskResult;

  // const task = (await parseJson(resultResponse)) as IdfyTaskResult;

const parsed = await parseJson(resultResponse);

const task = (
  Array.isArray(parsed) ? parsed[0] : parsed
) as IdfyTaskResult;



  lastTask = task;

  if (!resultResponse.ok) {
    console.error("IDFY TASK API ERROR:", {
      requestId,
      httpStatus: resultResponse.status,
    });

    throw new Error(
      `IDfy task lookup failed. HTTP ${resultResponse.status}. ` +
        `request_id=${requestId}. ` +
        `message=${task.message ?? ""}. ` +
        `error=${task.error ?? ""}`,
    );
  }

  const status = stringValue(task.status).toLowerCase();
  lastStatus = status;

  // IMPORTANT:
  // Don't log the complete task response because it may contain
  // Aadhaar/PII information.

  if (status === "completed") {

    return mapResult(task);
  }

  if (["failed", "error", "invalid"].includes(status)) {
    console.error("IDFY TASK FAILED:", {
      requestId,
      status,
      message: task.message ?? null,
      error: task.error ?? null,
      type: task.type ?? null,
    });

    throw new Error(
      `IDfy Aadhaar extraction failed. ` +
        `status=${status}, ` +
        `request_id=${requestId}, ` +
        `message=${task.message ?? "none"}, ` +
        `error=${task.error ?? "none"}`,
    );
  }
}

// We reached the timeout.
// Tell us EXACTLY what IDfy was returning.
console.error("IDFY TASK TIMEOUT:", {
  requestId,
  lastStatus,
  message: lastTask.message ?? null,
  error: lastTask.error ?? null,
  type: lastTask.type ?? null,
});

throw new Error(
  `IDfy Aadhaar extraction timed out after 300 seconds. ` +
    `request_id=${requestId}, ` +
    `lastStatus=${lastStatus || "unknown"}, ` +
    `message=${lastTask.message ?? "none"}, ` +
    `error=${lastTask.error ?? "none"}`,
);
  
}
