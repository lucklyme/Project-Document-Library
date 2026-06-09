import Link from "next/link";
import { notFound } from "next/navigation";
import { markObsolete, replaceChangeAction, replaceVersionAction, restoreActive } from "@/app/actions";
import { isClerkSession } from "@/lib/auth";
import { getDocumentDetail, getProjectName } from "@/lib/repository";

type DetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
};

export default async function DocumentDetailPage({ params, searchParams }: DetailProps) {
  const { id } = await params;
  const { error } = await searchParams;
  const document = getDocumentDetail(Number(id));

  if (!document) {
    notFound();
  }

  const isClerk = await isClerkSession();

  return (
    <main className="shell">
      <Link className="back-link" href="/">
        返回 {getProjectName()}
      </Link>

      <section className="detail-hero document-detail-hero">
        <div>
          <p className="eyebrow">{document.status === "active" ? "当前在用" : "已作废"}</p>
          <h1>{document.code}</h1>
          <p>{document.title}</p>
        </div>
        {isClerk ? (
          document.status === "active" ? (
            <form action={markObsolete}>
              <input type="hidden" name="id" value={document.id} />
              <button className="danger" type="submit">
                标记作废
              </button>
            </form>
          ) : (
            <form action={restoreActive}>
              <input type="hidden" name="id" value={document.id} />
              <button type="submit">恢复在用</button>
            </form>
          )
        ) : null}
      </section>

      {error === "replace" ? <p className="error">替换失败：请确认新文件是同一文件编号和同一 Rev。</p> : null}
      {error === "replaceChange" ? <p className="error">变更单替换失败：请确认新文件是同一文件编号和同一 XG 流水号。</p> : null}

      <div className="document-history-grid">
        <section className="panel">
          <div className="panel-title compact">
            <h2>历史版本</h2>
            <span>{document.versions.length} 个版本</span>
          </div>
          <div className="timeline-list">
            {document.versions.map((version) => (
              <article className={version.is_current ? "timeline-item current" : "timeline-item"} key={version.id}>
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <div className="timeline-heading">
                    <strong>{version.version}</strong>
                    {version.is_current ? <span className="badge">当前</span> : null}
                  </div>
                  <p>{version.original_filename}</p>
                  <small>
                    {formatDate(version.uploaded_at)} / {formatSize(version.file_size)}
                  </small>
                  <div className="version-actions timeline-actions">
                    <Link href={`/viewer/${version.id}`}>查看</Link>
                    {isClerk ? <a href={`/api/files/${version.id}`}>下载</a> : null}
                    {isClerk ? (
                      <form className="replace-form compact" action={replaceVersionAction}>
                        <input type="hidden" name="documentId" value={document.id} />
                        <input type="hidden" name="versionId" value={version.id} />
                        <input name="file" type="file" required />
                        <button type="submit">替换</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title compact">
            <h2>变更单</h2>
            <span>{document.changes.length} 个</span>
          </div>
          <div className="timeline-list">
            {document.changes.map((change) => (
              <article className="timeline-item change" key={change.id}>
                <div className="timeline-marker" />
                <div className="timeline-content">
                  <div className="timeline-heading">
                    <strong>{change.change_no}</strong>
                  </div>
                  <p>{change.title}</p>
                  <small>
                    {change.original_filename} / {formatDate(change.uploaded_at)} / {formatSize(change.file_size)}
                  </small>
                  <div className="version-actions timeline-actions">
                    <Link href={`/changes/${change.id}/viewer`}>查看</Link>
                    {isClerk ? <a href={`/api/changes/${change.id}/file`}>下载</a> : null}
                    {isClerk ? (
                      <form className="replace-form compact" action={replaceChangeAction}>
                        <input type="hidden" name="documentId" value={document.id} />
                        <input type="hidden" name="changeId" value={change.id} />
                        <input name="file" type="file" required />
                        <button type="submit">替换</button>
                      </form>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
            {document.changes.length === 0 ? <div className="empty">还没有变更单。</div> : null}
          </div>
        </section>
      </div>
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

function formatSize(value: number) {
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
