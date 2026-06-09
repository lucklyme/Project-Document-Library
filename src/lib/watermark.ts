import fs from "node:fs";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import type { CurrentUser, RequestContext } from "@/lib/auth";
import { getWatermarkSettings } from "@/lib/settings";

const cacheTtlMs = 2 * 60 * 1000;
const previewCache = new Map<string, { expiresAt: number; bytesPromise: Promise<Buffer> }>();

export async function getPdfBytesForPreview(input: {
  storedPath: string;
  originalFilename: string;
  documentCode?: string;
  user: CurrentUser;
  context: RequestContext;
}) {
  const settings = getWatermarkSettings();
  const source = fs.readFileSync(input.storedPath);
  if (!settings.enabled || settings.mode === "off") {
    return source;
  }

  const stat = fs.statSync(input.storedPath);
  const cacheKey = [
    input.storedPath,
    stat.size,
    stat.mtimeMs,
    input.user.id,
    input.context.ipAddress ?? "",
    settings.mode,
    settings.opacity
  ].join("|");
  const nowMs = Date.now();
  const cached = previewCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.bytesPromise;
  }

  const bytesPromise = buildWatermarkedPdf({
    source,
    settings,
    user: input.user,
    context: input.context,
    documentCode: input.documentCode,
    originalFilename: input.originalFilename
  });
  previewCache.set(cacheKey, { expiresAt: nowMs + cacheTtlMs, bytesPromise });
  bytesPromise.catch(() => previewCache.delete(cacheKey));
  return bytesPromise;
}

async function buildWatermarkedPdf(input: {
  source: Buffer;
  settings: ReturnType<typeof getWatermarkSettings>;
  originalFilename: string;
  documentCode?: string;
  user: CurrentUser;
  context: RequestContext;
}) {
  const bodyOpacity = Math.min(Math.max(input.settings.opacity, 0.03), 0.2);
  const edgeOpacity = Math.min(Math.max(bodyOpacity * 6, 0.28), 0.75);
  const pdf = await PDFDocument.load(input.source, { ignoreEncryption: true });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const now = new Date().toLocaleString("zh-CN", { hour12: false });
  const watermark = toPdfSafeText([
    input.user.name || input.user.email,
    input.user.email,
    input.context.ipAddress ? `IP ${input.context.ipAddress}` : null,
    now,
    input.documentCode,
    input.originalFilename
  ]
    .filter(Boolean)
    .join(" | "));

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    page.drawText(watermark, {
      x: 24,
      y: 18,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: edgeOpacity,
      maxWidth: Math.max(width - 48, 120)
    });
    page.drawText(watermark, {
      x: 24,
      y: height - 28,
      size: 8,
      font,
      color: rgb(0.35, 0.35, 0.35),
      opacity: edgeOpacity,
      maxWidth: Math.max(width - 48, 120)
    });

    if (input.settings.mode === "edge-and-body") {
      page.drawText(watermark, {
        x: width * 0.13,
        y: height * 0.44,
        size: Math.max(Math.min(width / 28, 22), 11),
        font,
        color: rgb(0.62, 0.62, 0.62),
        opacity: bodyOpacity,
        rotate: degrees(-28),
        maxWidth: width * 0.78
      });
    }
  }

  return Buffer.from(await pdf.save());
}

function toPdfSafeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240);
}
