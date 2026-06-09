import Link from "next/link";
import { loginAction } from "@/app/actions";

type LoginProps = {
  searchParams: Promise<{ error?: string; reset?: string }>;
};

export default async function LoginPage({ searchParams }: LoginProps) {
  const { error, reset } = await searchParams;

  return (
    <main className="shell narrow auth-page">
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Secure Login</p>
          <h1>登录</h1>
          <p>使用应用账号进入文档管理系统。</p>
        </div>
      </section>

      <section className="panel form-panel">
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
      </section>
    </main>
  );
}
