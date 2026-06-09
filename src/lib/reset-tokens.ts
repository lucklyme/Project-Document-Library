import crypto from "node:crypto";
import { getDb, type UserRow } from "@/lib/db";
import { hashToken, type RequestContext } from "@/lib/auth";

const resetTtlMinutes = 30;

export function createPasswordResetToken(user: Pick<UserRow, "id">, context: RequestContext) {
  const token = crypto.randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + resetTtlMinutes * 60 * 1000).toISOString();

  getDb()
    .prepare(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at, created_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(user.id, hashToken(token), expiresAt, now.toISOString(), context.ipAddress, context.userAgent);

  return token;
}

export function consumePasswordResetToken(token: string) {
  const database = getDb();
  const tokenHash = hashToken(token);
  const now = new Date().toISOString();
  const row = database
    .prepare(
      `SELECT t.id, t.user_id, u.email
       FROM password_reset_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.used_at IS NULL AND t.expires_at > ? AND u.is_active = 1`
    )
    .get(tokenHash, now) as { id: number; user_id: number; email: string } | undefined;

  if (!row) {
    return null;
  }

  database.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ?").run(now, row.id);
  return row;
}
