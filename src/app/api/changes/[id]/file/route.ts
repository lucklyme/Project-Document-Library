import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { writeAuditLog, writeAuditLogOnce } from "@/lib/audit";
import { canMaintain, getCurrentUser, getRequestContextFromRequest } from "@/lib/auth";
import { filesDir } from "@/lib/paths";
import { getChangeFile } from "@/lib/repository";
import { getPdfBytesForPreview } from "@/lib/watermark";

type ChangeFileRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: ChangeFileRouteProps) {
  const user = await getCurrentUser();
  const context = getRequestContextFromRequest(request);
  if (!user) {
    writeAuditLog({ action: "change.file_access", result: "denied", context });
    return new NextResponse("Login required", { status: 401 });
  }

  const { id } = await params;
  const change = getChangeFile(Number(id));
  if (!change) {
    writeAuditLog({ user, action: "change.file_access", result: "failure", message: "file not found", context });
    return new NextResponse("File not found", { status: 404 });
  }

  const storedPath = resolveStoredPath(change.stored_path, change.stored_filename);
  if (!storedPath) {
    writeAuditLog({
      user,
      action: "change.file_access",
      targetType: "change",
      targetId: change.id,
      result: "failure",
      message: "stored file missing",
      context
    });
    return new NextResponse("File not found", { status: 404 });
  }

  const url = new URL(request.url);
  const isViewMode = url.searchParams.get("mode") === "view";
  const isPdfViewerRequest = request.headers.get("x-document-viewer") === "pdfjs";

  if (isViewMode) {
    if (!isPdfViewerRequest) {
      writeAuditLog({ user, action: "change.preview", targetType: "change", targetId: change.id, result: "denied", context });
      return new NextResponse("Please use the online viewer", { status: 403 });
    }

    const bytes = await getPdfBytesForPreview({
      storedPath,
      originalFilename: change.original_filename,
      user,
      context
    });
    writeAuditLogOnce({
      user,
      action: "change.preview",
      targetType: "change",
      targetId: change.id,
      targetLabel: change.original_filename,
      context
    }, `preview:change:${change.id}:user:${user.id}`, 5 * 60 * 1000);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(change.original_filename)}`,
        "Content-Length": String(bytes.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  if (!canMaintain(user)) {
    writeAuditLog({ user, action: "change.download", targetType: "change", targetId: change.id, result: "denied", context });
    return new NextResponse("Download is restricted", { status: 403 });
  }

  writeAuditLog({
    user,
    action: "change.download",
    targetType: "change",
    targetId: change.id,
    targetLabel: change.original_filename,
    context
  });
  const stat = fs.statSync(storedPath);
  const stream = fs.createReadStream(storedPath);
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(change.original_filename)}`,
      "Content-Length": String(stat.size),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function resolveStoredPath(storedPath: string, storedFilename: string) {
  const candidates = [storedPath, path.join(filesDir, storedFilename)];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}
