import Link from "next/link";
import { loginAction } from "@/app/actions";
import { isSsoEnabled } from "@/lib/auth-mode";

type LoginProps = {
  searchParams: Promise<{ error?: string; reset?: string }>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginProps) {
  const { error, reset } = await searchParams;
  const ssoEnabled = isSsoEnabled();

  return (
    <main className="shell narrow auth-page">
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Secure Login</p>
          <h1>登录</h1>
          <p>{ssoEnabled ? "使用 NAS 账号进入文档管理系统。" : "使用应用账号进入文档管理系统。"}</p>
        </div>
      </section>

      <section className="panel form-panel">
        {ssoEnabled ? (
          <div className="sso-login-panel">
            <div>
              <h2>NAS 单点登录</h2>
              <p>使用群晖本地账号登录，文档权限仍由本系统管理员维护。</p>
            </div>
            <a className="secondary-button sso-login-button" href="/api/auth/sso/start">
              使用 NAS 账号登录
            </a>
            {error === "sso" ? <p className="error">NAS 登录失败，请重试或联系管理员。</p> : null}
            {error === "sso_config" ? <p className="error">SSO 配置不完整，请使用管理员应急入口检查配置。</p> : null}
            {error === "invalid" ? <p className="error">本地管理员账号或密码不正确。</p> : null}
            <Link className="local-admin-link" href="/login/local-admin">
              管理员应急入口
            </Link>
          </div>
        ) : (
          <form className="stack-form" action={loginAction}>
            <label>
              邮箱
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
            {error === "invalid" ? <p className="error">邮箱或密码不正确。</p> : null}
            {error === "locked" ? <p className="error">账号已被临时锁定，请稍后再试。</p> : null}
            {reset === "1" ? <p className="success">密码已重置，请使用新密码登录。</p> : null}
            <Link href="/forgot-password">忘记密码？</Link>
          </form>
        )}
      </section>
    </main>
  );
}
