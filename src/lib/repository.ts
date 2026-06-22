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

export type DeleteUploadResult = UploadResult & {
  deletedDocument?: boolean;
};

export type DocumentStatistics = {
  activeDocuments: number;
  totalVersions: number;
  totalChanges: number;
  obsoleteDocuments: number;
};

export type DetailedStatistics = DocumentStatistics & {
  averageVersionsPerDocument: number;
  averageChangesPerDocument: number;
  obsoleteRate: number;
  storageSize: number;
  versionStorageSize: number;
  changeStorageSize: number;
  versionDistribution: {
    single: number;
    multiple: number;
    heavy: number;
  };
  changeDistribution: {
    none: number;
    few: number;
    many: number;
  };
  recentUploads: {
    last7Days: number;
    last30Days: number;
    latestUploadTime: string | null;
  };
};

export function getProjectName() {
  return process.env.APP_PROJECT_NAME?.trim() || "文档资料库";
}

export function getDocumentStatistics(): DocumentStatistics {
  const database = getDb();

  const docStats = database
    .prepare(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'obsolete' THEN 1 ELSE 0 END) as obsolete
       FROM documents`
    )
    .get() as { total: number; active: number; obsolete: number };

  const versionStats = database
    .prepare(`SELECT COUNT(*) as totalVersions FROM document_versions`)
    .get() as { totalVersions: number };

  const changeStats = database
    .prepare(`SELECT COUNT(*) as totalChanges FROM document_changes`)
    .get() as { totalChanges: number };

  return {
    activeDocuments: docStats.active,
    totalVersions: versionStats.totalVersions,
    totalChanges: changeStats.totalChanges,
    obsoleteDocuments: docStats.obsolete
  };
}

export function getDetailedStatistics(): DetailedStatistics {
  const database = getDb();
  const basic = getDocumentStatistics();

  // 平均值计算
  const totalDocs = basic.activeDocuments + basic.obsoleteDocuments;
  const avgVersions = totalDocs > 0 ? basic.totalVersions / totalDocs : 0;
  const avgChanges = totalDocs > 0 ? basic.totalChanges / totalDocs : 0;
  const obsoleteRate = totalDocs > 0 ? (basic.obsoleteDocuments / totalDocs) * 100 : 0;

  // 存储空间统计
  const storageStats = database
    .prepare(
      `SELECT
        COALESCE(SUM(file_size), 0) as versionSize
       FROM document_versions`
    )
    .get() as { versionSize: number };

  const changeStorageStats = database
    .prepare(
      `SELECT
        COALESCE(SUM(file_size), 0) as changeSize
       FROM document_changes`
    )
    .get() as { changeSize: number };

  // 版本分布统计
  const versionDist = database
    .prepare(
      `SELECT
        SUM(CASE WHEN version_count = 1 THEN 1 ELSE 0 END) as single,
        SUM(CASE WHEN version_count >= 2 AND version_count <= 5 THEN 1 ELSE 0 END) as multiple,
        SUM(CASE WHEN version_count >= 6 THEN 1 ELSE 0 END) as heavy
       FROM (
         SELECT document_id, COUNT(*) as version_count
         FROM document_versions
         GROUP BY document_id
       )`
    )
    .get() as { single: number; multiple: number; heavy: number };

  // 变更分布统计
  const changeDist = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM documents WHERE id NOT IN (SELECT DISTINCT document_id FROM document_changes)) as none,
        SUM(CASE WHEN change_count >= 1 AND change_count <= 5 THEN 1 ELSE 0 END) as few,
        SUM(CASE WHEN change_count >= 6 THEN 1 ELSE 0 END) as many
       FROM (
         SELECT document_id, COUNT(*) as change_count
         FROM document_changes
         GROUP BY document_id
       )`
    )
    .get() as { none: number; few: number; many: number };

  // 活跃度统计
  const now = new Date();
  const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const recentStats = database
    .prepare(
      `SELECT
        (SELECT COUNT(*) FROM document_versions WHERE uploaded_at >= ?) as last7Days,
        (SELECT COUNT(*) FROM document_versions WHERE uploaded_at >= ?) as last30Days,
        (SELECT uploaded_at FROM document_versions ORDER BY uploaded_at DESC LIMIT 1) as latestUpload
       `
    )
    .get(last7Days, last30Days) as { last7Days: number; last30Days: number; latestUpload: string | null };

  return {
    ...basic,
    averageVersionsPerDocument: Math.round(avgVersions * 10) / 10,
    averageChangesPerDocument: Math.round(avgChanges * 10) / 10,
    obsoleteRate: Math.round(obsoleteRate * 10) / 10,
    storageSize: storageStats.versionSize + changeStorageStats.changeSize,
    versionStorageSize: storageStats.versionSize,
    changeStorageSize: changeStorageStats.changeSize,
    versionDistribution: {
      single: versionDist.single || 0,
      multiple: versionDist.multiple || 0,
      heavy: versionDist.heavy || 0
    },
    changeDistribution: {
      none: changeDist.none || 0,
      few: changeDist.few || 0,
      many: changeDist.many || 0
    },
    recentUploads: {
      last7Days: recentStats.last7Days,
      last30Days: recentStats.last30Days,
      latestUploadTime: recentStats.latestUpload
    }
  };
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

