import Link from "next/link";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/actions";
import { isLocalAdminFallbackEnabled, isSsoEnabled } from "@/lib/auth-mode";

type LocalAdminLoginProps = {
  searchParams: Promise<{ error?: string }>;
};

export const dynamic = "force-dynamic";

export default async function LocalAdminLoginPage({ searchParams }: LocalAdminLoginProps) {
  if (!isSsoEnabled() || !isLocalAdminFallbackEnabled()) {
    redirect("/login");
  }

  const { error } = await searchParams;

  return (
    <main className="shell narrow auth-page">
      <Link className="back-link" href="/login">
        返回 SSO 登录
      </Link>
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Emergency Access</p>
          <h1>管理员应急登录</h1>
          <p>仅本系统本地管理员账号可用，用于 SSO 配置异常时进入后台。</p>
        </div>
      </section>

      <section className="panel form-panel">
        <form className="stack-form" action={loginAction}>
          <input type="hidden" name="failurePath" value="/login/local-admin" />
          <label>
            管理员邮箱
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label>
            密码
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          <label className="checkbox-control fit">
            <input name="remember" type="checkbox" value="1" />
            <span>记住登录状态 7 天</span>
          </label>
          <button className="fit" type="submit">
            登录
          </button>
          {error === "invalid" ? <p className="error">管理员账号或密码不正确。</p> : null}
          {error === "locked" ? <p className="error">账号已被临时锁定，请稍后再试。</p> : null}
        </form>
      </section>
    </main>
  );
}
