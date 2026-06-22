import https from "node:https";
import { Issuer, custom, generators, type Client } from "openid-client";
import { getDb, type UserRow } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth";

const provider = "synology-sso";
const disabledPasswordHash = "sso:password-disabled";
const defaultScope = "openid profile email";

let clientPromise: Promise<Client> | null = null;

type SsoProfile = {
  subject: string;
  email: string;
  loginName: string;
  displayName: string;
};

export function getSsoRedirectUri() {
  return `${getAppBaseUrl()}/api/auth/sso/callback`;
}

export async function createSsoAuthorization() {
  const client = await getSsoClient();
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  const url = client.authorizationUrl({
    scope: process.env.SSO_SCOPE?.trim() || defaultScope,
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256"
  });

  return {
    url,
    state,
    nonce,
    codeVerifier
  };
}

export async function getSsoLogoutUrl() {
  const client = await getSsoClient();
  const endSessionEndpoint = client.issuer.metadata.end_session_endpoint;
  if (!endSessionEndpoint) {
    return "/login";
  }

  const url = new URL(endSessionEndpoint);
  url.searchParams.set("post_logout_redirect_uri", `${getAppBaseUrl()}/login`);
  return url.toString();
}

export async function completeSsoCallback(input: {
  currentUrl: string;
  expectedState: string;
  expectedNonce: string;
  codeVerifier: string;
}) {
  const client = await getSsoClient();
  const params = client.callbackParams(input.currentUrl);
  const tokenSet = await client.callback(getSsoRedirectUri(), params, {
    state: input.expectedState,
    nonce: input.expectedNonce,
    code_verifier: input.codeVerifier
  });
  const claims = tokenSet.claims();
  return upsertSsoUser(normalizeProfile(claims));
}

function normalizeProfile(claims: Record<string, unknown>): SsoProfile {
  const subject = stringClaim(claims.sub);
  if (!subject) {
    throw new Error("SSO response did not include a subject");
  }

  const loginName =
    stringClaim(claims.username) ||
    stringClaim(claims.user_name) ||
    stringClaim(claims.account) ||
    stringClaim(claims.account_name) ||
    stringClaim(claims.preferred_username) ||
    stringClaim(claims.nickname) ||
    emailLocalPart(stringClaim(claims.email)) ||
    stringClaim(claims.name) ||
    subject;
  const email = stringClaim(claims.email) || `${safeEmailLocalPart(loginName || subject)}@nas.local`;
  const displayName = displayNameFromClaims(claims, loginName);

  return {
    subject,
    email: email.trim().toLowerCase(),
    loginName,
    displayName
  };
}

function upsertSsoUser(profile: SsoProfile): CurrentUser {
  const database = getDb();
  const now = new Date().toISOString();
  const existingBySubject = database
    .prepare("SELECT * FROM users WHERE auth_provider = ? AND external_subject = ?")
    .get(provider, profile.subject) as UserRow | undefined;

  if (existingBySubject) {
    database
      .prepare(
        `UPDATE users
         SET email = ?, login_name = ?, name = ?, last_login_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        uniqueEmailFor(profile.email, existingBySubject.id),
        profile.loginName,
        nextDisplayName(existingBySubject.name, profile),
        now,
        now,
        existingBySubject.id
      );
    return toCurrentUser(database.prepare("SELECT * FROM users WHERE id = ?").get(existingBySubject.id) as UserRow);
  }

  const existingByEmail = database.prepare("SELECT * FROM users WHERE email = ?").get(profile.email) as UserRow | undefined;
  if (existingByEmail && existingByEmail.auth_provider === "local" && existingByEmail.role !== "admin") {
    database
      .prepare(
        `UPDATE users
         SET auth_provider = ?, external_subject = ?, login_name = ?, name = ?, last_login_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(provider, profile.subject, profile.loginName, nextDisplayName(existingByEmail.name, profile), now, now, existingByEmail.id);
    return toCurrentUser(database.prepare("SELECT * FROM users WHERE id = ?").get(existingByEmail.id) as UserRow);
  }

  const email = uniqueEmailFor(profile.email);
  const result = database
    .prepare(
      `INSERT INTO users
        (email, name, role, password_hash, auth_provider, external_subject, login_name, is_active, created_at, updated_at, last_login_at)
       VALUES (?, ?, 'employee', ?, ?, ?, ?, 1, ?, ?, ?)`
    )
    .run(email, profile.displayName || profile.loginName, disabledPasswordHash, provider, profile.subject, profile.loginName, now, now, now);
  return toCurrentUser(database.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid) as UserRow);
}

function toCurrentUser(user: UserRow): CurrentUser {
  if (user.is_active !== 1) {
    throw new Error("user is disabled");
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    authProvider: user.auth_provider,
    loginName: user.login_name
  };
}

function uniqueEmailFor(email: string, currentUserId?: number) {
  const database = getDb();
  const normalized = email.trim().toLowerCase();
  const existing = database.prepare("SELECT id FROM users WHERE email = ?").get(normalized) as { id: number } | undefined;
  if (!existing || existing.id === currentUserId) {
    return normalized;
  }

  const [localPart, domain = "nas.local"] = normalized.split("@");
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${localPart}+sso${index}@${domain}`;
    const row = database.prepare("SELECT id FROM users WHERE email = ?").get(candidate) as { id: number } | undefined;
    if (!row || row.id === currentUserId) {
      return candidate;
    }
  }

  throw new Error("unable to allocate unique SSO email");
}

async function getSsoClient() {
  if (!clientPromise) {
    clientPromise = createSsoClient();
  }
  return clientPromise;
}

async function createSsoClient() {
  const issuerUrl = requiredEnv("SSO_ISSUER_URL");
  const clientId = requiredEnv("SSO_CLIENT_ID");
  const clientSecret = requiredEnv("SSO_CLIENT_SECRET");
  if (process.env.SSO_ALLOW_INSECURE_TLS === "1") {
    custom.setHttpOptionsDefaults({
      agent: new https.Agent({ rejectUnauthorized: false })
    });
  }
  const issuer = await Issuer.discover(issuerUrl);
  return new issuer.Client({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uris: [getSsoRedirectUri()],
    response_types: ["code"]
  });
}

function getAppBaseUrl() {
  return requiredEnv("APP_BASE_URL").replace(/\/+$/, "");
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required when AUTH_MODE=sso`);
  }
  return value;
}

function stringClaim(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function displayNameFromClaims(claims: Record<string, unknown>, loginName: string) {
  const name = stringClaim(claims.name);
  if (name && !looksLikeEmail(name)) {
    return name;
  }

  return loginName;
}

function nextDisplayName(currentName: string, profile: SsoProfile) {
  const current = currentName.trim();
  if (current && !looksLikeEmail(current)) {
    return current;
  }

  return profile.displayName || profile.loginName;
}

function looksLikeEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function safeEmailLocalPart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._+-]+/g, ".")
    .replace(/^\.+|\.+$/g, "") || "user";
}

function emailLocalPart(value: string) {
  const atIndex = value.indexOf("@");
  return atIndex > 0 ? value.slice(0, atIndex) : "";
}
