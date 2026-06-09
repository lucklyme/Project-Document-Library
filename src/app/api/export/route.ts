import { NextResponse } from "next/server";
import { writeAuditLog } from "@/lib/audit";
import { canMaintain, getCurrentUser, getRequestContextFromRequest } from "@/lib/auth";
import { getProjectName, listCurrentDocuments } from "@/lib/repository";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const context = getRequestContextFromRequest(request);
  if (!canMaintain(user)) {
    writeAuditLog({ user, action: "document.export", result: "denied", context });
    return new NextResponse("Export is restricted", { status: 403 });
  }

  const projectName = getProjectName();
  const rows = listCurrentDocuments();
  const csv = [
    ["项目", "文件编号", "标题", "版本", "变更单数量", "状态", "上传时间", "原始文件名"],
    ...rows.map((row) => [
      projectName,
      row.code,
      row.title,
      row.version,
      String(row.change_count),
      "在用",
      row.uploaded_at,
      row.original_filename
    ])
  ]
    .map((row) => row.map(escapeCsv).join(","))
    .join("\r\n");

  writeAuditLog({ user, action: "document.export", targetLabel: projectName, context, metadata: { count: rows.length } });
  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=current-documents.csv"
    }
  });
}

function escapeCsv(value: string) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
