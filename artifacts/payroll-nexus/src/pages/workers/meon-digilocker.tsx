import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("payroll_nexus_token")}`,
  "Content-Type": "application/json",
});

export type AadhaarDigilockerResult = {
  aadhaarReference: string;
  name: string;
  dob: string;
  gender: string;
  fatherName: string;
  address: string;
  house: string;
  locality: string;
  district: string;
  state: string;
  pincode: string;
  country: string;
  photoUrl?: string;
};

export function AadhaarDigilockerPanel({ onVerified }: { onVerified: (data: AadhaarDigilockerResult) => void }) {
  const { toast } = useToast();
  const storageKey = "ompayroll_aadhaar_digilocker_session";
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem(storageKey));
  const [starting, setStarting] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [verified, setVerified] = useState(false);
  const autoFetchAttempted = useRef(false);
  const digilockerWindow = useRef<Window | null>(null);

  async function start() {
    setStarting(true);
    setVerified(false);
    autoFetchAttempted.current = false;
    try {
      const r = await fetch("/api/aadhaar/digilocker/start", { method: "POST", headers: authHeaders(), body: "{}" });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Unable to start DigiLocker");
      setSessionToken(data.sessionToken);
      sessionStorage.setItem(storageKey, data.sessionToken);
      // Keep a reference to the popup so OMpayroll can close it after a successful
      // DigiLocker fetch. If the browser blocks popups, the normal manual flow still works.
      const popup = window.open(data.url, "ompayroll_aadhaar_digilocker", "popup=yes");
      digilockerWindow.current = popup;
      toast({ title: "DigiLocker opened", description: "Complete Aadhaar consent in DigiLocker. When you return here, OMpayroll will try to fetch the verified Aadhaar details automatically." });
    } catch (e) {
      toast({ title: "Unable to start Aadhaar DigiLocker", description: e instanceof Error ? e.message : "Request failed", variant: "destructive" });
    } finally { setStarting(false); }
  }

  async function complete(options?: { silent?: boolean }) {
    if (!sessionToken || fetching || verified) return false;
    setFetching(true);
    try {
      const r = await fetch("/api/aadhaar/digilocker/complete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ sessionToken }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Unable to fetch Aadhaar data");
      onVerified(data.data);
      setVerified(true);
      setSessionToken(null);
      sessionStorage.removeItem(storageKey);
      try {
        if (digilockerWindow.current && !digilockerWindow.current.closed) digilockerWindow.current.close();
      } catch {
        // Cross-origin/browser restrictions may prevent scripted closing; never block Aadhaar fetch.
      }
      digilockerWindow.current = null;
      toast({ title: "Aadhaar details fetched", description: `${data.data?.name ?? "Employee"} · ${data.data?.aadhaarReference ?? ""}` });
      return true;
    } catch (e) {
      if (!options?.silent) {
        toast({ title: "Aadhaar fetch not ready", description: e instanceof Error ? e.message : "Request failed. Complete DigiLocker verification and try again.", variant: "destructive" });
      }
      return false;
    } finally { setFetching(false); }
  }

  useEffect(() => {
    if (!sessionToken || verified) return;

    const tryFetchOnReturn = () => {
      if (document.visibilityState !== "visible" || autoFetchAttempted.current) return;
      autoFetchAttempted.current = true;
      window.setTimeout(() => { void complete({ silent: true }); }, 800);
    };

    window.addEventListener("focus", tryFetchOnReturn);
    document.addEventListener("visibilitychange", tryFetchOnReturn);
    return () => {
      window.removeEventListener("focus", tryFetchOnReturn);
      document.removeEventListener("visibilitychange", tryFetchOnReturn);
    };
  }, [sessionToken, verified]);

  return <div className="rounded-md border bg-muted/20 p-3 space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> Meon DigiLocker Aadhaar</div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={start} disabled={starting || fetching}>
        {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />} Verify via DigiLocker
      </Button>
      <Button type="button" size="sm" onClick={() => void complete()} disabled={!sessionToken || fetching || verified}>
        {fetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
        {verified ? "Aadhaar Fetched" : "Fetch Aadhaar Details"}
      </Button>
    </div>
    <p className="text-xs text-muted-foreground">
      {verified
        ? "Verified Aadhaar details were fetched from DigiLocker and filled into the employee form."
        : sessionToken
          ? "Complete consent in the DigiLocker tab, then return here. OMpayroll will try automatically; if needed, click Fetch Aadhaar Details."
          : "Start DigiLocker verification first. The fetch button will become available for the active verification session."}
    </p>
  </div>;
}

export function UanDigilockerPanel({ uan, onFetched }: { uan: string; onFetched: (data: any) => void }) {
  const { toast } = useToast();
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [fetching, setFetching] = useState(false);

  async function start() {
    if (!/^\d{12}$/.test(uan)) {
      toast({ title: "Enter a valid UAN", description: "UAN must be exactly 12 digits.", variant: "destructive" });
      return;
    }
    setStarting(true);
    try {
      const r = await fetch("/api/workers/uan/digilocker/start", { method: "POST", headers: authHeaders(), body: JSON.stringify({ uan }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Unable to start UAN DigiLocker");
      setSessionToken(data.sessionToken);
      window.open(data.url, "_blank", "noopener,noreferrer");
      toast({ title: "DigiLocker opened", description: "Complete UAN Card consent, then return and click Fetch UAN Card." });
    } catch (e) {
      toast({ title: "Unable to start UAN DigiLocker", description: e instanceof Error ? e.message : "Request failed", variant: "destructive" });
    } finally { setStarting(false); }
  }

  async function complete() {
    if (!sessionToken) return;
    setFetching(true);
    try {
      const r = await fetch("/api/workers/uan/digilocker/complete", { method: "POST", headers: authHeaders(), body: JSON.stringify({ sessionToken }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "Unable to fetch UAN Card");
      onFetched(data);
      toast({ title: "UAN Card fetched", description: data.message ?? "Meon returned DigiLocker UAN data." });
    } catch (e) {
      toast({ title: "UAN fetch failed", description: e instanceof Error ? e.message : "Request failed", variant: "destructive" });
    } finally { setFetching(false); }
  }

  return <div className="mt-2 rounded-md border bg-muted/20 p-3 space-y-2">
    <div className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4" /> Meon DigiLocker UAN Card</div>
    <div className="flex flex-wrap gap-2">
      <Button type="button" size="sm" variant="outline" onClick={start} disabled={starting}>
        {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ExternalLink className="h-4 w-4 mr-2" />} Verify UAN via DigiLocker
      </Button>
      {sessionToken && <Button type="button" size="sm" onClick={complete} disabled={fetching}>
        {fetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />} Fetch UAN Card
      </Button>}
    </div>
  </div>;
}
