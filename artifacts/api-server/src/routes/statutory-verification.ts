import { Router, type IRouter } from "express";
import { requireClientAuth, requirePasswordChanged, requireClientPermission } from "../lib/client-auth.js";
import { assertWorkerScope } from "../lib/scope-guard.js";
import { logClientAction } from "../lib/client-audit.js";
import { verifyStatutoryId, type StatutoryKind } from "../lib/idfy-statutory-service.js";
import { createStatutoryVerificationToken } from "../lib/statutory-verification-token.js";
import { verifyUanWithAuthBridge } from "../lib/authbridge-uan-service.js";
import { verifyEsicWithMeonMock } from "../lib/meon-esic-mock-service.js";
import { startUanDigilocker, completeUanDigilocker } from "../lib/meon-digilocker-service.js";

const router: IRouter=Router();
const canWrite=[requireClientAuth,requirePasswordChanged,requireClientPermission("workers","write")];
router.post("/workers/statutory/verify",...canWrite,async(req:any,res:any)=>{
  const body=req.body as Record<string,unknown>;
  const kind=String(body.kind??"").toLowerCase() as StatutoryKind;
  const value=String(body.value??"").replace(/\s/g,"");
  const employeeName=String(body.employeeName??"").trim();
  const compid=Number(body.compid);
  const unitcode=body.unitcode!=null&&body.unitcode!==""?String(body.unitcode):undefined;
  const fatherName=String(body.fatherName??"").trim();
  const contactNumber=String(body.contactNumber??"").trim();
  const dob=String(body.dob??"").trim();
  if(!["uan","esic"].includes(kind)){res.status(400).json({error:"kind must be uan or esic"});return;}
  if(!employeeName){res.status(400).json({error:"Employee name is required before verification"});return;}
  if(!Number.isFinite(compid)){res.status(400).json({error:"Select company before verification"});return;}
  if(kind==="uan"&&!/^\d{12}$/.test(value)){res.status(400).json({error:"UAN must be exactly 12 digits"});return;}
  if(kind==="esic"&&!/^\d{10}$/.test(value)){res.status(400).json({error:"ESIC/IP number must be exactly 10 digits"});return;}
  if(!(await assertWorkerScope(req,res,compid,undefined,undefined,unitcode))) return;
  try{
    const uanMode=(process.env.UAN_VERIFICATION_MODE ?? "mock").trim().toLowerCase();
    const esicMode=(process.env.ESIC_VERIFICATION_MODE ?? "meon-mock").trim().toLowerCase();
    const result=kind==="uan" && uanMode==="authbridge"
      ? await verifyUanWithAuthBridge({uan:value,employeeName,fatherName,contactNumber,dob})
      : kind==="esic" && esicMode==="meon-mock"
        ? await verifyEsicWithMeonMock({esicNumber:value,employeeName})
        : await verifyStatutoryId(kind,value,employeeName);
    const proof=result.verified?createStatutoryVerificationToken({kind,value,status:"VERIFIED",provider:result.provider,referenceId:result.referenceId,userId:req.clientUser!.id}):null;
    await logClientAction(req.clientUser!.id,`worker.${kind}.verify`,{compid,verified:result.verified,provider:result.provider,referenceId:result.referenceId});
    res.json({...result,verificationToken:proof});
  }catch(e){res.status(422).json({error:e instanceof Error?e.message:"Verification failed"});}
});

router.post("/workers/uan/digilocker/start",...canWrite,async(req:any,res:any)=>{
  const uan=String(req.body?.uan??"").replace(/\s/g,"");
  if(!/^\d{12}$/.test(uan)){res.status(400).json({error:"UAN must be exactly 12 digits"});return;}
  try{
    const result=await startUanDigilocker(uan,req.clientUser!.id);
    await logClientAction(req.clientUser!.id,"worker.uan.digilocker.start",{provider:"meon-digilocker"});
    res.json(result);
  }catch(e){res.status(422).json({error:e instanceof Error?e.message:"Unable to start UAN DigiLocker"});}
});

router.post("/workers/uan/digilocker/complete",...canWrite,async(req:any,res:any)=>{
  const sessionToken=String(req.body?.sessionToken??"").trim();
  if(!sessionToken){res.status(400).json({error:"sessionToken is required"});return;}
  try{
    const result=await completeUanDigilocker(sessionToken,req.clientUser!.id);
    await logClientAction(req.clientUser!.id,"worker.uan.digilocker.complete",{provider:"meon-digilocker",success:result.success});
    res.json(result);
  }catch(e){res.status(422).json({error:e instanceof Error?e.message:"Unable to fetch UAN Card"});}
});

export default router;
