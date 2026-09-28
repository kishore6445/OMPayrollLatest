import { setAuthTokenGetter } from "@workspace/api-client-react";

export function setupAuth() {
  setAuthTokenGetter(() => {
    return localStorage.getItem("payroll_nexus_token");
  });
}
