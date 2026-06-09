import Link from "next/link";
import { notFound } from "next/navigation";
import { PdfViewer } from "@/app/pdf-viewer";
import { getProjectName, getVersionFile } from "@/lib/repository";

type ViewerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;
  const version = getVersionFile(Number(id));

  if (!version) {
    notFound();
  }

  return (
    <main className="shell viewer-shell">
      <section className="viewer-header">
        <Link className="back-link" href="/">
          返回 {getProjectName()}
        </Link>
        <div>
          <p className="eyebrow">Online Viewer</p>
          <h1>{version.original_filename}</h1>
        </div>
      </section>

      <PdfViewer fileUrl={`/api/files/${version.id}?mode=view`} title={version.original_filename} />
    </main>
  );
}
