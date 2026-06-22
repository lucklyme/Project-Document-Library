import type { CurrentUser } from "@/lib/auth";

export function displayUserName(user: CurrentUser) {
  return displayAccountName(user.loginName) || displayAccountName(user.name) || displayAccountName(user.email) || user.email;
}

export function displayAccountName(value: string | null | undefined) {
  const text = value?.trim();
  if (!text) {
    return "";
  }

  const atIndex = text.indexOf("@");
  if (atIndex > 0) {
    return text.slice(0, atIndex);
  }

  return text;
}
