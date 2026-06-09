import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { getRequestContextFromRequest, requireRole } from "@/lib/auth";
import { getDb, type AuditLogRow } from "@/lib/db";

export async function GET(request: Request) {
  const user = await requireRole(["admin"]);
  const context = getRequestContextFromRequest(request);
  const rows = getDb()
    .prepare("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 5000")
    .all() as AuditLogRow[];

  const csv = [
    [
      "ID",
      "时间",
      "用户",
      "角色",
      "动作",
      "结果",
      "对象类型",
      "对象ID",
      "对象",
      "IP",
      "User-Agent",
      "消息",
      "事件哈希"
    ],
    ...rows.map((row) => [
      String(row.id),
      row.created_at,
      row.user_email ?? "",
      row.user_role ?? "",
      row.action,
      row.result,
      row.target_type ?? "",
      row.target_id ?? "",
      row.target_label ?? "",
      row.ip_address ?? "",
      row.user_agent ?? "",
      row.message ?? "",
      row.event_hash
    ])
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n");

  writeAuditLog({ user, action: "admin.audit_export", context, metadata: { count: rows.length } });
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=audit-logs.csv"
    }
  });
}

function escapeCsv(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
