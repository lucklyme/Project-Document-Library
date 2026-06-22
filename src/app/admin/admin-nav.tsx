import Link from "next/link";
import { logoutAction } from "@/app/actions";
import type { CurrentUser } from "@/lib/auth";
import { displayUserName } from "@/lib/user-display";

export function AdminNav({ user }: { user: CurrentUser }) {
  return (
    <section className="admin-nav">
      <div className="admin-nav-links">
        <Link href="/">文档库</Link>
        <Link href="/admin/users">用户管理</Link>
        <Link href="/admin/mail">邮箱服务</Link>
        <Link href="/admin/watermark">水印配置</Link>
        <Link href="/admin/audit-logs">审计日志</Link>
      </div>
      <form action={logoutAction}>
        <span>{displayUserName(user)}</span>
        <button type="submit">退出</button>
      </form>
    </section>
  );
}
