import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";

export async function ensureStorageFolders() {
  await Promise.all([
    fs.mkdir(env.uploadsDir, { recursive: true }),
    fs.mkdir(env.dataDir, { recursive: true }),
    fs.mkdir(path.join(env.serverDir, "pdfs"), { recursive: true })
  ]);
}
