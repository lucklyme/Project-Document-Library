import Link from "next/link";
import { resetPasswordAction } from "@/app/actions";

type ResetPasswordProps = {
  searchParams: Promise<{ token?: string; error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordProps) {
  const { token = "", error } = await searchParams;

  return (
    <main className="shell narrow auth-page">
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Password Reset</p>
          <h1>设置新密码</h1>
          <p>密码至少 12 位，并包含大小写字母、数字和特殊字符。</p>
        </div>
      </section>
      <section className="panel form-panel">
        <form className="stack-form" action={resetPasswordAction}>
          <input type="hidden" name="token" value={token} />
          <label>
            新密码
            <input name="password" type="password" autoComplete="new-password" required />
          </label>
          <label>
            确认新密码
            <input name="confirmPassword" type="password" autoComplete="new-password" required />
          </label>
          <button className="fit" type="submit">
            更新密码
          </button>
          {error === "mismatch" ? <p className="error">两次输入的密码不一致。</p> : null}
          {error === "weak" ? <p className="error">密码强度不符合要求。</p> : null}
          {error === "invalid" ? <p className="error">重置链接无效或已过期。</p> : null}
          <Link href="/login">返回登录</Link>
        </form>
      </section>
    </main>
  );
}
