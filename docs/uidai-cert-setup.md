# UIDAI Certificate Configuration for Aadhaar QR Verification

## Overview

Aadhaar Secure QR codes are signed by UIDAI using RSA-SHA256. PayrollOM verifies
this signature before extracting any personal data from a QR code. To do this in
production, you must provide the UIDAI public certificate.

---

## Development (no certificate needed)

When `NODE_ENV` is not `"production"` and `UIDAI_QR_CERT` is not set, the server
**automatically skips** signature verification with a startup warning:

```
WARN: UIDAI_QR_CERT is not set — Aadhaar signature verification is auto-skipped in development.
```

The QR parsing, field extraction, autofill, and consent flows all work normally
in development. You do not need the certificate to test the feature locally.

---

## Production Setup

### Step 1 — Obtain the UIDAI public certificate

1. Visit the UIDAI official resources page:  
   **https://uidai.gov.in/ecosystem/authentication-devices-documents/about-aadhaar-qr-code-reader.html**

2. Download the **Secure QR Code public key / certificate** (PEM format).

3. The certificate will be a `.pem` or `.cer` file containing:
   ```
   -----BEGIN CERTIFICATE-----
   MIIFrjCCA5agA...
   -----END CERTIFICATE-----
   ```

> **Note:** UIDAI periodically rotates this certificate. Check their site for the
> latest version and plan rotation before the certificate expires. PayrollOM logs
> a warning when fewer than 30 days remain before expiry.

### Step 2 — Set the environment variable

#### On Replit (Secrets)
1. Open the **Secrets** panel (🔒 icon in the sidebar).
2. Add a secret with key `UIDAI_QR_CERT` and the full PEM content as the value
   (including the `-----BEGIN CERTIFICATE-----` and `-----END CERTIFICATE-----` lines).

#### Locally (.env)
Add to your `.env` file:
```bash
UIDAI_QR_CERT=-----BEGIN CERTIFICATE-----
MIIFrjCCA5agA...your certificate content here...
-----END CERTIFICATE-----
```

Or load from a file in your startup script:
```bash
export UIDAI_QR_CERT="$(cat /path/to/uidai-qr-cert.pem)"
```

### Step 3 — Verify at startup

When the certificate is correctly configured, the server starts with **no UIDAI
cert warnings**. If the certificate is malformed, the server throws immediately
at startup:

```
Error: UIDAI_QR_CERT is not a valid PEM certificate: ...
```

If the certificate is close to expiry:
```
WARN: UIDAI_QR_CERT expires soon — plan cert rotation  { daysLeft: 28 }
```

---

## Development Override (bypass verification)

To explicitly disable signature verification in any environment (testing only):

```bash
UIDAI_QR_SKIP_VERIFY=true
```

A startup warning is always emitted when this is set:
```
WARN: UIDAI_QR_SKIP_VERIFY=true — Aadhaar signature verification is DISABLED. NEVER enable in production.
```

**Never set `UIDAI_QR_SKIP_VERIFY=true` in a production deployment.**

---

## Certificate Rotation

When UIDAI issues a new certificate:
1. Download the new PEM from the UIDAI resources page.
2. Update the `UIDAI_QR_CERT` secret in your deployment environment.
3. Restart the API server (the cert is loaded at startup).
4. The old certificate can be archived — no database changes are needed.

---

## Security Notes

- The full Aadhaar UID is **never logged**, stored in any log file, or returned
  in API responses. Only the masked reference (e.g., `XXXX XXXX 1234`) is returned.
- Consent metadata (timestamp, user, purpose) is logged for each QR verification.
- The `UIDAI_QR_CERT` secret must be stored only in the deployment secrets manager
  (Replit Secrets, AWS Secrets Manager, etc.) — never committed to source control.
- Photo bytes from V2 QR codes are discarded before any data is returned.
