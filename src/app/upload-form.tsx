"use client";

import { useRouter } from "next/navigation";
import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";

type UploadState = {
  ok: boolean;
  message: string;
};

type UploadStatus = "pending" | "uploading" | "done" | "failed" | "skipped";

type UploadItem = {
  id: string;
  file: File;
  name: string;
  relativePath: string;
  size: number;
  status: UploadStatus;
  message: string;
};

const concurrency = 2;
const doneStorageKey = "document-vault-upload-done";

export function UploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [state, setState] = useState<UploadState>({ ok: false, message: "" });
  const [isRunning, setIsRunning] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const pauseRef = useRef(false);
  const indexRef = useRef(0);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;
        return acc;
      },
      { total: 0, pending: 0, uploading: 0, done: 0, failed: 0, skipped: 0 } as Record<UploadStatus | "total", number>
    );
  }, [items]);

  const currentItem = items.find((item) => item.status === "uploading");

  function handleFileSelection(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    addFiles(selected);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);

    const entries = Array.from(event.dataTransfer.items ?? [])
      .map((item) => getEntry(item))
      .filter((entry): entry is FileSystemEntry => Boolean(entry));

    if (entries.length > 0) {
      const files = (await Promise.all(entries.map((entry) => readEntryFiles(entry)))).flat();
      addFiles(files);
      return;
    }

    addFiles(Array.from(event.dataTransfer.files ?? []));
  }

  function addFiles(files: File[]) {
    if (files.length === 0) {
      return;
    }

    const doneKeys = readDoneKeys();
    const existingKeys = new Set(itemsRef.current.map((item) => uploadKey(item.file, item.relativePath)));
    const nextItems = files.map((file) => {
      const relativePath = getRelativePath(file);
      const key = uploadKey(file, relativePath);
      const isDone = doneKeys.has(key);
      const isDuplicate = existingKeys.has(key);
      existingKeys.add(key);

      return {
        id: `${key}-${Math.random().toString(36).slice(2)}`,
        file,
        name: file.name,
        relativePath,
        size: file.size,
        status: isDone || isDuplicate ? "skipped" : "pending",
        message: isDone ? "已上传，已跳过" : isDuplicate ? "队列中已存在，已跳过" : ""
      } satisfies UploadItem;
    });

    setItems((current) => [...current, ...nextItems]);
    setState({ ok: true, message: `已加入 ${nextItems.length} 个文件。` });
  }

  async function startUpload() {
    if (isRunning || items.length === 0) {
      return;
    }

    pauseRef.current = false;
    indexRef.current = 0;
    setIsRunning(true);
    setState({ ok: true, message: "上传队列已开始。" });
    setItems((current) =>
      current.map((item) => (item.status === "failed" ? { ...item, status: "pending", message: "" } : item))
    );

    const workers = Array.from({ length: concurrency }, () => runWorker());
    await Promise.all(workers);

    setIsRunning(false);
    router.refresh();
    setState({
      ok: true,
      message: pauseRef.current ? "上传队列已暂停。" : "上传队列已完成。"
    });
  }

  function pauseUpload() {
    pauseRef.current = true;
    setState({ ok: true, message: "正在暂停，当前上传中的文件完成后停止。" });
  }

  function clearQueue() {
    if (isRunning) {
      pauseUpload();
    }
    setItems([]);
    setState({ ok: false, message: "" });
    setIsQueueOpen(false);
  }

  async function runWorker() {
    while (!pauseRef.current) {
      const item = nextPendingItem();
      if (!item) {
        return;
      }

      updateItem(item.id, { status: "uploading", message: "上传中" });
      const result = await uploadFile(item);

      if (result.ok) {
        markDone(item);
        updateItem(item.id, { status: "done", message: result.message || "上传成功" });
      } else {
        updateItem(item.id, { status: "failed", message: result.message || "上传失败" });
      }
    }
  }

  function nextPendingItem() {
    const currentItems = itemsRef.current;
    while (indexRef.current < currentItems.length) {
      const item = currentItems[indexRef.current];
      indexRef.current += 1;
      if (item.status === "pending" || item.status === "failed") {
        return item;
      }
    }
    return null;
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((current) => {
      const next = current.map((item) => (item.id === id ? { ...item, ...patch } : item));
      itemsRef.current = next;
      return next;
    });
  }

  async function uploadFile(item: UploadItem) {
    try {
      const formData = new FormData();
      formData.set("file", item.file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData
      });
      const result = (await response.json()) as UploadState;

      return {
        ok: response.ok && result.ok,
        message: result.message
      };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "上传失败"
      };
    }
  }

  return (
    <section className="upload-card">
      <div>
        <p className="eyebrow">批量上传</p>
        <h2>上传文件</h2>
        <p>选择文件、选择文件夹，或把文件拖到这里。系统默认同时上传 2 个文件。</p>
      </div>

      <div
        className={isDragging ? "upload-dropzone dragging" : "upload-dropzone"}
        onDragEnter={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) {
            setIsDragging(false);
          }
        }}
        onDrop={handleDrop}
      >
        <strong>拖拽文件到此处</strong>
        <span>也可以使用下方按钮添加文件或文件夹</span>
        <div className="upload-pickers">
          <button type="button" onClick={() => fileInputRef.current?.click()}>
            添加文件
          </button>
          <button type="button" className="secondary-light" onClick={() => folderInputRef.current?.click()}>
            添加文件夹
          </button>
        </div>
        <input ref={fileInputRef} name="files" type="file" multiple onChange={handleFileSelection} />
        <input
          ref={folderInputRef}
          name="folder"
          type="file"
          multiple
          onChange={handleFileSelection}
          {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        />
      </div>

      {items.length > 0 ? (
        <>
          <div className="queue-summary">
            <span>总数 {summary.total}</span>
            <span>待传 {summary.pending}</span>
            <span>上传中 {summary.uploading}</span>
            <span>完成 {summary.done}</span>
            <span>跳过 {summary.skipped}</span>
            <span>失败 {summary.failed}</span>
          </div>
          {currentItem ? <p className="selected-file">正在上传：{currentItem.relativePath}</p> : null}
          <div className="queue-actions">
            <button type="button" onClick={startUpload} disabled={isRunning || summary.pending + summary.failed === 0}>
              {summary.failed > 0 ? "重试失败项" : "开始上传"}
            </button>
            <button type="button" onClick={pauseUpload} disabled={!isRunning}>
              暂停
            </button>
            <button className="secondary-light" type="button" onClick={() => setIsQueueOpen(true)}>
              查看队列
            </button>
            <button className="secondary-light" type="button" onClick={clearQueue}>
              清空队列
            </button>
          </div>
        </>
      ) : null}

      {state.message ? <p className={state.ok ? "success" : "error"}>{state.message}</p> : null}

      {isQueueOpen ? (
        <div className="queue-modal-backdrop" role="presentation" onMouseDown={() => setIsQueueOpen(false)}>
          <section className="queue-modal" role="dialog" aria-modal="true" aria-label="上传队列" onMouseDown={(event) => event.stopPropagation()}>
            <div className="queue-modal-title">
              <div>
                <p className="eyebrow">Upload Queue</p>
                <h2>上传队列</h2>
              </div>
              <button type="button" className="secondary-light" onClick={() => setIsQueueOpen(false)}>
                关闭
              </button>
            </div>
            <div className="upload-queue">
              {items.map((item) => (
                <div className="queue-row" key={item.id}>
                  <span className={`dot ${item.status}`} />
                  <strong title={item.relativePath}>{item.relativePath}</strong>
                  <span>{formatSize(item.size)}</span>
                  <small>{item.message || statusText(item.status)}</small>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

type FileSystemEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
};

type FileSystemFileEntry = FileSystemEntry & {
  file(callback: (file: File) => void, errorCallback?: (error: DOMException) => void): void;
};

type FileSystemDirectoryEntry = FileSystemEntry & {
  createReader(): {
    readEntries(callback: (entries: FileSystemEntry[]) => void, errorCallback?: (error: DOMException) => void): void;
  };
};

function getEntry(item: DataTransferItem) {
  const entryGetter = item as DataTransferItem & {
    webkitGetAsEntry?: () => FileSystemEntry | null;
    getAsEntry?: () => FileSystemEntry | null;
  };
  return entryGetter.webkitGetAsEntry?.() ?? entryGetter.getAsEntry?.() ?? null;
}

async function readEntryFiles(entry: FileSystemEntry, prefix = ""): Promise<File[]> {
  if (entry.isFile) {
    const file = await readFileEntry(entry as FileSystemFileEntry);
    setRelativePath(file, `${prefix}${file.name}`);
    return [file];
  }

  if (!entry.isDirectory) {
    return [];
  }

  const directory = entry as FileSystemDirectoryEntry;
  const entries = await readDirectoryEntries(directory);
  const nextPrefix = `${prefix}${entry.name}/`;
  return (await Promise.all(entries.map((child) => readEntryFiles(child, nextPrefix)))).flat();
}

function readFileEntry(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

async function readDirectoryEntries(entry: FileSystemDirectoryEntry) {
  const reader = entry.createReader();
  const entries: FileSystemEntry[] = [];

  while (true) {
    const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    if (batch.length === 0) {
      return entries;
    }
    entries.push(...batch);
  }
}

function setRelativePath(file: File, relativePath: string) {
  Object.defineProperty(file, "uploadRelativePath", {
    configurable: true,
    value: relativePath
  });
}

function getRelativePath(file: File) {
  return (
    (file as File & { uploadRelativePath?: string }).uploadRelativePath ||
    (file as File & { webkitRelativePath?: string }).webkitRelativePath ||
    file.name
  );
}

function uploadKey(file: File, relativePath: string) {
  return `${relativePath}|${file.size}|${file.lastModified}`;
}

function readDoneKeys() {
  if (typeof window === "undefined") {
    return new Set<string>();
  }

  try {
    return new Set(JSON.parse(window.localStorage.getItem(doneStorageKey) ?? "[]") as string[]);
  } catch {
    return new Set<string>();
  }
}

function markDone(item: UploadItem) {
  if (typeof window === "undefined") {
    return;
  }

  const doneKeys = readDoneKeys();
  doneKeys.add(uploadKey(item.file, item.relativePath));
  window.localStorage.setItem(doneStorageKey, JSON.stringify(Array.from(doneKeys).slice(-5000)));
}

function statusText(status: UploadStatus) {
  const text: Record<UploadStatus, string> = {
    pending: "等待上传",
    uploading: "上传中",
    done: "上传成功",
    failed: "上传失败",
    skipped: "已跳过"
  };
  return text[status];
}

function formatSize(value: number) {
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
