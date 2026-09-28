package com.ompayroll.faceverify

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import org.json.JSONObject
import java.io.BufferedReader
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

class MainActivity : Activity() {
    companion object {
        private const val FACE_RD_REQUEST_CODE = 7712
        private const val FACE_RD_PACKAGE = "in.gov.uidai.facerd"
        private const val FACE_RD_ACTION = "in.gov.uidai.rdservice.face.CAPTURE"
        private const val EXTRA_REQUEST = "request"
        private const val EXTRA_RESPONSE = "response"
    }

    private val worker = Executors.newSingleThreadExecutor()
    private lateinit var titleView: TextView
    private lateinit var statusView: TextView
    private lateinit var detailView: TextView
    private lateinit var progress: ProgressBar
    private lateinit var captureButton: Button
    private lateinit var installButton: Button

    private var sessionId: String? = null
    private var handoffToken: String? = null
    private var baseUrl: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        consumeIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        consumeIntent(intent)
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(48, 72, 48, 48)
        }
        titleView = TextView(this).apply {
            text = "OMpayroll Aadhaar Face Verification"
            textSize = 22f
            setTypeface(typeface, Typeface.BOLD)
        }
        statusView = TextView(this).apply { textSize = 17f; setPadding(0, 48, 0, 12) }
        detailView = TextView(this).apply { textSize = 14f; setPadding(0, 0, 0, 28) }
        progress = ProgressBar(this).apply { visibility = View.GONE }
        captureButton = Button(this).apply {
            text = "Open Aadhaar Face RD"
            isEnabled = false
            setOnClickListener { beginFaceCapture() }
        }
        installButton = Button(this).apply {
            text = "Install Aadhaar Face RD"
            visibility = View.GONE
            setOnClickListener { openFaceRdPlayStore() }
        }
        root.addView(titleView)
        root.addView(statusView)
        root.addView(detailView)
        root.addView(progress)
        root.addView(captureButton)
        root.addView(installButton)
        setContentView(root)
    }

    private fun consumeIntent(intent: Intent) {
        val uri = intent.data
        if (intent.action != Intent.ACTION_VIEW || uri?.scheme != "ompayroll" || uri.host != "aadhaar-face") {
            showState("Ready", "Scan the QR shown by OMpayroll on the HR computer, or open its Android handoff link.", false)
            return
        }
        sessionId = uri.getQueryParameter("session")?.trim()
        handoffToken = uri.getQueryParameter("token")?.trim()
        baseUrl = uri.getQueryParameter("baseUrl")?.trim()?.trimEnd('/')
        if (sessionId.isNullOrBlank() || handoffToken.isNullOrBlank() || baseUrl.isNullOrBlank()) {
            showState("Invalid verification link", "The OMpayroll handoff is missing required session information.", false)
            return
        }
        if (baseUrl!!.contains("localhost") || baseUrl!!.contains("127.0.0.1")) {
            showState(
                "Phone cannot reach OMpayroll",
                "The server URL points to localhost. Set PUBLIC_APP_URL on the OMpayroll server to an HTTPS URL or a LAN IP reachable by this phone, restart the server, and start a new verification.",
                false
            )
            return
        }
        loadSession()
    }

    private fun loadSession() = runNetwork("Checking verification session…") {
        val json = getJson("${baseUrl}/api/aadhaar/face/mobile/${enc(sessionId!!)}")
        val status = json.optString("status")
        if (status != "PENDING") throw IllegalStateException("Verification session is $status")
        val masked = json.optString("aadhaarMasked", "XXXXXXXXXXXX")
        val mode = json.optString("mode", "provider")
        runOnUiThread {
            val installed = isFaceRdInstalled()
            statusView.text = if (mode == "uidai_test") "UIDAI TEST / UAT · Aadhaar: $masked" else "Employee Aadhaar: $masked"
            detailView.text = if (mode == "uidai_test")
                "UAT mode only. UIDAI-published dummy Aadhaar values may be used. Real Face RD capture still requires a valid UIDAI/AUA test transaction request and signing setup."
            else if (installed)
                "Aadhaar Face RD is installed. Tap below; Face RD will open the phone camera and perform the live face/liveness capture."
            else "Aadhaar Face RD is not installed on this phone. Install the official UIDAI app first."
            progress.visibility = View.GONE
            captureButton.isEnabled = installed
            installButton.visibility = if (installed) View.GONE else View.VISIBLE
        }
    }

    private fun beginFaceCapture() = runNetwork("Preparing UIDAI Face RD…") {
        val json = getJson("${baseUrl}/api/aadhaar/face/mobile/${enc(sessionId!!)}/rd-request")
        val request = json.optString("request")
        if (request.isBlank()) throw IllegalStateException("The AUA/Sub-AUA provider did not return a Face RD capture request")
        runOnUiThread { launchFaceRd(request) }
    }

    private fun launchFaceRd(request: String) {
        try {
            // Do not log or display `request`; it is provider/UIDAI transaction material.
            val faceIntent = Intent(FACE_RD_ACTION).apply {
                setPackage(FACE_RD_PACKAGE)
                putExtra(EXTRA_REQUEST, request)
            }
            statusView.text = "Opening Aadhaar Face RD…"
            detailView.text = "Follow the on-screen Face RD instructions. The camera is controlled by UIDAI Face RD, not OMpayroll."
            startActivityForResult(faceIntent, FACE_RD_REQUEST_CODE)
        } catch (_: ActivityNotFoundException) {
            showState("Aadhaar Face RD not available", "Install/update the official UIDAI Aadhaar Face RD app and try again.", false)
            installButton.visibility = View.VISIBLE
        }
    }

    @Deprecated("Face RD integrations use the Android activity result contract")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != FACE_RD_REQUEST_CODE) return
        val response = data?.getStringExtra(EXTRA_RESPONSE)?.trim().orEmpty()
        if (response.isBlank()) {
            showState("Face capture not completed", "Face RD did not return a capture response. Try again or follow the error shown by Face RD.", true)
            return
        }
        // The encrypted Face RD response is forwarded immediately and never rendered/logged/persisted locally.
        submitFaceRdResponse(response)
    }

    private fun submitFaceRdResponse(faceRdResponse: String) = runNetwork("Submitting secure Face RD result…") {
        try {
            val body = JSONObject().put("faceRdPayload", faceRdResponse).toString()
            val json = postJson("${baseUrl}/api/aadhaar/face/mobile/${enc(sessionId!!)}/rd-result", body)
            when (json.optString("status")) {
                "VERIFIED" -> runOnUiThread { showState("✓ Aadhaar Face Verified", "Authentication completed successfully. You can return to the OMpayroll computer; it will update automatically.", false) }
                "FAILED" -> runOnUiThread { showState("Face authentication failed", json.optString("errorMessage", "UIDAI/provider returned a failed authentication result."), true) }
                else -> runOnUiThread { showState("Verification submitted", "The provider is processing the authentication. Return to OMpayroll; the web screen will continue polling for the final result.", false) }
            }
        } finally {
            // Do not retain biometric/PID response beyond the immediate HTTP submission call.
        }
    }

    private fun isFaceRdInstalled(): Boolean = try {
        packageManager.getPackageInfo(FACE_RD_PACKAGE, 0)
        true
    } catch (_: Exception) { false }

    private fun openFaceRdPlayStore() {
        val market = Uri.parse("market://details?id=$FACE_RD_PACKAGE")
        val web = Uri.parse("https://play.google.com/store/apps/details?id=$FACE_RD_PACKAGE")
        try { startActivity(Intent(Intent.ACTION_VIEW, market)) }
        catch (_: Exception) { startActivity(Intent(Intent.ACTION_VIEW, web)) }
    }

    private fun runNetwork(message: String, task: () -> Unit) {
        progress.visibility = View.VISIBLE
        captureButton.isEnabled = false
        statusView.text = message
        worker.execute {
            try { task() }
            catch (e: Exception) {
                runOnUiThread { showState("Unable to continue", e.message ?: "Network or provider error", true) }
            }
        }
    }

    private fun showState(title: String, detail: String, allowRetry: Boolean) {
        progress.visibility = View.GONE
        statusView.text = title
        detailView.text = detail
        captureButton.isEnabled = allowRetry && isFaceRdInstalled() && !sessionId.isNullOrBlank()
    }

    private fun getJson(url: String): JSONObject = requestJson("GET", url, null)
    private fun postJson(url: String, body: String): JSONObject = requestJson("POST", url, body)

    private fun requestJson(method: String, target: String, body: String?): JSONObject {
        val conn = (URL(target).openConnection() as HttpURLConnection).apply {
            requestMethod = method
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Accept", "application/json")
            setRequestProperty("X-OMpay-Face-Token", handoffToken!!)
            if (body != null) {
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
                outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
        }
        val code = conn.responseCode
        val stream = if (code in 200..299) conn.inputStream else conn.errorStream
        val text = stream?.bufferedReader()?.use(BufferedReader::readText).orEmpty()
        conn.disconnect()
        val json = if (text.isBlank()) JSONObject() else JSONObject(text)
        if (code !in 200..299) throw IllegalStateException(json.optString("error", "Server returned HTTP $code"))
        return json
    }

    private fun enc(value: String): String = java.net.URLEncoder.encode(value, "UTF-8")

    override fun onDestroy() {
        worker.shutdownNow()
        super.onDestroy()
    }
}
