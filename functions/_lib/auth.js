import { error } from "./http.js";

export function requireAdminToken(request, env) {
  const incoming = request.headers.get("x-admin-token") || "";
  if (!env.ADMIN_TOKEN || incoming !== env.ADMIN_TOKEN) {
    return error(401, "Unauthorized");
  }
  return null;
}
