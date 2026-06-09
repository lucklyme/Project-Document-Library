import { saveMailSettingsAction, sendTestMailAction } from "@/app/actions";
import { AdminNav } from "@/app/admin/admin-nav";
import { requireRole } from "@/lib/auth";
import { getMailSettings } from "@/lib/settings";

type MailPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function AdminMailPage({ searchParams }: MailPageProps) {
  const user = await requireRole(["admin"]);
  const { success, error } = await searchParams;
  const settings = getMailSettings();

  return (
    <main className="shell">
      <AdminNav user={user} />
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">SMTP</p>
          <h1>邮箱服务</h1>
          <p>配置阿里云邮箱 SMTP，用于发送密码重置邮件。</p>
        </div>
      </section>

      {success === "save" ? <p className="success">邮箱配置已保存。</p> : null}
      {success === "test" ? <p className="success">测试邮件已发送。</p> : null}
      {error === "test" ? <p className="error">测试邮件发送失败，请检查 SMTP 配置。</p> : null}

      <section className="panel form-panel">
        <div className="panel-title">
          <h2>SMTP 配置</h2>
        </div>
        <form className="stack-form" action={saveMailSettingsAction}>
          <input name="host" defaultValue={settings?.host ?? "smtp.qiye.aliyun.com"} placeholder="SMTP 主机" required />
          <input name="port" type="number" defaultValue={settings?.port ?? 465} placeholder="端口" required />
          <label className="checkbox-control">
            <input name="secure" type="checkbox" value="1" defaultChecked={settings?.secure ?? true} />
            <span>使用 SSL/TLS</span>
          </label>
          <input name="username" defaultValue={settings?.username ?? ""} placeholder="SMTP 账号" required />
          <input name="password" type="password" placeholder="SMTP 授权码或密码" required />
          <input name="fromName" defaultValue={settings?.fromName ?? "Project Document Library"} placeholder="发件人名称" required />
          <input name="fromEmail" type="email" defaultValue={settings?.fromEmail ?? ""} placeholder="发件邮箱" required />
          <button className="fit" type="submit">保存配置</button>
        </form>
      </section>

      <section className="panel form-panel">
        <div className="panel-title">
          <h2>发送测试邮件</h2>
        </div>
        <form className="stack-form" action={sendTestMailAction}>
          <input name="to" type="email" defaultValue={user.email} placeholder="收件邮箱" required />
          <button className="fit" type="submit">发送测试</button>
        </form>
      </section>
    </main>
  );
}
