import crypto from "node:crypto";
import { getDb, type AuditLogRow, type UserRole } from "@/lib/db";
import type { CurrentUser, RequestContext } from "@/lib/auth";

export type AuditResult = "success" | "failure" | "denied";

export type AuditInput = {
  user?: CurrentUser | null;
  action: string;
  targetType?: string | null;
  targetId?: string | number | null;
  targetLabel?: string | null;
  result?: AuditResult;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
  context?: RequestContext | null;
};

const auditDedupeCache = new Map<string, number>();

export function writeAuditLog(input: AuditInput) {
  const database = getDb();
  const previous = database
    .prepare("SELECT event_hash FROM audit_logs ORDER BY id DESC LIMIT 1")
    .get() as Pick<AuditLogRow, "event_hash"> | undefined;
  const now = new Date().toISOString();
  const requestId = crypto.randomUUID();
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;
  const eventHash = buildEventHash({
    prevHash: previous?.event_hash ?? null,
    userId: input.user?.id ?? null,
    userEmail: input.user?.email ?? null,
    userRole: input.user?.role ?? null,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId == null ? null : String(input.targetId),
    targetLabel: input.targetLabel ?? null,
    result: input.result ?? "success",
    ipAddress: input.context?.ipAddress ?? null,
    userAgent: input.context?.userAgent ?? null,
    requestId,
    message: input.message ?? null,
    metadata,
    createdAt: now
  });

  database
    .prepare(
      `INSERT INTO audit_logs
        (user_id, user_email, user_role, action, target_type, target_id, target_label, result,
         ip_address, user_agent, request_id, message, metadata, prev_hash, event_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.user?.id ?? null,
      input.user?.email ?? null,
      input.user?.role ?? null,
      input.action,
      input.targetType ?? null,
      input.targetId == null ? null : String(input.targetId),
      input.targetLabel ?? null,
      input.result ?? "success",
      input.context?.ipAddress ?? null,
      input.context?.userAgent ?? null,
      requestId,
      input.message ?? null,
      metadata,
      previous?.event_hash ?? null,
      eventHash,
      now
    );
}

export function writeAuditLogOnce(input: AuditInput, dedupeKey: string, ttlMs: number) {
  const now = Date.now();
  const expiresAt = auditDedupeCache.get(dedupeKey);
  if (expiresAt && expiresAt > now) {
    return;
  }

  auditDedupeCache.set(dedupeKey, now + ttlMs);
  writeAuditLog(input);
}

export function listAuditLogs(filters: { action?: string; user?: string; result?: string; limit?: number; offset?: number }) {
  const { where, params } = buildAuditFilters(filters);
  params.limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  params.offset = Math.max(filters.offset ?? 0, 0);

  return getDb()
    .prepare(
      `SELECT *
       FROM audit_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY id DESC
       LIMIT @limit OFFSET @offset`
    )
    .all(params) as AuditLogRow[];
}

export function countAuditLogs(filters: { action?: string; user?: string; result?: string }) {
  const { where, params } = buildAuditFilters(filters);
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS count
       FROM audit_logs
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}`
    )
    .get(params) as { count: number };
  return row.count;
}

function buildAuditFilters(filters: { action?: string; user?: string; result?: string }) {
  const where: string[] = [];
  const params: Record<string, string | number> = {};

  if (filters.action?.trim()) {
    where.push("action LIKE @action");
    params.action = `%${filters.action.trim()}%`;
  }
  if (filters.user?.trim()) {
    where.push("(user_email LIKE @user OR target_label LIKE @user)");
    params.user = `%${filters.user.trim()}%`;
  }
  if (filters.result?.trim()) {
    where.push("result = @result");
    params.result = filters.result.trim();
  }

  return { where, params };
}

function buildEventHash(input: {
  prevHash: string | null;
  userId: number | null;
  userEmail: string | null;
  userRole: UserRole | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  result: AuditResult;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string;
  message: string | null;
  metadata: string | null;
  createdAt: string;
}) {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
