import path from "node:path";
import fs from "node:fs";
import { Readable } from "node:stream";

// JOBPILOT_STORAGE_DIR redirects uploads and generated PDFs; the verification
// scripts set it so a run cannot write into real storage. See DATA_DIR in db.ts.
export const STORAGE_ROOT = process.env.JOBPILOT_STORAGE_DIR
  ? path.resolve(process.env.JOBPILOT_STORAGE_DIR)
  : path.join(process.cwd(), "storage");

/** Sanitize an original filename for storage: lowercase, safe chars, capped. */
export function sanitizeFilename(name: string): string {
  const ext = path.extname(name).toLowerCase();
  const base = path
    .basename(name, path.extname(name))
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return `${base || "file"}${ext}`;
}

/**
 * Resolve a DB-stored relative path against the storage root, refusing
 * anything that escapes it. Download routes only ever pass paths read from
 * the DB, but keep the containment check as defense in depth.
 */
export function resolveStoragePath(relPath: string): string {
  const abs = path.resolve(STORAGE_ROOT, relPath);
  if (abs !== STORAGE_ROOT && !abs.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error("Path escapes storage root");
  }
  return abs;
}

/** Write a buffer under the storage root; returns the relative path (forward slashes). */
export function writeStorageFile(relPath: string, data: Buffer): string {
  const abs = resolveStoragePath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  return relPath.split(path.sep).join("/");
}

export function deleteStorageFile(relPath: string | null | undefined): void {
  if (!relPath) return;
  try {
    const abs = resolveStoragePath(relPath);
    if (fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch {
    // best effort — orphaned files are harmless
  }
}

/** Stream a stored file as an attachment without buffering it in memory. */
/**
 * `disposition` defaults to attachment, which is what every download link
 * wants. Pass "inline" to let the browser render it in place instead — an
 * <iframe> pointed at an attachment response downloads the file rather than
 * showing it, so previewing needs this.
 */
export function streamFileResponse(
  relPath: string,
  filename: string,
  mime: string,
  disposition: "attachment" | "inline" = "attachment"
): Response {
  const abs = resolveStoragePath(relPath);
  if (!fs.existsSync(abs)) {
    return new Response("File not found", { status: 404 });
  }
  const stat = fs.statSync(abs);
  const nodeStream = fs.createReadStream(abs);
  return new Response(Readable.toWeb(nodeStream) as unknown as ReadableStream, {
    headers: {
      "Content-Type": mime,
      "Content-Length": String(stat.size),
      "Content-Disposition": `${disposition}; filename="${filename.replace(/["\\\r\n]/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
