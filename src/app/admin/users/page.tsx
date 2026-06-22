import { adminResetPasswordAction, createUserAction, updateUserAction } from "@/app/actions";
import { AdminNav } from "@/app/admin/admin-nav";
import { requireRole } from "@/lib/auth";
import { getDb, type UserRow } from "@/lib/db";
import { displayAccountName } from "@/lib/user-display";

export default async function AdminUsersPage() {
  const user = await requireRole(["admin"]);
  const users = getDb().prepare("SELECT * FROM users ORDER BY id ASC").all() as UserRow[];

  return (
    <main className="shell">
      <AdminNav user={user} />
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>用户管理</h1>
          <p>创建本地应急账号、调整角色、停用账号。SSO 用户密码由 NAS 统一管理。</p>
        </div>
      </section>

      <section className="panel form-panel">
        <div className="panel-title">
          <h2>新增本地用户</h2>
        </div>
        <form className="stack-form" action={createUserAction}>
          <input name="email" type="email" placeholder="邮箱" required />
          <input name="name" placeholder="姓名" required />
          <select name="role" defaultValue="employee">
            <option value="employee">一般员工</option>
            <option value="clerk">资料员</option>
            <option value="admin">管理员</option>
          </select>
          <input name="password" type="password" placeholder="初始强密码" required />
          <button className="fit" type="submit">
            创建
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>账号列表</h2>
          <span>{users.length} 个</span>
        </div>
        <div className="user-table">
          <div className="user-row user-head">
            <span>账号</span>
            <span>姓名</span>
            <span>角色</span>
            <span>状态</span>
            <span>保存</span>
            <span>重置密码</span>
          </div>
          {users.map((row) => (
            <article className="user-row" key={row.id}>
              <form className="user-edit-form" action={updateUserAction}>
                <input type="hidden" name="id" value={row.id} />
                <div className="user-identity">
                  <strong>{displayAccountName(row.login_name) || displayAccountName(row.email)}</strong>
                  <span>{row.auth_provider === "synology-sso" ? "NAS SSO" : "本地账号"}</span>
                  {row.email !== row.login_name ? <small>{row.email}</small> : null}
                </div>
                <input name="name" defaultValue={row.name} />
                <select name="role" defaultValue={row.role}>
                  <option value="employee">一般员工</option>
                  <option value="clerk">资料员</option>
                  <option value="admin">管理员</option>
                </select>
                <label className="checkbox-control">
                  <input name="isActive" type="checkbox" value="1" defaultChecked={row.is_active === 1} />
                  <span>启用</span>
                </label>
                <button type="submit">保存</button>
              </form>
              {row.auth_provider === "local" ? (
                <form className="user-password-form" action={adminResetPasswordAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <input name="password" type="password" placeholder="新强密码" required />
                  <button type="submit">重置密码</button>
                </form>
              ) : (
                <span className="muted-note">由 NAS 管理</span>
              )}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
