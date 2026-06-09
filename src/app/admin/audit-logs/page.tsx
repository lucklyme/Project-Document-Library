import { AdminNav } from "@/app/admin/admin-nav";
import { requireRole } from "@/lib/auth";
import { countAuditLogs, listAuditLogs } from "@/lib/audit";

type AuditPageProps = {
  searchParams: Promise<{ action?: string; user?: string; result?: string; page?: string }>;
};

const auditPageSize = 50;

export default async function AdminAuditLogsPage({ searchParams }: AuditPageProps) {
  const admin = await requireRole(["admin"]);
  const filters = await searchParams;
  const currentPage = Math.max(Number(filters.page) || 1, 1);
  const total = countAuditLogs(filters);
  const totalPages = Math.max(Math.ceil(total / auditPageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const logs = listAuditLogs({ ...filters, limit: auditPageSize, offset: (safePage - 1) * auditPageSize });
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (filters.action) params.set("action", filters.action);
    if (filters.user) params.set("user", filters.user);
    if (filters.result) params.set("result", filters.result);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/admin/audit-logs?${query}` : "/admin/audit-logs";
  };

  return (
    <main className="shell">
      <AdminNav user={admin} />
      <section className="detail-hero single">
        <div>
          <p className="eyebrow">Audit</p>
          <h1>审计日志</h1>
          <p>日志仅允许查看和筛选，应用内不提供修改或删除入口。</p>
        </div>
      </section>

      <section className="toolbar">
        <form className="search" action="/admin/audit-logs">
          <input name="action" defaultValue={filters.action ?? ""} placeholder="动作" />
          <input name="user" defaultValue={filters.user ?? ""} placeholder="用户或对象" />
          <select name="result" defaultValue={filters.result ?? ""}>
            <option value="">全部结果</option>
            <option value="success">成功</option>
            <option value="failure">失败</option>
            <option value="denied">拒绝</option>
          </select>
          <button type="submit">筛选</button>
        </form>
        <a className="secondary-button" href="/api/admin/audit-logs/export">
          导出日志
        </a>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>最近日志</h2>
          <span>
            {total} 条 / 第 {safePage} 页
          </span>
        </div>
        <div className="audit-list">
          <div className="audit-row audit-head">
            <strong>动作</strong>
            <span>结果</span>
            <span>用户</span>
            <span>对象</span>
            <span>IP</span>
            <span>时间</span>
          </div>
          {logs.map((log) => (
            <article className="audit-row" key={log.id}>
              <strong>{log.action}</strong>
              <span className={`status ${log.result === "success" ? "active" : "obsolete"}`}>{resultLabel(log.result)}</span>
              <span>{log.user_email ?? "未登录"}</span>
              <span>{log.target_label ?? log.target_id ?? "-"}</span>
              <span>{log.ip_address ?? "-"}</span>
              <small>{formatDate(log.created_at)}</small>
              {log.message ? <p>{log.message}</p> : null}
            </article>
          ))}
          {logs.length === 0 ? <div className="empty">没有匹配的日志。</div> : null}
        </div>
        {totalPages > 1 ? (
          <nav className="pagination" aria-label="审计日志分页">
            <a className={safePage <= 1 ? "disabled-link" : ""} href={pageHref(Math.max(safePage - 1, 1))}>
              上一页
            </a>
            <span>
              {safePage} / {totalPages}
            </span>
            <a className={safePage >= totalPages ? "disabled-link" : ""} href={pageHref(Math.min(safePage + 1, totalPages))}>
              下一页
            </a>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function resultLabel(result: string) {
  if (result === "success") return "成功";
  if (result === "denied") return "拒绝";
  return "失败";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}
