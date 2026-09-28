import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarcodeFormat, QRCodeWriter } from "@zxing/library";
import { CheckCircle2, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

type FaceStatus = "IDLE" | "PENDING" | "VERIFIED" | "FAILED" | "EXPIRED";

type SessionResponse = {
  sessionId: string;
  status: FaceStatus;
  aadhaarMasked?: string;
  handoffUrl?: string;
  expiresAt?: string;
  verifiedAt?: string | null;
  providerTxnId?: string | null;
  mode?: "mock" | "uidai_test" | "provider";
  error?: string | null;
};

function normalized(value: string): string {
  return value.replace(/[\s-]/g, "");
}

function QrSvg({ value }: { value: string }) {
  const cells = useMemo(() => {
    if (!value) return null;
    try {
      const matrix = new QRCodeWriter().encode(value, BarcodeFormat.QR_CODE, 33, 33);
      const rects: ReactNode[] = [];
      for (let y = 0; y < matrix.getHeight(); y++) {
        for (let x = 0; x < matrix.getWidth(); x++) {
          if (matrix.get(x, y)) rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
        }
      }
      return { width: matrix.getWidth(), height: matrix.getHeight(), rects };
    } catch {
      return null;
    }
  }, [value]);

  if (!cells) return null;
  return (
    <svg
      aria-label="Android Aadhaar Face verification QR code"
      role="img"
      viewBox={`0 0 ${cells.width} ${cells.height}`}
      className="h-44 w-44 rounded-md border bg-white p-2 text-black"
    >
      <rect width="100%" height="100%" fill="white" />
      <g fill="currentColor">{cells.rects}</g>
    </svg>
  );
}

export function AadhaarFacePanel({
  aadhaarNumber,
  empCode,
  onVerified,
  onReset,
}: {
  aadhaarNumber: string;
  empCode?: string;
  onVerified: (verificationId: string) => void;
  onReset?: () => void;
}) {
  const { toast } = useToast();
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [session, setSession] = useState<SessionResponse | null>(null);
  const digits = normalized(aadhaarNumber);
  const validShape = /^\d{12}$/.test(digits);

  useEffect(() => {
    setSession(null);
    setConsent(false);
    onReset?.();
  }, [digits]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.sessionId || session.status !== "PENDING") return;
    const timer = window.setInterval(async () => {
      try {
        const r = await fetch(`/api/aadhaar/face/${encodeURIComponent(session.sessionId)}`, { headers: authHeaders() });
        const data = await r.json() as SessionResponse;
        if (!r.ok) return;
        setSession((prev) => prev ? { ...prev, ...data } : data);
        if (data.status === "VERIFIED") {
          onVerified(data.sessionId);
          toast({ title: data.mode === "uidai_test" ? "UIDAI test workflow completed" : "Aadhaar Face verified", description: data.mode === "uidai_test" ? "UAT/test result only — this is not a production Aadhaar authentication." : "UIDAI Face Authentication was completed successfully." });
        }
      } catch {
        // Keep polling; transient network failures should not cancel the verification session.
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [session?.sessionId, session?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    if (!validShape) {
      toast({ title: "Enter Aadhaar number", description: "Enter the employee's 12-digit Aadhaar number first.", variant: "destructive" });
      return;
    }
    if (!consent) {
      toast({ title: "Consent required", description: "The employee must consent to Aadhaar Face Authentication.", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const r = await fetch("/api/aadhaar/face/start", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ aadhaarNumber: digits, empCode: empCode || undefined, consent: true }),
      });
      const data = await r.json() as SessionResponse & { error?: string };
      if (!r.ok) throw new Error(data.error || "Unable to start Aadhaar Face Authentication");
      setSession(data);
    } catch (error) {
      toast({ title: "Could not start Face Authentication", description: error instanceof Error ? error.message : "Please try again.", variant: "destructive" });
    } finally {
      setStarting(false);
    }
  }

  async function mockComplete() {
    if (!session?.sessionId) return;
    const r = await fetch(`/api/aadhaar/face/${encodeURIComponent(session.sessionId)}/mock-complete`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({}),
    });
    const data = await r.json() as { error?: string };
    if (!r.ok) toast({ title: "Mock completion failed", description: data.error || "Unable to complete mock verification", variant: "destructive" });
  }

  async function uidaiTestComplete() {
    if (!session?.sessionId) return;
    const r = await fetch(`/api/aadhaar/face/${encodeURIComponent(session.sessionId)}/uidai-test-complete`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({}),
    });
    const data = await r.json() as { error?: string };
    if (!r.ok) toast({ title: "UIDAI test completion failed", description: data.error || "Unable to complete UAT workflow", variant: "destructive" });
    else toast({ title: "UAT response simulated", description: "This validates OMpayroll workflow only; it is not a CIDR biometric match." });
  }

  async function copyHandoff() {
    if (!session?.handoffUrl) return;
    await navigator.clipboard.writeText(session.handoffUrl);
    toast({ title: "Android handoff link copied" });
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-5 w-5 mt-0.5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Aadhaar Face Authentication</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            The employee enters Aadhaar manually. Face capture is performed on Android through the Aadhaar Face RD flow — not by the browser webcam.
          </p>
        </div>
      </div>

      {session?.mode === "uidai_test" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <strong>UIDAI TEST / UAT MODE.</strong> Use only UIDAI-published dummy Aadhaar values. A simulated UAT success is not a production CIDR face match.
        </div>
      )}

      {!session && (
        <>
          <label className="flex items-start gap-2 text-xs cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>I confirm the employee has consented to Aadhaar authentication for employee identity verification.</span>
          </label>
          <Button type="button" size="sm" onClick={start} disabled={starting || !validShape || !consent}>
            {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Smartphone className="h-4 w-4 mr-2" />}
            Start Face Verification
          </Button>
        </>
      )}

      {session?.status === "PENDING" && (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] items-center">
          {session.handoffUrl && <QrSvg value={session.handoffUrl} />}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="h-4 w-4 animate-spin" /> Waiting for Android Face RD
            </div>
            <p className="text-xs text-muted-foreground">
              {session.mode === "uidai_test"
                ? "UIDAI test/UAT mode is active. Scan this QR to exercise the Android handoff. Real Face RD capture additionally requires official UIDAI/AUA test transaction/signing material."
                : "Scan this QR using the OMpayroll Android verification companion. It will hand off to Aadhaar Face RD and this screen will update automatically."}
            </p>
            <p className="text-xs font-mono">Session: {session.sessionId}</p>
            <div className="flex flex-wrap gap-2">
              {session.handoffUrl && (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={copyHandoff}><Copy className="h-3.5 w-3.5 mr-1.5" />Copy link</Button>
                  <Button type="button" variant="outline" size="sm" asChild><a href={session.handoffUrl}><ExternalLink className="h-3.5 w-3.5 mr-1.5" />Open on this Android device</a></Button>
                </>
              )}
              {session.mode === "mock" && <Button type="button" variant="secondary" size="sm" onClick={mockComplete}>Simulate Face RD success</Button>}
              {session.mode === "uidai_test" && <Button type="button" variant="secondary" size="sm" onClick={uidaiTestComplete}>Simulate UIDAI UAT response</Button>}
            </div>
          </div>
        </div>
      )}

      {session?.status === "VERIFIED" && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          <span><strong>{session.mode === "uidai_test" ? "Test workflow verified (UAT only)" : "Face verified"}</strong>{session.aadhaarMasked ? ` · ${session.aadhaarMasked}` : ""}</span>
        </div>
      )}

      {(session?.status === "FAILED" || session?.status === "EXPIRED") && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <XCircle className="h-4 w-4" />
            <span>{session.status === "EXPIRED" ? "Verification session expired." : (session.error || "Face authentication failed.")}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => setSession(null)}><RefreshCw className="h-3.5 w-3.5 mr-1.5" />Try again</Button>
        </div>
      )}
    </div>
  );
}
