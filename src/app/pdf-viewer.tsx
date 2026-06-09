"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

type PdfViewerProps = {
  fileUrl: string;
  title: string;
  watermarkEnabled: boolean;
};

const loadTimeoutMs = 30000;

export function PdfViewer({ fileUrl, title, watermarkEnabled }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const taskRef = useRef<PDFDocumentLoadingTask | null>(null);
  const [pageCount, setPageCount] = useState(0);
  const [scale, setScale] = useState(1.5);
  const [error, setError] = useState("");
  const [loadingText, setLoadingText] = useState("正在加载 PDF...");
  const [reloadKey, setReloadKey] = useState(0);

  const viewUrl = useMemo(() => {
    const separator = fileUrl.includes("?") ? "&" : "?";
    return `${fileUrl}${separator}reload=${reloadKey}`;
  }, [fileUrl, reloadKey]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "p") {
        event.preventDefault();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let pdf: PDFDocumentProxy | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function renderPdf() {
      setError("");
      setPageCount(0);
      setLoadingText("正在加载 PDF...");

      const container = containerRef.current;
      if (!container) {
        return;
      }

      container.replaceChildren();
      await taskRef.current?.destroy().catch(() => undefined);
      taskRef.current = null;

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

        const task = pdfjs.getDocument({
          disableAutoFetch: false,
          disableStream: false,
          httpHeaders: {
            "X-Document-Viewer": "pdfjs"
          },
          rangeChunkSize: 512 * 1024,
          url: viewUrl,
          withCredentials: true
        });
        taskRef.current = task;

        timeoutId = setTimeout(() => {
          if (cancelled) {
            return;
          }
          setError("PDF 加载超时，请重新加载。");
          setLoadingText("");
          void task.destroy();
        }, loadTimeoutMs);

        task.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
          if (!total) {
            setLoadingText("正在加载 PDF...");
            return;
          }

          setLoadingText(`正在加载 PDF ${Math.min(100, Math.round((loaded / total) * 100))}%`);
        };

        pdf = await task.promise;
        if (cancelled) {
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        setPageCount(pdf.numPages);
        setLoadingText("正在渲染页面...");

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) {
            return;
          }

          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale });
          const outputScale = window.devicePixelRatio || 1;
          const pageShell = document.createElement("section");
          const pageLabel = document.createElement("div");
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("Canvas is not available.");
          }

          pageShell.className = "pdf-page";
          pageLabel.className = "pdf-page-label";
          pageLabel.textContent = `${pageNumber} / ${pdf.numPages}`;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          pageShell.append(pageLabel, canvas);
          container.append(pageShell);

          await page.render({
            canvas,
            canvasContext: context,
            transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
            viewport
          }).promise;
        }

        setLoadingText("");
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "unknown error";
          setError(`PDF 在线查看加载失败：${message}。请重新加载，或联系资料员确认文件是否可用。`);
          setLoadingText("");
        }
      }
    }

    void renderPdf();

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      containerRef.current?.replaceChildren();
      void taskRef.current?.destroy().catch(() => undefined);
      taskRef.current = null;
      void pdf?.cleanup();
    };
  }, [viewUrl, scale]);

  return (
    <section className="pdf-viewer" onContextMenu={(event) => event.preventDefault()}>
      <div className="pdf-toolbar" aria-label="PDF viewer toolbar">
        <div>
          <strong>{title}</strong>
          <span>{pageCount > 0 ? `${pageCount} 页` : "加载中"}</span>
        </div>
        {watermarkEnabled ? <div className="pdf-security-tip">已开启文件水印，请勿随意拍照、截图或外传。</div> : null}
        <div className="pdf-controls">
          <label className="pdf-zoom-control">
            <span>缩放</span>
            <select value={scale} onChange={(event) => setScale(Number(event.target.value))}>
              <option value={0.75}>75%</option>
              <option value={1}>100%</option>
              <option value={1.25}>125%</option>
              <option value={1.5}>150%</option>
              <option value={1.75}>175%</option>
              <option value={2}>200%</option>
              <option value={2.5}>250%</option>
              <option value={3}>300%</option>
              <option value={4}>400%</option>
            </select>
          </label>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>
            重新加载
          </button>
        </div>
      </div>
      {error ? <p className="error pdf-error">{error}</p> : null}
      {loadingText ? <div className="pdf-loading">{loadingText}</div> : null}
      <div ref={containerRef} className="pdf-pages" />
    </section>
  );
}
