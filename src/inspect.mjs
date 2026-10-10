import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { assertInteger, LIMITS, resolveTarget, TekvroError } from "./scope.mjs";

const IGNORED_DIRECTORIES = new Set([".git", "node_modules", ".cache", "coverage"]);
const TYPE_BY_EXTENSION = Object.freeze({
  ".js": "JavaScript", ".mjs": "JavaScript", ".cjs": "JavaScript",
  ".ts": "TypeScript", ".tsx": "TypeScript", ".jsx": "JavaScript",
  ".json": "JSON", ".html": "HTML", ".css": "CSS",
  ".py": "Python", ".java": "Java", ".class": "JVM class",
  ".wasm": "WebAssembly", ".apk": "APK/ZIP", ".jar": "JAR/ZIP",
  ".exe": "PE executable", ".dll": "PE library", ".so": "ELF library",
  ".dylib": "Mach-O library", ".pdf": "PDF", ".zip": "ZIP archive",
});

function inferByName(filename) {
  return TYPE_BY_EXTENSION[extname(filename).toLowerCase()] ?? "unknown";
}

export function detectFormat(buffer, filename = "") {
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) return "ELF";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x00, 0x61, 0x73, 0x6d]))) return "WebAssembly";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]))) return "ZIP container";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return "PDF";
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "PNG";
  if (buffer.length >= 2 && buffer[0] === 0x1f && buffer[1] === 0x8b) return "GZIP";
  if (buffer.length >= 16 && buffer.subarray(0, 16).toString("ascii") === "SQLite format 3\0") return "SQLite";
  const mach = buffer.subarray(0, 4).toString("hex");
  if (["feedface", "cefaedfe", "feedfacf", "cffaedfe", "cafebabe", "bebafeca"].includes(mach)) return "Mach-O";
  if (buffer.length >= 64 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    const offset = buffer.readUInt32LE(0x3c);
    if (offset + 4 <= buffer.length && buffer.toString("hex", offset, offset + 4) === "50450000") return "PE";
  }
  return inferByName(filename);
}

async function readPrefix(filename, count = 4096) {
  const handle = await open(filename, "r");
  try {
    const bytes = Buffer.alloc(count);
    const { bytesRead } = await handle.read(bytes, 0, count, 0);
    return bytes.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function digestFile(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename, { highWaterMark: 64 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

export async function inspectFile(scope, input) {
  const target = await resolveTarget(scope, input);
  if (!target.info.isFile()) throw new TekvroError("not_a_file", "目标不是普通文件");
  if (target.info.size > LIMITS.fileBytes) {
    throw new TekvroError("file_too_large", "单文件超过 64 MiB 安全分析上限");
  }
  const prefix = await readPrefix(target.absolute);
  return {
    path: target.relative,
    size_bytes: target.info.size,
    format: detectFormat(prefix, target.relative),
    sha256: await digestFile(target.absolute),
    header_hex: prefix.subarray(0, 32).toString("hex"),
    modified_at: target.info.mtime.toISOString(),
  };
}

export async function extractStrings(scope, input, options = {}) {
  const target = await resolveTarget(scope, input);
  if (!target.info.isFile()) throw new TekvroError("not_a_file", "目标不是普通文件");
  const minimum = assertInteger(options.min_length ?? 5, 4, 64, "min_length");
  const limit = assertInteger(options.limit ?? 50, 1, 200, "limit");
  const count = Math.min(target.info.size, LIMITS.stringBytes);
  const handle = await open(target.absolute, "r");
  let source;
  try {
    source = Buffer.alloc(count);
    const { bytesRead } = await handle.read(source, 0, count, 0);
    source = source.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
  const values = [];
  let total = 0;
  const pattern = /[\x20-\x7e]+/g;
  for (const match of source.toString("latin1").matchAll(pattern)) {
    if (match[0].length < minimum) continue;
    total += 1;
    if (values.length < limit) values.push({ offset: match.index, value: match[0].slice(0, 300) });
  }
  return {
    path: target.relative,
    bytes_examined: source.length,
    total_matches: total,
    truncated: target.info.size > source.length || total > limit,
    strings: values,
  };
}

export async function scanDirectory(scope, input = ".", options = {}) {
  const target = await resolveTarget(scope, input);
  const maxFiles = assertInteger(options.max_files ?? 100, 1, LIMITS.scanFiles, "max_files");
  if (!target.info.isDirectory()) throw new TekvroError("not_a_directory", "目标不是目录");
  const pending = [{ directory: target.absolute, rel: target.relative === "." ? "" : target.relative, depth: 0 }];
  const files = [];
  const skipped = { links: 0, ignored_directories: 0, deep_directories: 0 };
  let truncated = false;
  while (pending.length > 0) {
    const current = pending.shift();
    let entries;
    try {
      entries = await readdir(current.directory, { withFileTypes: true });
    } catch {
      throw new TekvroError("io_error", "目录列表读取失败");
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      if (files.length >= maxFiles) { truncated = true; break; }
      const rel = [current.rel, entry.name].filter(Boolean).join("/");
      if (entry.isSymbolicLink()) { skipped.links++; continue; }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) { skipped.ignored_directories++; continue; }
        if (current.depth >= LIMITS.scanDepth) { skipped.deep_directories++; continue; }
        pending.push({ directory: join(current.directory, entry.name), rel, depth: current.depth + 1 });
      } else if (entry.isFile()) {
        const checked = await resolveTarget(scope, rel);
        files.push({ path: rel, size_bytes: checked.info.size, estimated_format: inferByName(rel) });
      }
    }
    if (truncated) break;
  }
  files.sort((a, b) => a.path.localeCompare(b.path, "en"));
  const formats = {};
  for (const file of files) {
    formats[file.estimated_format] = (formats[file.estimated_format] ?? 0) + 1;
  }
  return {
    path: target.relative,
    files_count: files.length,
    truncated: truncated || pending.length > 0,
    skipped,
    formats,
    files,
  };
}
