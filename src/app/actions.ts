"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearClerkSession, isClerkSession, setClerkSession, verifyClerkPassword } from "@/lib/auth";
import { replaceChangeFile, replaceVersionFile, setDocumentStatus } from "@/lib/repository";

export async function clerkLogin(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!verifyClerkPassword(password)) {
    redirect("/?error=clerk");
  }

  await setClerkSession();
  redirect("/");
}

export async function clerkLogout() {
  await clearClerkSession();
  redirect("/");
}

export async function markObsolete(formData: FormData) {
  await requireClerk();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    setDocumentStatus(id, "obsolete");
  }
  revalidatePath("/");
  redirect("/");
}

export async function restoreActive(formData: FormData) {
  await requireClerk();
  const id = Number(formData.get("id"));
  if (Number.isFinite(id)) {
    setDocumentStatus(id, "active");
  }
  revalidatePath("/");
  redirect(`/documents/${id}`);
}

export async function replaceVersionAction(formData: FormData) {
  await requireClerk();
  const documentId = Number(formData.get("documentId"));
  const versionId = Number(formData.get("versionId"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0 || !Number.isFinite(versionId)) {
    redirect(`/documents/${documentId}?error=replace`);
  }

  const result = await replaceVersionFile(versionId, file);
  revalidatePath("/");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=replace`);
  }

  redirect(`/documents/${documentId}`);
}

export async function replaceChangeAction(formData: FormData) {
  await requireClerk();
  const documentId = Number(formData.get("documentId"));
  const changeId = Number(formData.get("changeId"));
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0 || !Number.isFinite(changeId)) {
    redirect(`/documents/${documentId}?error=replaceChange`);
  }

  const result = await replaceChangeFile(changeId, file);
  revalidatePath("/");
  revalidatePath(`/documents/${documentId}`);

  if (!result.ok) {
    redirect(`/documents/${documentId}?error=replaceChange`);
  }

  redirect(`/documents/${documentId}`);
}

async function requireClerk() {
  if (!(await isClerkSession())) {
    redirect("/");
  }
}
