import fs from "node:fs";
import { PassThrough, Readable } from "node:stream";
import { ZipArchive } from "archiver";
import { getDb, DATA_DIR } from "@/lib/db";
import { STORAGE_ROOT } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-click backup: zip the SQLite DB (data/) plus every uploaded and
 * generated file (storage/). The WAL is checkpointed first so the copied .db
 * contains every recent write; -wal/-shm files are then excluded.
 */
export async function GET() {
  const db = getDb();
  db.pragma("wal_checkpoint(TRUNCATE)");

  const archive = new ZipArchive({ zlib: { level: 9 } });
  const out = new PassThrough();
  archive.pipe(out);
  archive.on("error", (err: Error) => out.destroy(err));

  if (fs.existsSync(DATA_DIR)) {
    archive.glob("**/*", { cwd: DATA_DIR, ignore: ["*.db-wal", "*.db-shm"] }, { prefix: "data" });
  }
  if (fs.existsSync(STORAGE_ROOT)) {
    archive.directory(STORAGE_ROOT, "storage");
  }
  // Don't await: the response streams while the archive is still packing.
  void archive.finalize();

  const name = `jobpilot-backup-${new Date().toISOString().slice(0, 10)}.zip`;
  return new Response(Readable.toWeb(out) as unknown as ReadableStream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
