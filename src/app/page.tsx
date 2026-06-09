import Link from "next/link";
import { clerkLogin, clerkLogout } from "@/app/actions";
import { UploadForm } from "@/app/upload-form";
import { isClerkSession } from "@/lib/auth";
import { getProjectName, listCurrentDocuments } from "@/lib/repository";

type HomeProps = {
  searchParams: Promise<{ q?: string; includeObsolete?: string; error?: string }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const { q = "", includeObsolete: includeObsoleteParam, error } = await searchParams;
  const isClerk = await isClerkSession();
  const includeObsolete = includeObsoleteParam === "1";
  const documents = listCurrentDocuments(q, includeObsolete);
  const projectName = getProjectName();

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">Document Vault</p>
          <h1>{projectName}</h1>
          <p className="hero-copy">当前实例只管理一个项目。多个项目请部署多个 Docker 实例，并为每个实例挂载独立的数据目录。</p>
          <div className="auth-strip">
            {isClerk ? (
              <form action={clerkLogout}>
                <span className="status active">资料员模式</span>
                <button type="submit">退出资料员</button>
              </form>
            ) : (
              <form action={clerkLogin}>
                <input name="password" type="password" placeholder="资料员管理码" required />
                <button type="submit">进入资料员模式</button>
              </form>
            )}
          </div>
          {error === "clerk" ? <p className="error">资料员管理码不正确，或未配置 CLERK_PASSWORD。</p> : null}
        </div>
        {isClerk ? <UploadForm /> : null}
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
        <a className="secondary-button" href="/api/export">
          导出当前清单
        </a>
      </section>

      <section className="panel">
        <div className="panel-title">
          <h2>{includeObsolete ? "项目文件列表" : "当前在用文件"}</h2>
          <span>{documents.length} 个</span>
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
                {isClerk ? <a href={`/api/files/${document.version_id}`}>下载</a> : null}
              </span>
            </div>
          ))}
          {documents.length === 0 ? <div className="empty">没有匹配的文件。</div> : null}
        </div>
      </section>
    </main>
  );
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
