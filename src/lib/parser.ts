export type ParsedVersionFilename = {
  kind: "version";
  code: string;
  version: string;
  title: string;
  extension: string;
};

export type ParsedChangeFilename = {
  kind: "change";
  code: string;
  changeNo: string;
  title: string;
  extension: string;
};

export type ParsedFilename = ParsedVersionFilename | ParsedChangeFilename;

const revisionPattern = /\bRev\.?\s*([A-Za-z0-9]+)\b/i;
const changePattern = /-XG-(\d+)\s+/i;

export function parseDocumentFilename(filename: string): ParsedFilename | null {
  const dotIndex = filename.lastIndexOf(".");
  const basename = dotIndex > 0 ? filename.slice(0, dotIndex) : filename;
  const extension = dotIndex > 0 ? filename.slice(dotIndex + 1).toLowerCase() : "";

  return parseChangeFilename(basename, extension) ?? parseVersionFilename(basename, extension);
}

function parseVersionFilename(basename: string, extension: string): ParsedVersionFilename | null {
  const match = basename.match(revisionPattern);

  if (!match || match.index === undefined) {
    return null;
  }

  const code = basename.slice(0, match.index).trim();
  const version = `Rev.${match[1].trim()}`;
  const title = basename.slice(match.index + match[0].length).trim();

  if (!code || !version || !title) {
    return null;
  }

  return { kind: "version", code, version, title, extension };
}

function parseChangeFilename(basename: string, extension: string): ParsedChangeFilename | null {
  const matches = Array.from(basename.matchAll(new RegExp(changePattern, "gi")));
  const match = matches.at(-1);

  if (!match || match.index === undefined) {
    return null;
  }

  const code = basename.slice(0, match.index).trim();
  const changeNo = `XG-${match[1].trim()}`;
  const title = basename.slice(match.index + match[0].length).trim();

  if (!code || !changeNo || !title) {
    return null;
  }

  return { kind: "change", code, changeNo, title, extension };
}

export function compareVersions(a: string, b: string): number {
  const aValue = extractVersionValue(a);
  const bValue = extractVersionValue(b);

  if (typeof aValue === "number" && typeof bValue === "number") {
    return aValue - bValue;
  }

  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

export function compareChangeNumbers(a: string, b: string): number {
  return a.localeCompare(b, "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function extractVersionValue(version: string): number | string {
  const match = version.match(/Rev\.?\s*(\d+)/i);
  return match ? Number(match[1]) : version;
}
