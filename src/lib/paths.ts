import path from "node:path";

export const dataDir = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
export const filesDir = path.join(dataDir, "files");
export const dbDir = path.join(dataDir, "db");
export const dbPath = path.join(dbDir, "documents.sqlite");
