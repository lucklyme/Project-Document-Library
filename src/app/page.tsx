import Link from "next/link";
import { logoutAction } from "@/app/actions";
import { UploadForm } from "@/app/upload-form";
import { canAdmin, canMaintain, requireUser } from "@/lib/auth";
import { getProjectName, listCurrentDocuments } from "@/lib/repository";

type HomeProps = {
  searchParams: Promise<{ q?: string; includeObsolete?: string; error?: string; page?: string }>;
};

const pageSize = 50;

export default async function Home({ searchParams }: HomeProps) {
  const user = await requireUser();
  const { q = "", includeObsolete: includeObsoleteParam, error, page: pageParam } = await searchParams;
  const includeObsolete = includeObsoleteParam === "1";
  const currentPage = Math.max(Number(pageParam) || 1, 1);
  const allDocuments = listCurrentDocuments(q, includeObsolete);
  const totalPages = Math.max(Math.ceil(allDocuments.length / pageSize), 1);
  const safePage = Math.min(currentPage, totalPages);
  const documents = allDocuments.slice((safePage - 1) * pageSize, safePage * pageSize);
  const projectName = getProjectName();
  const maintainer = canMaintain(user);
  const pageHref = (page: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (includeObsolete) params.set("includeObsolete", "1");
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/?${query}` : "/";
  };

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Document Library</p>
          <h1>{projectName}</h1>
          <p className="hero-copy">工程文档版本、变更单、在线预览和维护记录统一管理。</p>
          <div className="home-actions">
            <div className="user-pill">
              <span className="status active">
                {user.name} / {roleLabel(user.role)}
              </span>
            </div>
            {canAdmin(user) ? (
              <Link className="secondary-button compact-button" href="/admin/users">
                后台管理
              </Link>
            ) : null}
            <form action={logoutAction}>
              <button type="submit">退出登录</button>
            </form>
          </div>
          {error === "forbidden" ? <p className="error">当前账号没有执行该操作的权限。</p> : null}
        </div>
        {maintainer ? <UploadForm /> : null}
      </section>

      <section className="toolbar">
        <form className="search" action="/">
          <input name="q" defaultValue={q} placeholder="搜索编号、标题、版本、变更单或文件名" />
          <label className="checkbox-control">
            <input name="includeObsolete" type="checkbox" value="1" defaultChecked={includeObsolete} />
            <span>包含已作废文档</span>
          </label>
          <button type="submit">搜索</button>
        </form>
        {maintainer ? (
          <a className="secondary-button" href="/api/export">
            导出当前清单
          </a>
        ) : null}
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>{includeObsolete ? "项目文件列表" : "当前在用文件"}</h2>
          <span>
            {allDocuments.length} 个 / 第 {safePage} 页
          </span>
        </div>
        <div className="table">
          <div className="table-head">
            <span>文件编号</span>
            <span>标题</span>
            <span>状态</span>
            <span>版本</span>
            <span>变更</span>
            <span>上传时间</span>
            <span>操作</span>
          </div>
          {documents.map((document) => (
            <div className="table-row" key={document.id}>
              <strong>{document.code}</strong>
              <span>{document.title}</span>
              <span className={document.status === "active" ? "status active" : "status obsolete"}>
                {document.status === "active" ? "在用" : "已作废"}
              </span>
              <span className="badge">{document.version}</span>
              <span>{document.change_count} 个</span>
              <span>{formatDate(document.uploaded_at)}</span>
              <span className="actions">
                <Link href={`/documents/${document.id}`}>历史</Link>
                <Link href={`/viewer/${document.version_id}`}>查看</Link>
                {maintainer ? <a href={`/api/files/${document.version_id}`}>下载</a> : null}
              </span>
            </div>
          ))}
          {documents.length === 0 ? <div className="empty">没有匹配的文件。</div> : null}
        </div>
        {totalPages > 1 ? (
          <nav className="pagination" aria-label="文档分页">
            <Link className={safePage <= 1 ? "disabled-link" : ""} href={pageHref(Math.max(safePage - 1, 1))}>
              上一页
            </Link>
            <span>
              {safePage} / {totalPages}
            </span>
            <Link className={safePage >= totalPages ? "disabled-link" : ""} href={pageHref(Math.min(safePage + 1, totalPages))}>
              下一页
            </Link>
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function roleLabel(role: string) {
  if (role === "admin") return "管理员";
  if (role === "clerk") return "资料员";
  return "一般员工";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
