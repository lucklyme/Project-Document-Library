import fs from "node:fs";
import Database from "better-sqlite3";
import { dbDir, dbPath, filesDir } from "@/lib/paths";

export type DocumentStatus = "active" | "obsolete";

export type DocumentRow = {
  id: number;
  code: string;
  title: string;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
};

export type DocumentVersionRow = {
  id: number;
  document_id: number;
  version: string;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  file_size: number;
  is_current: 0 | 1;
  uploaded_at: string;
};

export type DocumentChangeRow = {
  id: number;
  document_id: number;
  change_no: string;
  title: string;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  file_size: number;
  uploaded_at: string;
};

export type CurrentDocumentRow = DocumentRow &
  Pick<
    DocumentVersionRow,
    "version" | "original_filename" | "stored_filename" | "file_size" | "uploaded_at"
  > & {
    version_id: number;
    change_count: number;
  };

let db: Database.Database | null = null;

export function getDb() {
  if (!db) {
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(filesDir, { recursive: true });
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    migrate(db);
  }

  return db;
}

function migrate(database: Database.Database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      version TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE(document_id, version)
    );

    CREATE TABLE IF NOT EXISTS document_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      change_no TEXT NOT NULL,
      title TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      stored_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE(document_id, change_no)
    );

    CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status);
    CREATE INDEX IF NOT EXISTS idx_versions_document_id ON document_versions(document_id);
    CREATE INDEX IF NOT EXISTS idx_versions_current ON document_versions(is_current);
    CREATE INDEX IF NOT EXISTS idx_changes_document_id ON document_changes(document_id);
    CREATE INDEX IF NOT EXISTS idx_changes_change_no ON document_changes(change_no);
  `);

  mergeDuplicateDocuments(database);
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_code_unique ON documents(code);");
}

function mergeDuplicateDocuments(database: Database.Database) {
  const duplicateCodes = database
    .prepare("SELECT code FROM documents GROUP BY code HAVING COUNT(*) > 1")
    .all() as Array<{ code: string }>;

  for (const { code } of duplicateCodes) {
    database.transaction(() => {
      const documents = database
        .prepare(
          `SELECT d.id,
                  (SELECT COUNT(*) FROM document_versions v WHERE v.document_id = d.id) AS version_count,
                  (SELECT COUNT(*) FROM document_changes c WHERE c.document_id = d.id) AS change_count
           FROM documents d
           WHERE d.code = ?
           ORDER BY version_count DESC, change_count DESC, d.id ASC`
        )
        .all(code) as Array<{ id: number; version_count: number; change_count: number }>;

      const canonical = documents[0];
      if (!canonical) {
        return;
      }

      for (const duplicate of documents.slice(1)) {
        mergeVersions(database, canonical.id, duplicate.id);
        mergeChanges(database, canonical.id, duplicate.id);
        database.prepare("DELETE FROM documents WHERE id = ?").run(duplicate.id);
      }
    })();
  }
}

function mergeVersions(database: Database.Database, canonicalId: number, duplicateId: number) {
  const versions = database
    .prepare("SELECT id, version FROM document_versions WHERE document_id = ?")
    .all(duplicateId) as Array<{ id: number; version: string }>;

  for (const version of versions) {
    const existing = database
      .prepare("SELECT id FROM document_versions WHERE document_id = ? AND version = ?")
      .get(canonicalId, version.version);

    if (existing) {
      database.prepare("DELETE FROM document_versions WHERE id = ?").run(version.id);
    } else {
      database.prepare("UPDATE document_versions SET document_id = ? WHERE id = ?").run(canonicalId, version.id);
    }
  }
}

function mergeChanges(database: Database.Database, canonicalId: number, duplicateId: number) {
  const changes = database
    .prepare("SELECT id, change_no FROM document_changes WHERE document_id = ?")
    .all(duplicateId) as Array<{ id: number; change_no: string }>;

  for (const change of changes) {
    const existing = database
      .prepare("SELECT id FROM document_changes WHERE document_id = ? AND change_no = ?")
      .get(canonicalId, change.change_no);

    if (existing) {
      database.prepare("DELETE FROM document_changes WHERE id = ?").run(change.id);
    } else {
      database.prepare("UPDATE document_changes SET document_id = ? WHERE id = ?").run(canonicalId, change.id);
    }
  }
}
