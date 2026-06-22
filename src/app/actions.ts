"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { writeAuditLog } from "@/lib/audit";
import {
  authenticateUser,
  canMaintain,
  clearSession,
  getCurrentUser,
  getRequestContext,
  requireRole,
  requireUser
} from "@/lib/auth";
import { isLocalAdminFallbackEnabled, isSsoEnabled } from "@/lib/auth-mode";
import { getDb, type UserRole, type UserRow } from "@/lib/db";
import { sendPasswordResetEmail, sendTestEmail } from "@/lib/mailer";
import { hashPassword, validatePasswordPolicy } from "@/lib/password";
import { createPasswordResetToken, consumePasswordResetToken } from "@/lib/reset-tokens";
import { deleteChangeFile, deleteVersionFile, replaceChangeFile, replaceVersionFile, setDocumentStatus } from "@/lib/repository";
import { saveMailSettings, saveWatermarkSettings, type WatermarkMode } from "@/lib/settings";
import { getSsoLogoutUrl } from "@/lib/sso";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "1";
  const failurePath = normalizeLoginFailurePath(String(formData.get("failurePath") ?? "/login"));
  const context = await getRequestContext();
  const adminOnly = isSsoEnabled();

  if (adminOnly && !isLocalAdminFallbackEnabled()) {
    writeAuditLog({
      action: "auth.login",
      result: "denied",
      message: "local admin fallback disabled",
      context,
      metadata: { email: email.trim().toLowerCase(), adminOnly }
    });
    redirect("/login?error=invalid");
  }

  const result = await authenticateUser(email, password, context, remember, { adminOnly });

  writeAuditLog({
    user: result.user,
    action: "auth.login",
    result: result.ok ? "success" : "failure",
    message: result.ok ? null : result.reason,
    context,
    metadata: { email: email.trim().toLowerCase(), remember, adminOnly }
  });

  if (!result.ok) {
    redirect(`${failurePath}?error=${result.reason}`);
  }

  redirect("/");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  const context = await getRequestContext();
  await clearSession();
  writeAuditLog({ user, action: "auth.logout", context });
  if (user?.authProvider === "synology-sso") {
    let logoutUrl = "/login";
    try {
      logoutUrl = await getSsoLogoutUrl();
    } catch (error) {
      console.error("SSO logout failed", error);
    }
    redirect(logoutUrl);
  }
  redirect("/login");
}

export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const context = await getRequestContext();
  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ? AND is_active = 1 AND auth_provider = 'local'")
    .get(email) as UserRow | undefined;

  if (user) {
    try {
      const token = createPasswordResetToken(user, context);
      const resetUrl = `${await getBaseUrl()}/reset-password?token=${encodeURIComponent(token)}`;
      await sendPasswordResetEmail(user.email, resetUrl);
      writeAuditLog({ user, action: "auth.password_reset_requested", context });
    } catch (error) {
      writeAuditLog({
        user,
        action: "auth.password_reset_requested",
        result: "failure",
        message: error instanceof Error ? error.message : "mail failed",
        context
      });
    }
  } else {
    writeAuditLog({
      action: "auth.password_reset_requested",
      result: "failure",
      message: "unknown email",
      context,
      metadata: { email }
    });
  }

  redirect("/forgot-password?sent=1");
}

