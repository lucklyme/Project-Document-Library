export function isSsoEnabled() {
  return process.env.AUTH_MODE?.trim().toLowerCase() === "sso";
}

export function isLocalAdminFallbackEnabled() {
  return process.env.SSO_LOCAL_ADMIN_FALLBACK?.trim() !== "0";
}
