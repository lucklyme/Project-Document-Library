import Link from "next/link";
import { notFound } from "next/navigation";
import { PdfViewer } from "@/app/pdf-viewer";
import { writeAuditLog } from "@/lib/audit";
import { getRequestContext, requireUser } from "@/lib/auth";
import { getChangeFile, getProjectName } from "@/lib/repository";
import { getWatermarkSettings } from "@/lib/settings";

type ChangeViewerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ChangeViewerPage({ params }: ChangeViewerPageProps) {
  const user = await requireUser();
  const context = await getRequestContext();
  const { id } = await params;
  const change = getChangeFile(Number(id));

  if (!change) {
    writeAuditLog({ user, action: "change.viewer_open", result: "failure", message: "change not found", context });
    notFound();
  }

  const watermarkSettings = getWatermarkSettings();

  return (
    <main className="shell viewer-shell">
      <section className="viewer-header">
        <Link className="back-link" href={`/documents/${change.document_id}`}>
          返回 {getProjectName()}
        </Link>
        <div>
          <p className="eyebrow">Change Notice</p>
          <h1>{change.original_filename}</h1>
        </div>
      </section>

      <PdfViewer
        fileUrl={`/api/changes/${change.id}/file?mode=view`}
        title={change.original_filename}
        watermarkEnabled={watermarkSettings.enabled && watermarkSettings.mode !== "off"}
      />
    </main>
  );
}
