import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export class TekvroError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TekvroError";
    this.code = code;
  }
}

export const LIMITS = Object.freeze({
  fileBytes: 64 * 1024 * 1024,
  stringBytes: 1024 * 1024,
  scanFiles: 500,
  scanDepth: 8,
  responseChars: 128 * 1024,
});

function isInside(root, target) {
  const diff = relative(root, target);
  return diff === "" || (diff !== ".." && !diff.startsWith(".." + sep) && !isAbsolute(diff));
}

export function assertInteger(value, minimum, maximum, label) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new TekvroError("invalid_argument", `${label} 必须是 ${minimum} 至 ${maximum} 的整数`);
  }
  return value;
}

export async function openScope(directory) {
  if (typeof directory !== "string" || directory.length === 0 || directory.includes("\0")) {
    throw new TekvroError("invalid_root", "必须指定有效的分析根目录");
  }
  let root;
  try {
    root = await realpath(resolve(directory));
    if (!(await stat(root)).isDirectory()) {
      throw new TekvroError("invalid_root", "分析根目录必须是一个目录");
    }
  } catch (error) {
    if (error instanceof TekvroError) throw error;
    throw new TekvroError("invalid_root", "无法读取分析根目录");
  }
  return Object.freeze({ root });
}

export async function resolveTarget(scope, input = ".") {
  if (typeof input !== "string" || input.length === 0 || input.length > 4096 || input.includes("\0")) {
    throw new TekvroError("invalid_path", "目标路径不能为空、过长或含有空字符");
  }
  const candidate = resolve(scope.root, input);
  if (!isInside(scope.root, candidate)) {
    throw new TekvroError("path_out_of_scope", "目标超出了授权分析根目录");
  }
  try {
    const actual = await realpath(candidate);
    if (!isInside(scope.root, actual)) {
      throw new TekvroError("path_out_of_scope", "符号链接指向了授权范围之外");
    }
    const info = await stat(actual);
    const display = relative(scope.root, actual).split(sep).join("/") || ".";
    return { absolute: actual, relative: display, info };
  } catch (error) {
    if (error instanceof TekvroError) throw error;
    if (error?.code === "ENOENT") throw new TekvroError("not_found", "目标文件或目录不存在");
    if (error?.code === "EACCES" || error?.code === "EPERM") {
      throw new TekvroError("permission_denied", "没有读取目标的权限");
    }
    throw new TekvroError("io_error", "读取目标路径失败");
  }
}
