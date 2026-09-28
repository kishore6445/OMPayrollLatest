import crypto from "node:crypto";

type Proof = { kind:"uan"|"esic"; value:string; status:"VERIFIED"; provider:string; referenceId:string; userId:number; exp:number };
function secret(){ const s=process.env.SESSION_SECRET; if(!s) throw new Error("SESSION_SECRET is required"); return s; }
export function createStatutoryVerificationToken(p: Omit<Proof,"exp">): string {
  const payload: Proof={...p,exp:Date.now()+15*60_000};
  const enc=Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig=crypto.createHmac("sha256",secret()).update(enc).digest("base64url");
  return `${enc}.${sig}`;
}
export function verifyStatutoryVerificationToken(token:string): Proof {
  const [enc,sig]=token.split("."); if(!enc||!sig) throw new Error("Invalid statutory verification proof");
  const expected=crypto.createHmac("sha256",secret()).update(enc).digest("base64url");
  const a=Buffer.from(sig), b=Buffer.from(expected); if(a.length!==b.length||!crypto.timingSafeEqual(a,b)) throw new Error("Invalid statutory verification proof");
  const p=JSON.parse(Buffer.from(enc,"base64url").toString()) as Proof; if(Date.now()>p.exp) throw new Error("Statutory verification expired. Verify again."); return p;
}