export async function resetPasswordAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const context = await getRequestContext();

  if (password !== confirmPassword) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=mismatch`);
  }

  const reset = consumePasswordResetToken(token);
  if (!reset) {
    writeAuditLog({ action: "auth.password_reset", result: "failure", message: "invalid token", context });
    redirect("/reset-password?error=invalid");
  }

  const policy = validatePasswordPolicy(password, reset.email);
  if (!policy.ok) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}&error=weak`);
  }

  getDb()
    .prepare(
      `UPDATE users
       SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(hashPassword(password), new Date().toISOString(), reset.user_id);
  writeAuditLog({
    user: { id: reset.user_id, email: reset.email, name: reset.email, role: "employee" },
    action: "auth.password_reset",
    context
  });
  redirect("/login?reset=1");
}

export async function createUserAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const name = String(formData.get("name") ?? "").trim() || email;
  const role = normalizeRole(String(formData.get("role") ?? "employee"));
  const password = String(formData.get("password") ?? "");
  const policy = validatePasswordPolicy(password, email);

  if (!email || !policy.ok) {
    redirect("/admin/users?error=create");
  }

  try {
    getDb()
      .prepare(
        `INSERT INTO users (email, name, role, password_hash, auth_provider, login_name, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'local', ?, 1, ?, ?)`
      )
      .run(email, name, role, hashPassword(password), email, new Date().toISOString(), new Date().toISOString());
    writeAuditLog({ user: admin, action: "admin.user_created", targetType: "user", targetLabel: email, context });
  } catch (error) {
    writeAuditLog({
      user: admin,
      action: "admin.user_created",
      targetType: "user",
      targetLabel: email,
      result: "failure",
      message: error instanceof Error ? error.message : "create failed",
      context
    });
    redirect("/admin/users?error=create");
  }

  revalidatePath("/admin/users");
  redirect("/admin/users?success=create");
}

export async function updateUserAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  const id = Number(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const role = normalizeRole(String(formData.get("role") ?? "employee"));
  const isActive = formData.get("isActive") === "1" ? 1 : 0;

  if (!Number.isFinite(id) || !name) {
    redirect("/admin/users?error=update");
  }

  getDb()
    .prepare("UPDATE users SET name = ?, role = ?, is_active = ?, updated_at = ? WHERE id = ?")
    .run(name, role, isActive, new Date().toISOString(), id);
  writeAuditLog({ user: admin, action: "admin.user_updated", targetType: "user", targetId: id, context });
  revalidatePath("/admin/users");
  redirect("/admin/users?success=update");
}

export async function adminResetPasswordAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  const id = Number(formData.get("id"));
  const password = String(formData.get("password") ?? "");
  const user = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;

  if (!user || user.auth_provider !== "local" || !validatePasswordPolicy(password, user.email).ok) {
    redirect("/admin/users?error=password");
  }

  getDb()
    .prepare(
      `UPDATE users
       SET password_hash = ?, failed_login_count = 0, locked_until = NULL, updated_at = ?
       WHERE id = ?`
    )
    .run(hashPassword(password), new Date().toISOString(), id);
  writeAuditLog({
    user: admin,
    action: "admin.user_password_reset",
    targetType: "user",
    targetId: id,
    targetLabel: user.email,
    context
  });
  redirect("/admin/users?success=password");
}

export async function saveMailSettingsAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  saveMailSettings({
    host: String(formData.get("host") ?? "").trim(),
    port: Number(formData.get("port") ?? 465),
    secure: formData.get("secure") === "1",
    username: String(formData.get("username") ?? "").trim(),
    password: String(formData.get("password") ?? ""),
    fromName: String(formData.get("fromName") ?? "").trim(),
    fromEmail: String(formData.get("fromEmail") ?? "").trim()
  });
  writeAuditLog({ user: admin, action: "admin.mail_settings_saved", context });
  redirect("/admin/mail?success=save");
}

export async function sendTestMailAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  const to = String(formData.get("to") ?? admin.email).trim();
  try {
    await sendTestEmail(to);
    writeAuditLog({ user: admin, action: "admin.mail_test_sent", targetLabel: to, context });
    redirect("/admin/mail?success=test");
  } catch (error) {
    writeAuditLog({
      user: admin,
      action: "admin.mail_test_sent",
      result: "failure",
      targetLabel: to,
      message: error instanceof Error ? error.message : "mail failed",
      context
    });
    redirect("/admin/mail?error=test");
  }
}

export async function saveWatermarkSettingsAction(formData: FormData) {
  const admin = await requireRole(["admin"]);
  const context = await getRequestContext();
  const mode = normalizeWatermarkMode(String(formData.get("mode") ?? "edge-and-body"));
  const opacityPercent = Number(formData.get("opacityPercent") ?? 7);
  saveWatermarkSettings({
    enabled: mode !== "off",
    mode,
    opacity: Math.min(Math.max(opacityPercent, 3), 20) / 100
  });
  writeAuditLog({ user: admin, action: "admin.watermark_settings_saved", metadata: { mode, opacityPercent }, context });
  redirect("/admin/watermark?success=save");
}

export async function markObsolete(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    setDocumentStatus(id, "obsolete");
    writeAuditLog({ user, action: "document.obsolete", targetType: "document", targetId: id, context });
  }
  revalidatePath("/");
  redirect("/");
}

export async function restoreActive(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    setDocumentStatus(id, "active");
    writeAuditLog({ user, action: "document.restore", targetType: "document", targetId: id, context });
  }
  revalidatePath("/");
  redirect(`/documents/${id}`);
}

export async function replaceVersionAction(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const documentId = Number(formData.get("documentId"));
  const versionId = Number(formData.get("versionId"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0 || !Number.isFinite(versionId)) {
    redirect(`/documents/${documentId}?error=replace`);
  }

  const result = await replaceVersionFile(versionId, file);
  writeAuditLog({
    user,
    action: "document.version_replaced",
    targetType: "version",
    targetId: versionId,
    result: result.ok ? "success" : "failure",
    message: result.message,
    context
  });
  revalidatePath("/");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=replace`);
  }

  redirect(`/documents/${documentId}`);
}

