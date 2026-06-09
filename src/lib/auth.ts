import crypto from "node:crypto";
import { cookies } from "next/headers";

const clerkCookie = "document_vault_clerk";
const tokenMaxAgeSeconds = 60 * 60 * 8;

type SessionPayload = {
  scope: string;
  exp: number;
};

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string | null) {
  if (!storedHash) {
    return false;
  }

  const [, salt, expected] = storedHash.split(":");
  if (!salt || !expected) {
    return false;
  }

  const actual = crypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return safeEqual(actual, expected);
}

export function verifyClerkPassword(password: string) {
  const expectedHash = process.env.CLERK_PASSWORD_HASH ?? null;
  if (expectedHash) {
    return verifyPassword(password, expectedHash);
  }

  const expectedPassword = process.env.CLERK_PASSWORD;
  return typeof expectedPassword === "string" && expectedPassword.length > 0 && safeEqual(password, expectedPassword);
}

export async function isClerkSession() {
  return Boolean(await readSession(clerkCookie, "clerk"));
}

export async function setClerkSession() {
  await writeSession(clerkCookie, "clerk");
}

export async function clearClerkSession() {
  (await cookies()).delete(clerkCookie);
}

async function writeSession(name: string, scope: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + tokenMaxAgeSeconds;
  const payload: SessionPayload = { scope, exp: expiresAt };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body);

  (await cookies()).set(name, `${body}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: tokenMaxAgeSeconds,
    path: "/"
  });
}

async function readSession(name: string, scope: string) {
  const token = (await cookies()).get(name)?.value;
  if (!token) {
    return null;
  }

  const [body, signature] = token.split(".");
  if (!body || !signature || !safeEqual(sign(body), signature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    if (payload.scope !== scope || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function sign(value: string) {
  const secret = process.env.AUTH_SECRET ?? process.env.CLERK_PASSWORD ?? "document-vault-local-secret";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);
  return aBuffer.length === bBuffer.length && crypto.timingSafeEqual(aBuffer, bBuffer);
}
