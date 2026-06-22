import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type UserRole, type UserRow } from "@/lib/db";
import { verifyPassword } from "@/lib/password";

const sessionCookie = "pdl_session";
const sessionMaxAgeSeconds = 60 * 60 * 8;
const rememberedSessionMaxAgeSeconds = 60 * 60 * 24 * 7;
const maxFailedLogins = 5;
const lockoutMinutes = 15;

export type CurrentUser = Pick<UserRow, "id" | "email" | "name" | "role"> & {
  authProvider?: UserRow["auth_provider"];
  loginName?: string | null;
};

export type RequestContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

export function canMaintain(user: CurrentUser | null) {
  return Boolean(user && (user.role === "clerk" || user.role === "admin"));
}

export function canAdmin(user: CurrentUser | null) {
  return user?.role === "admin";
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const database = getDb();
  const row = database
    .prepare(
      `SELECT u.id, u.email, u.name, u.role, u.auth_provider AS authProvider, u.login_name AS loginName, u.is_active
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(tokenHash, now) as (CurrentUser & { is_active: 0 | 1 }) | undefined;

  if (!row || row.is_active !== 1) {
    await clearSession();
    return null;
  }

  database.prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?").run(now, tokenHash);
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    authProvider: row.authProvider,
    loginName: row.loginName
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireRole(roles: UserRole[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/?error=forbidden");
  }
  return user;
}

export async function authenticateUser(
  email: string,
  password: string,
  context: RequestContext,
  remember = false,
  options: { adminOnly?: boolean } = {}
) {
  const database = getDb();
  const normalizedEmail = email.trim().toLowerCase();
  const user = database
    .prepare("SELECT * FROM users WHERE email = ? AND auth_provider = 'local'")
    .get(normalizedEmail) as UserRow | undefined;
  const now = new Date();

  if (!user || user.is_active !== 1) {
    return { ok: false as const, reason: "invalid" as const, user: null };
  }

  if (options.adminOnly && user.role !== "admin") {
    return { ok: false as const, reason: "invalid" as const, user };
  }

  if (user.locked_until && new Date(user.locked_until) > now) {
    return { ok: false as const, reason: "locked" as const, user };
  }

  if (!verifyPassword(password, user.password_hash)) {
    const failedCount = user.failed_login_count + 1;
    const lockedUntil =
      failedCount >= maxFailedLogins ? new Date(now.getTime() + lockoutMinutes * 60 * 1000).toISOString() : null;
    database
      .prepare("UPDATE users SET failed_login_count = ?, locked_until = ?, updated_at = ? WHERE id = ?")
      .run(failedCount, lockedUntil, now.toISOString(), user.id);
    return { ok: false as const, reason: lockedUntil ? ("locked" as const) : ("invalid" as const), user };
  }

  database
    .prepare(
      `UPDATE users
       SET failed_login_count = 0, locked_until = NULL, last_login_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(now.toISOString(), now.toISOString(), user.id);
  await createSession(user, context, remember);
  return { ok: true as const, user };
}

export async function createSession(user: Pick<UserRow, "id">, context: RequestContext, remember = false) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const now = new Date();
  const maxAge = remember ? rememberedSessionMaxAgeSeconds : sessionMaxAgeSeconds;
  const expiresAt = new Date(now.getTime() + maxAge * 1000).toISOString();

  getDb()
    .prepare(
      `INSERT INTO sessions (user_id, token_hash, expires_at, created_at, last_seen_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, tokenHash, expiresAt, now.toISOString(), now.toISOString(), context.ipAddress, context.userAgent);

  (await cookies()).set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: shouldUseSecureCookies(),
    maxAge,
    path: "/"
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (token) {
    getDb().prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
  }
  cookieStore.delete(sessionCookie);
}

export async function getRequestContext(): Promise<RequestContext> {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || headerStore.get("x-real-ip") || null,
    userAgent: headerStore.get("user-agent") || null
  };
}

export function getRequestContextFromRequest(request: Request): RequestContext {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwardedFor || request.headers.get("x-real-ip") || null,
    userAgent: request.headers.get("user-agent")
  };
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}

export function shouldUseSecureCookies() {
  return process.env.APP_BASE_URL?.trim().toLowerCase().startsWith("https://") ?? false;
}
