import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { isClerkSession } from "@/lib/auth";
import { filesDir } from "@/lib/paths";
import { getChangeFile } from "@/lib/repository";

type ChangeFileRouteProps = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, { params }: ChangeFileRouteProps) {
  const { id } = await params;
  const change = getChangeFile(Number(id));

  if (!change) {
    return new NextResponse("File not found", { status: 404 });
  }

  const storedPath = resolveStoredPath(change.stored_path, change.stored_filename);
  if (!storedPath) {
    return new NextResponse("File not found", { status: 404 });
  }

  const url = new URL(request.url);
  const isViewMode = url.searchParams.get("mode") === "view";
  const isClerk = await isClerkSession();
  const isPdfViewerRequest = request.headers.get("x-document-viewer") === "pdfjs";

  if (isViewMode && !isPdfViewerRequest) {
    return new NextResponse("Please use the online viewer", { status: 403 });
  }

  if (!isViewMode && !isClerk) {
    return new NextResponse("Download is restricted", { status: 403 });
  }

  const stat = fs.statSync(storedPath);
  const range = request.headers.get("range");
  const disposition = isViewMode
    ? `inline; filename*=UTF-8''${encodeURIComponent(change.original_filename)}`
    : `attachment; filename*=UTF-8''${encodeURIComponent(change.original_filename)}`;

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) {
      return new NextResponse("Invalid range", { status: 416 });
    }

    const start = Number(match[1]);
    const end = match[2] ? Number(match[2]) : stat.size - 1;

    if (start >= stat.size || end >= stat.size || start > end) {
      return new NextResponse("Range not satisfiable", {
        headers: {
          "Content-Range": `bytes */${stat.size}`
        },
        status: 416
      });
    }

    const stream = fs.createReadStream(storedPath, { start, end });
    return new NextResponse(stream as unknown as BodyInit, {
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Disposition": disposition,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Content-Type": "application/pdf",
        "X-Content-Type-Options": "nosniff"
      },
      status: 206
    });
  }

  const stream = fs.createReadStream(storedPath);
  return new NextResponse(stream as unknown as BodyInit, {
    headers: {
      "Accept-Ranges": "bytes",
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Content-Length": String(stat.size),
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function resolveStoredPath(storedPath: string, storedFilename: string) {
  const candidates = [storedPath, path.join(filesDir, storedFilename)];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}
