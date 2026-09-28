export function maskAccountNumber(account: string): string {
  if (!account || account.length < 4) return "****";
  return "*".repeat(account.length - 4) + account.slice(-4);
}

export function maskAadhar(aadhar: string): string {
  if (!aadhar || aadhar.length < 4) return "****-****-****";
  return "XXXX-XXXX-" + aadhar.slice(-4);
}

export function maskPAN(pan: string): string {
  if (!pan || pan.length < 4) return "****";
  return pan.slice(0, 2) + "*".repeat(pan.length - 4) + pan.slice(-2);
}

export function maskIfsc(ifsc: string): string {
  if (!ifsc || ifsc.length < 4) return "****";
  return ifsc.slice(0, 4) + "****" + ifsc.slice(-4);
}
