import { NextResponse } from "next/server";
import { shouldUseSecureCookies } from "@/lib/auth";
import { isSsoEnabled } from "@/lib/auth-mode";
import { createSsoAuthorization } from "@/lib/sso";

const cookieMaxAge = 10 * 60;

export async function GET() {
  if (!isSsoEnabled()) {
    return NextResponse.redirect(new URL("/login", fallbackBaseUrl()));
  }

  try {
    const authorization = await createSsoAuthorization();
    const response = NextResponse.redirect(authorization.url);
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: shouldUseSecureCookies(),
      maxAge: cookieMaxAge,
      path: "/"
    };
    response.cookies.set("pdl_sso_state", authorization.state, cookieOptions);
    response.cookies.set("pdl_sso_nonce", authorization.nonce, cookieOptions);
    response.cookies.set("pdl_sso_code_verifier", authorization.codeVerifier, cookieOptions);
    return response;
  } catch (error) {
    console.error("SSO authorization initialization failed", error);
    return NextResponse.redirect(new URL("/login?error=sso_config", fallbackBaseUrl()));
  }
}

function fallbackBaseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}
