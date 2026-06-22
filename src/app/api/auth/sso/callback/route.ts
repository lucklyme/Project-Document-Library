import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { createSession, getRequestContextFromRequest } from "@/lib/auth";
import { isSsoEnabled } from "@/lib/auth-mode";
import { completeSsoCallback } from "@/lib/sso";

export async function GET(request: Request) {
  const context = getRequestContextFromRequest(request);
  const url = new URL(request.url);
  const state = request.headers.get("cookie") ? readCookie(request, "pdl_sso_state") : "";
  const nonce = request.headers.get("cookie") ? readCookie(request, "pdl_sso_nonce") : "";
  const codeVerifier = request.headers.get("cookie") ? readCookie(request, "pdl_sso_code_verifier") : "";

  if (!isSsoEnabled()) {
    return redirectWithClearedCookies("/login");
  }

  if (!state || !nonce || !codeVerifier) {
    writeAuditLog({
      action: "auth.sso_callback_failed",
      result: "failure",
      message: "missing SSO cookies",
      context
    });
    return redirectWithClearedCookies("/login?error=sso");
  }

  try {
    const user = await completeSsoCallback({
      currentUrl: url.toString(),
      expectedState: state,
      expectedNonce: nonce,
      codeVerifier
    });
    await createSession(user, context, false);
    writeAuditLog({
      user,
      action: "auth.sso_login",
      context,
      metadata: { provider: "synology-sso" }
    });
    return redirectWithClearedCookies("/");
  } catch (error) {
    writeAuditLog({
      action: "auth.sso_callback_failed",
      result: "failure",
      message: error instanceof Error ? error.message : "SSO callback failed",
      context
    });
    return redirectWithClearedCookies("/login?error=sso");
  }
}

function redirectWithClearedCookies(path: string) {
  const response = NextResponse.redirect(new URL(path, process.env.APP_BASE_URL || "http://localhost:3000"));
  response.cookies.delete("pdl_sso_state");
  response.cookies.delete("pdl_sso_nonce");
  response.cookies.delete("pdl_sso_code_verifier");
  return response;
}

function readCookie(request: Request, name: string) {
  const cookies = request.headers.get("cookie")?.split(";") ?? [];
  const prefix = `${name}=`;
  const cookie = cookies.map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
}
