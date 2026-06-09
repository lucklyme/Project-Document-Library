import Link from "next/link";
import { requestPasswordResetAction } from "@/app/actions";

type ForgotPasswordProps = {
  searchParams: Promise<{ sent?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: ForgotPasswordProps) {
  const { sent } = await searchParams;

  return (
    <main className="shell narrow auth-page">
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Password Reset</p>
          <h1>重置密码</h1>
          <p>如果邮箱存在且邮件服务可用，系统会发送 30 分钟有效的一次性重置链接。</p>
        </div>
      </section>
      <section className="panel form-panel">
        <form className="stack-form" action={requestPasswordResetAction}>
          <label>
            邮箱
            <input name="email" type="email" required />
          </label>
          <button className="fit" type="submit">
            发送重置邮件
          </button>
          {sent === "1" ? <p className="success">如果邮箱存在，重置邮件已发送。</p> : null}
          <Link href="/login">返回登录</Link>
        </form>
      </section>
    </main>
  );
}