export async function replaceChangeAction(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const documentId = Number(formData.get("documentId"));
  const changeId = Number(formData.get("changeId"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0 || !Number.isFinite(changeId)) {
    redirect(`/documents/${documentId}?error=replaceChange`);
  }

  const result = await replaceChangeFile(changeId, file);
  writeAuditLog({
    user,
    action: "document.change_replaced",
    targetType: "change",
    targetId: changeId,
    result: result.ok ? "success" : "failure",
    message: result.message,
    context
  });
  revalidatePath("/");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=replaceChange`);
  }

  redirect(`/documents/${documentId}`);
}

export async function deleteVersionAction(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const documentId = Number(formData.get("documentId"));
  const versionId = Number(formData.get("versionId"));

  if (!Number.isFinite(versionId)) {
    redirect(`/documents/${documentId}?error=delete`);
  }

  let result: ReturnType<typeof deleteVersionFile>;
  try {
    result = deleteVersionFile(versionId);
  } catch (error) {
    writeAuditLog({
      user,
      action: "document.version_deleted",
      targetType: "version",
      targetId: versionId,
      result: "failure",
      message: error instanceof Error ? error.message : "delete failed",
      context,
      metadata: { documentId }
    });
    redirect(`/documents/${documentId}?error=delete`);
  }

  writeAuditLog({
    user,
    action: "document.version_deleted",
    targetType: "version",
    targetId: versionId,
    result: result.ok ? "success" : "failure",
    message: result.message,
    context,
    metadata: { documentId, deletedDocument: result.deletedDocument ?? false }
  });

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=delete`);
  }

  revalidatePath("/");
  if (result.deletedDocument) {
    redirect("/");
  }

  revalidatePath(`/documents/${result.documentId}`);
  redirect(`/documents/${result.documentId}`);
}

export async function deleteChangeAction(formData: FormData) {
  const user = await requireRole(["clerk", "admin"]);
  const context = await getRequestContext();
  const documentId = Number(formData.get("documentId"));
  const changeId = Number(formData.get("changeId"));

  if (!Number.isFinite(changeId)) {
    redirect(`/documents/${documentId}?error=deleteChange`);
  }

  let result: ReturnType<typeof deleteChangeFile>;
  try {
    result = deleteChangeFile(changeId);
  } catch (error) {
    writeAuditLog({
      user,
      action: "document.change_deleted",
      targetType: "change",
      targetId: changeId,
      result: "failure",
      message: error instanceof Error ? error.message : "delete failed",
      context,
      metadata: { documentId }
    });
    redirect(`/documents/${documentId}?error=deleteChange`);
  }

  writeAuditLog({
    user,
    action: "document.change_deleted",
    targetType: "change",
    targetId: changeId,
    result: result.ok ? "success" : "failure",
    message: result.message,
    context,
    metadata: { documentId }
  });

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=deleteChange`);
  }

  revalidatePath("/");
  revalidatePath(`/documents/${result.documentId}`);
  redirect(`/documents/${result.documentId}`);
}

function normalizeRole(value: string): UserRole {
  return value === "clerk" || value === "admin" ? value : "employee";
}

function normalizeLoginFailurePath(value: string) {
  return value === "/login/local-admin" ? value : "/login";
}

function normalizeWatermarkMode(value: string): WatermarkMode {
  return value === "off" || value === "edge" || value === "edge-and-body" ? value : "edge-and-body";
}

async function getBaseUrl() {
  const headerStore = await headers();
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const host = headerStore.get("host") ?? "localhost:3000";
  return `${proto}://${host}`;
}
