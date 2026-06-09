import crypto from "node:crypto";
import { getDb } from "@/lib/db";

export type MailSettings = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
};

export type WatermarkMode = "off" | "edge" | "edge-and-body";

export type WatermarkSettings = {
  enabled: boolean;
  mode: WatermarkMode;
  opacity: number;
};

const mailKey = "mail.smtp";
const watermarkKey = "watermark";

export function getSetting(key: string) {
  const row = getDb().prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string) {
  getDb()
    .prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, value, new Date().toISOString());
}

export function getMailSettings(): MailSettings | null {
  const value = getSetting(mailKey);
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Omit<MailSettings, "password"> & { passwordEncrypted: string };
    return {
      host: parsed.host,
      port: Number(parsed.port),
      secure: Boolean(parsed.secure),
      username: parsed.username,
      password: decryptSecret(parsed.passwordEncrypted),
      fromName: parsed.fromName,
      fromEmail: parsed.fromEmail
    };
  } catch {
    return null;
  }
}

export function saveMailSettings(settings: MailSettings) {
  setSetting(
    mailKey,
    JSON.stringify({
      ...settings,
      password: undefined,
      passwordEncrypted: encryptSecret(settings.password)
    })
  );
}

export function getWatermarkSettings(): WatermarkSettings {
  const value = getSetting(watermarkKey);
  if (!value) {
    return { enabled: true, mode: "edge-and-body", opacity: 0.07 };
  }

  try {
    const parsed = JSON.parse(value) as WatermarkSettings;
    const opacity = Number(parsed.opacity);
    return {
      enabled: parsed.enabled !== false,
      mode: parsed.mode === "off" || parsed.mode === "edge" || parsed.mode === "edge-and-body" ? parsed.mode : "edge-and-body",
      opacity: Number.isFinite(opacity) ? Math.min(Math.max(opacity, 0.03), 0.2) : 0.07
    };
  } catch {
    return { enabled: true, mode: "edge-and-body", opacity: 0.07 };
  }
}

export function saveWatermarkSettings(settings: WatermarkSettings) {
  setSetting(watermarkKey, JSON.stringify(settings));
}

function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptSecret(value: string) {
  const [ivText, tagText, encryptedText] = value.split(".");
  if (!ivText || !tagText || !encryptedText) {
    return "";
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", getEncryptionKey(), Buffer.from(ivText, "base64url"));
  decipher.setAuthTag(Buffer.from(tagText, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function getEncryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    return crypto.createHash("sha256").update("project-document-library-local-secret").digest();
  }
  return crypto.createHash("sha256").update(secret).digest();
}
