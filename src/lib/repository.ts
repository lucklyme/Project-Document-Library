import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getDb,
  type CurrentDocumentRow,
  type DocumentChangeRow,
  type DocumentRow,
  type DocumentVersionRow
} from "@/lib/db";
import { filesDir } from "@/lib/paths";
import { compareChangeNumbers, compareVersions, parseDocumentFilename } from "@/lib/parser";

export type DocumentDetail = DocumentRow & {
  versions: DocumentVersionRow[];
  changes: DocumentChangeRow[];
};

export type UploadResult = {
  ok: boolean;
  message: string;
  documentId?: number;
};

export function getProjectName() {
  return process.env.APP_PROJECT_NAME?.trim() || "文档资料库";
}

export async function saveUpload(file: File): Promise<UploadResult> {
  const parsed = parseDocumentFilename(file.name);

  if (!parsed) {
    return {
      ok: false,
      message: "文件名无法识别，请使用格式：文件编号 Rev.版本 文件标题.pdf，或 文件编号-XG-流水号 变更标题.pdf"
    };
  }

  if (parsed.kind === "change") {
    return saveChangeUpload(file, parsed);
  }

  return saveVersionUpload(file, parsed);
}

async function saveVersionUpload(file: File, parsed: Extract<ReturnType<typeof parseDocumentFilename>, { kind: "version" }>) {
  if (!parsed) {
    return { ok: false, message: "文件名无法识别" };
  }

  const database = getDb();
  const now = new Date().toISOString();

  try {
    const documentId = database.transaction(() => {
      let document = database.prepare("SELECT * FROM documents WHERE code = ?").get(parsed.code) as DocumentRow | undefined;

      if (!document) {
        const result = database
          .prepare(
            `INSERT INTO documents (code, title, status, created_at, updated_at)
             VALUES (?, ?, 'active', ?, ?)`
          )
          .run(parsed.code, parsed.title, now, now);
        document = database.prepare("SELECT * FROM documents WHERE id = ?").get(result.lastInsertRowid) as DocumentRow;
      } else {
        database
          .prepare("UPDATE documents SET title = ?, status = 'active', updated_at = ? WHERE id = ?")
          .run(parsed.title, now, document.id);
      }

      const existing = database
        .prepare("SELECT * FROM document_versions WHERE document_id = ? AND version = ?")
        .get(document.id, parsed.version) as DocumentVersionRow | undefined;

      if (existing) {
        throw new Error(`版本 ${parsed.version} 已存在，请使用版本替换功能或确认是否重复上传。`);
      }

      return document.id;
    })();

    const stored = await writeFile(documentId, file);

    try {
      database
        .prepare(
          `INSERT INTO document_versions
            (document_id, version, original_filename, stored_filename, stored_path, file_size, is_current, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
        )
        .run(documentId, parsed.version, file.name, stored.filename, stored.path, file.size, now);

      refreshCurrentVersion(documentId);
    } catch (error) {
      removeFileIfExists(stored.path);
      throw error;
    }

    return { ok: true, message: "上传成功", documentId };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "上传失败"
    };
  }
}

async function saveChangeUpload(file: File, parsed: Extract<ReturnType<typeof parseDocumentFilename>, { kind: "change" }>) {
  if (!parsed) {
    return { ok: false, message: "文件名无法识别" };
  }

  const database = getDb();
  const now = new Date().toISOString();

  try {
    const document = database.prepare("SELECT * FROM documents WHERE code = ?").get(parsed.code) as DocumentRow | undefined;
    if (!document) {
      return { ok: false, message: `未找到文件编号 ${parsed.code}，请先上传主文件版本。` };
    }

    const existing = database
      .prepare("SELECT * FROM document_changes WHERE document_id = ? AND change_no = ?")
      .get(document.id, parsed.changeNo) as DocumentChangeRow | undefined;

    if (existing) {
      return { ok: false, message: `变更单 ${parsed.changeNo} 已存在，请确认是否重复上传。` };
    }

    const stored = await writeFile(document.id, file);

    try {
      database
        .prepare(
          `INSERT INTO document_changes
            (document_id, change_no, title, original_filename, stored_filename, stored_path, file_size, uploaded_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(document.id, parsed.changeNo, parsed.title, file.name, stored.filename, stored.path, file.size, now);
    } catch (error) {
      removeFileIfExists(stored.path);
      throw error;
    }

    return { ok: true, message: "变更单上传成功", documentId: document.id };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "上传失败"
    };
  }
}

export function listCurrentDocuments(query = "", includeObsolete = false) {
  const like = `%${query.trim()}%`;
  const database = getDb();
  const searchWhere = query.trim()
    ? `AND (
        d.code LIKE @like
        OR d.title LIKE @like
        OR v.version LIKE @like
        OR v.original_filename LIKE @like
        OR EXISTS (
          SELECT 1
          FROM document_changes c
          WHERE c.document_id = d.id
            AND (c.change_no LIKE @like OR c.title LIKE @like OR c.original_filename LIKE @like)
        )
      )`
    : "";
  const statusWhere = includeObsolete ? "" : "AND d.status = 'active'";

  return database
    .prepare(
      `SELECT d.*,
              v.id AS version_id,
              v.version,
              v.original_filename,
              v.stored_filename,
              v.file_size,
              v.uploaded_at,
              COALESCE(c.change_count, 0) AS change_count
       FROM documents d
       JOIN document_versions v ON v.document_id = d.id AND v.is_current = 1
       LEFT JOIN (
         SELECT document_id, COUNT(*) AS change_count
         FROM document_changes
         GROUP BY document_id
       ) c ON c.document_id = d.id
       WHERE 1 = 1 ${statusWhere} ${searchWhere}
       ORDER BY d.code ASC`
    )
    .all({ like }) as CurrentDocumentRow[];
}

export function getDocumentDetail(id: number): DocumentDetail | null {
  const database = getDb();
  const document = database.prepare("SELECT * FROM documents WHERE id = ?").get(id) as DocumentRow | undefined;

  if (!document) {
    return null;
  }

  const versions = database
    .prepare("SELECT * FROM document_versions WHERE document_id = ?")
    .all(id) as DocumentVersionRow[];
  const changes = database
    .prepare("SELECT * FROM document_changes WHERE document_id = ?")
    .all(id) as DocumentChangeRow[];

  return {
    ...document,
    versions: versions.sort((a, b) => compareVersions(b.version, a.version)),
    changes: changes.sort((a, b) => compareChangeNumbers(b.change_no, a.change_no))
  };
}

export function setDocumentStatus(id: number, status: "active" | "obsolete") {
  getDb()
    .prepare("UPDATE documents SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, new Date().toISOString(), id);
}

export function getVersionFile(versionId: number) {
  return getDb().prepare("SELECT * FROM document_versions WHERE id = ?").get(versionId) as DocumentVersionRow | undefined;
}

export function getChangeFile(changeId: number) {
  return getDb().prepare("SELECT * FROM document_changes WHERE id = ?").get(changeId) as DocumentChangeRow | undefined;
}

export async function replaceVersionFile(versionId: number, file: File): Promise<UploadResult> {
  const parsed = parseDocumentFilename(file.name);
  if (!parsed || parsed.kind !== "version") {
    return { ok: false, message: "文件名无法识别，请使用同一文件编号和同一 Rev 的文件。" };
  }

  const database = getDb();
  const existing = database
    .prepare(
      `SELECT v.*, d.code
       FROM document_versions v
       JOIN documents d ON d.id = v.document_id
       WHERE v.id = ?`
    )
    .get(versionId) as (DocumentVersionRow & { code: string }) | undefined;

  if (!existing) {
    return { ok: false, message: "版本不存在" };
  }
  if (existing.code !== parsed.code || existing.version !== parsed.version) {
    return { ok: false, message: "替换文件必须保持同一文件编号和同一 Rev。" };
  }

  const stored = await writeFile(existing.document_id, file);

  try {
    moveReplacedFile(existing.stored_path, existing.stored_filename);
    database
      .prepare(
        `UPDATE document_versions
         SET original_filename = ?, stored_filename = ?, stored_path = ?, file_size = ?, uploaded_at = ?
         WHERE id = ?`
      )
      .run(file.name, stored.filename, stored.path, file.size, new Date().toISOString(), versionId);
  } catch (error) {
    removeFileIfExists(stored.path);
    throw error;
  }

  return { ok: true, message: "版本文件已替换", documentId: existing.document_id };
}

export async function replaceChangeFile(changeId: number, file: File): Promise<UploadResult> {
  const parsed = parseDocumentFilename(file.name);
  if (!parsed || parsed.kind !== "change") {
    return { ok: false, message: "文件名无法识别，请使用同一文件编号和同一 XG 流水号的文件。" };
  }

  const database = getDb();
  const existing = database
    .prepare(
      `SELECT c.*, d.code
       FROM document_changes c
       JOIN documents d ON d.id = c.document_id
       WHERE c.id = ?`
    )
    .get(changeId) as (DocumentChangeRow & { code: string }) | undefined;

  if (!existing) {
    return { ok: false, message: "变更单不存在" };
  }
  if (existing.code !== parsed.code || existing.change_no !== parsed.changeNo) {
    return { ok: false, message: "替换文件必须保持同一文件编号和同一 XG 流水号。" };
  }

  const stored = await writeFile(existing.document_id, file);

  try {
    moveReplacedFile(existing.stored_path, existing.stored_filename);
    database
      .prepare(
        `UPDATE document_changes
         SET title = ?, original_filename = ?, stored_filename = ?, stored_path = ?, file_size = ?, uploaded_at = ?
         WHERE id = ?`
      )
      .run(parsed.title, file.name, stored.filename, stored.path, file.size, new Date().toISOString(), changeId);
  } catch (error) {
    removeFileIfExists(stored.path);
    throw error;
  }

  return { ok: true, message: "变更单文件已替换", documentId: existing.document_id };
}

function refreshCurrentVersion(documentId: number) {
  const database = getDb();
  const versions = database
    .prepare("SELECT * FROM document_versions WHERE document_id = ?")
    .all(documentId) as DocumentVersionRow[];
  const current = versions.sort((a, b) => compareVersions(b.version, a.version))[0];

  database.prepare("UPDATE document_versions SET is_current = 0 WHERE document_id = ?").run(documentId);
  if (current) {
    database.prepare("UPDATE document_versions SET is_current = 1 WHERE id = ?").run(current.id);
  }
}

async function writeFile(documentId: number, file: File) {
  fs.mkdirSync(filesDir, { recursive: true });
  const storedFilename = `${documentId}-${Date.now()}-${safeFilename(file.name)}`;
  const storedPath = path.join(filesDir, storedFilename);

  await pipeline(
    Readable.fromWeb(file.stream() as unknown as Parameters<typeof Readable.fromWeb>[0]),
    fs.createWriteStream(storedPath)
  );
  return { filename: storedFilename, path: storedPath };
}

function moveReplacedFile(storedPath: string, storedFilename: string) {
  if (!fs.existsSync(storedPath)) {
    return;
  }

  const backupDir = path.join(filesDir, ".replaced");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `${Date.now()}-${safeFilename(storedFilename)}`);
  fs.renameSync(storedPath, backupPath);
}

function removeFileIfExists(storedPath: string) {
  if (fs.existsSync(storedPath)) {
    fs.rmSync(storedPath, { force: true });
  }
}

function safeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}
