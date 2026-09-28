# OMpayroll Android Aadhaar Face Verification Companion

This is a small Android companion for the OMpayroll web onboarding flow. It does not capture a selfie itself.

Flow:
1. OMpayroll web creates a short-lived Aadhaar Face session and QR/deep link.
2. Android opens `ompayroll://aadhaar-face?...`.
3. Companion validates the session using a one-time handoff token.
4. Companion asks the OMpayroll backend for the AUA/Sub-AUA-generated Face RD request.
5. Companion invokes the installed UIDAI Aadhaar Face RD app using action `in.gov.uidai.rdservice.face.CAPTURE`, request extra `request`.
6. Face RD owns camera/liveness/PID encryption and returns the opaque response under extra `response`.
7. Companion forwards that opaque response to OMpayroll backend immediately. It never displays, logs, or stores it.
8. Backend forwards it to the configured AUA/Sub-AUA provider and updates the browser session.

## Build
Open this folder in Android Studio (JDK 17) and build the `app` module.

## Phone prerequisites
- Android 9+ (follow current UIDAI device requirements)
- Official Aadhaar Face RD installed (`in.gov.uidai.facerd`)
- Phone can reach the OMpayroll `PUBLIC_APP_URL`

For local development, set `PUBLIC_APP_URL` to the computer's LAN address, not `localhost`, e.g. `http://192.168.1.20:5000`, and ensure the firewall allows the API port. Release builds reject cleartext HTTP; use HTTPS in production.

## Production prerequisite
`AADHAAR_FACE_MODE=provider` plus the AUA/Sub-AUA provider API. The provider must supply the Face RD request payload and accept the Face RD response. OMpayroll intentionally does not fabricate those UIDAI/provider values.

## UIDAI test/UAT mode

When the server runs with `AADHAAR_FACE_MODE=uidai_test`, the companion clearly labels the session as UIDAI TEST/UAT. The Android handoff works normally, but Face RD can only be launched when the server can provide a valid Face RD request generated from official UIDAI/AUA test transaction/signing material. Do not fabricate this request. OMpayroll can still complete a clearly-labelled simulated UAT response from the web UI to test the overall workflow.
