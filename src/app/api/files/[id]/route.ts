import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { writeAuditLog, writeAuditLogOnce } from "@/lib/audit";
import { canMaintain, getCurrentUser, getRequestContextFromRequest } from "@/lib/auth";
import { filesDir } from "@/lib/paths";
import { getVersionFile } from "@/lib/repository";
import { getPdfBytesForPreview } from "@/lib/watermark";

type FileRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: FileRouteProps) {
  const user = await getCurrentUser();
  const context = getRequestContextFromRequest(request);
  if (!user) {
    writeAuditLog({ action: "document.file_access", result: "denied", context });
    return new NextResponse("Login required", { status: 401 });
  }

  const { id } = await params;
  const version = getVersionFile(Number(id));
  if (!version) {
    writeAuditLog({ user, action: "document.file_access", result: "failure", message: "file not found", context });
    return new NextResponse("File not found", { status: 404 });
  }

  const storedPath = resolveStoredPath(version.stored_path, version.stored_filename);
  if (!storedPath) {
    writeAuditLog({
      user,
      action: "document.file_access",
      targetType: "version",
      targetId: version.id,
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
      writeAuditLog({ user, action: "document.preview", targetType: "version", targetId: version.id, result: "denied", context });
      return new NextResponse("Please use the online viewer", { status: 403 });
    }

    const bytes = await getPdfBytesForPreview({
      storedPath,
      originalFilename: version.original_filename,
      user,
      context
    });
    writeAuditLogOnce({
      user,
      action: "document.preview",
      targetType: "version",
      targetId: version.id,
      targetLabel: version.original_filename,
      context
    }, `preview:version:${version.id}:user:${user.id}`, 5 * 60 * 1000);
    return new NextResponse(bytes as BodyInit, {
      headers: {
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(version.original_filename)}`,
        "Content-Length": String(bytes.length),
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      }
    });
  }

  if (!canMaintain(user)) {
    writeAuditLog({ user, action: "document.download", targetType: "version", targetId: version.id, result: "denied", context });
    return new NextResponse("Download is restricted", { status: 403 });
  }

  writeAuditLog({
    user,
    action: "document.download",
    targetType: "version",
    targetId: version.id,
    targetLabel: version.original_filename,
    context
  });
  const stat = fs.statSync(storedPath);
  const stream = fs.createReadStream(storedPath);
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(version.original_filename)}`,
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