export type SortField = "code" | "title" | "status" | "version" | "change_count" | "uploaded_at";
export type SortOrder = "asc" | "desc";

export function listCurrentDocuments(
  query = "",
  includeObsolete = false,
  sortBy: SortField = "code",
  sortOrder: SortOrder = "asc"
) {
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

  // 构建 ORDER BY 子句
  let orderByClause = "ORDER BY ";
  switch (sortBy) {
    case "code":
      orderByClause += `d.code ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    case "title":
      orderByClause += `d.title ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    case "status":
      orderByClause += `d.status ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    case "version":
      orderByClause += `v.version ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    case "change_count":
      orderByClause += `change_count ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    case "uploaded_at":
      orderByClause += `v.uploaded_at ${sortOrder === "asc" ? "ASC" : "DESC"}`;
      break;
    default:
      orderByClause += "d.code ASC";
  }

  const results = database
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
       ${orderByClause}`
    )
    .all({ like }) as CurrentDocumentRow[];

  // 对于版本号，需要使用自定义排序
  if (sortBy === "version") {
    results.sort((a, b) => {
      const comparison = compareVersions(a.version, b.version);
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }

  return results;
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

export function deleteVersionFile(versionId: number): DeleteUploadResult {
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
    return { ok: false, message: "version not found" };
  }

  const versionFiles = database
    .prepare("SELECT stored_path FROM document_versions WHERE document_id = ?")
    .all(existing.document_id) as Array<Pick<DocumentVersionRow, "stored_path">>;
  const changeFiles = database
    .prepare("SELECT stored_path FROM document_changes WHERE document_id = ?")
    .all(existing.document_id) as Array<Pick<DocumentChangeRow, "stored_path">>;
  const versionCount = versionFiles.length;
  const pathsToRemove =
    versionCount <= 1 ? [...versionFiles, ...changeFiles].map((row) => row.stored_path) : [existing.stored_path];

  database.transaction(() => {
    if (versionCount <= 1) {
      database.prepare("DELETE FROM document_changes WHERE document_id = ?").run(existing.document_id);
      database.prepare("DELETE FROM document_versions WHERE document_id = ?").run(existing.document_id);
      database.prepare("DELETE FROM documents WHERE id = ?").run(existing.document_id);
    } else {
      database.prepare("DELETE FROM document_versions WHERE id = ?").run(versionId);
      refreshCurrentVersion(existing.document_id);
      database.prepare("UPDATE documents SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), existing.document_id);
    }
  })();

  for (const storedPath of pathsToRemove) {
    removeStoredFileIfExists(storedPath);
  }

  return {
    ok: true,
    message: versionCount <= 1 ? "document deleted" : "version deleted",
    documentId: existing.document_id,
    deletedDocument: versionCount <= 1
  };
}

export function deleteChangeFile(changeId: number): DeleteUploadResult {
  const database = getDb();
  const existing = database
    .prepare("SELECT * FROM document_changes WHERE id = ?")
    .get(changeId) as DocumentChangeRow | undefined;

  if (!existing) {
    return { ok: false, message: "change file not found" };
  }

  database.transaction(() => {
    database.prepare("DELETE FROM document_changes WHERE id = ?").run(changeId);
    database.prepare("UPDATE documents SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), existing.document_id);
  })();

  removeStoredFileIfExists(existing.stored_path);

  return {
    ok: true,
    message: "change file deleted",
    documentId: existing.document_id
  };
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

function removeStoredFileIfExists(storedPath: string) {
  const resolvedFilesDir = path.resolve(filesDir);
  const resolvedStoredPath = path.resolve(storedPath);
  const insideFilesDir =
    resolvedStoredPath === resolvedFilesDir || resolvedStoredPath.startsWith(`${resolvedFilesDir}${path.sep}`);

  if (!insideFilesDir) {
    throw new Error("refusing to delete file outside data directory");
  }

  removeFileIfExists(resolvedStoredPath);
}

function safeFilename(filename: string) {
  return filename.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_");
}
