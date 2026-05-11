// Shared helpers for the lucas-quality-gate scripts.
//
// Design rules:
//   - All I/O and subprocess access funnels through this file.
//   - Subprocess uses spawnSync with shell:false; arguments are arrays.
//   - readJson never throws on missing/invalid file; it returns a fallback.
//   - walkFiles respects include/exclude globs and never follows symlinks.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const REPO_ROOT = process.cwd();

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_err) {
    return false;
  }
}

function dirExists(dirPath) {
  try {
    return fs.statSync(dirPath).isDirectory();
  } catch (_err) {
    return false;
  }
}

function readJson(filePath, fallback = null) {
  if (!fileExists(filePath)) return fallback;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (_err) {
    return fallback;
  }
}

function readText(filePath, fallback = "") {
  if (!fileExists(filePath)) return fallback;
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (_err) {
    return fallback;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeText(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf8");
}

// Run a subprocess safely. Args are always passed as an array and never
// concatenated into a shell string. Returns a structured result rather
// than throwing.
function runCommandSafe(bin, args, options = {}) {
  let result;
  try {
    result = spawnSync(bin, args, {
      encoding: "utf8",
      shell: false,
      maxBuffer: 16 * 1024 * 1024,
      cwd: REPO_ROOT,
      ...options,
    });
  } catch (err) {
    return {
      ok: false,
      stdout: "",
      stderr: "",
      error: err,
      status: null,
    };
  }
  return {
    ok: result.status === 0 && !result.error,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null,
    status: typeof result.status === "number" ? result.status : null,
  };
}

function formatPercent(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  return `${Number(value).toFixed(digits)}%`;
}

function formatDelta(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Number(value).toFixed(digits)}`;
}

function safeNumber(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizePath(p) {
  if (!p) return p;
  return p.split(path.sep).join("/");
}

// Simple glob -> RegExp. Supports **, *, ?, and literal text.
// Sufficient for the patterns shipped in quality-gate.config.cjs.
function globToRegex(glob) {
  let regex = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        regex += ".*";
        i += 2;
        if (glob[i] === "/") i += 1;
      } else {
        regex += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      regex += "[^/]";
      i += 1;
    } else if (".+^$(){}|[]\\".includes(c)) {
      regex += "\\" + c;
      i += 1;
    } else {
      regex += c;
      i += 1;
    }
  }
  regex += "$";
  return new RegExp(regex);
}

function matchGlob(filePath, patterns) {
  const normalized = normalizePath(filePath);
  for (const pattern of patterns) {
    if (globToRegex(pattern).test(normalized)) return true;
  }
  return false;
}

// Recursively walk a directory, returning relative paths that pass the
// include/exclude globs. Never follows symlinks. Defensive against
// permission errors on individual entries.
function walkFiles(rootDir, options = {}) {
  const include = options.include || ["**/*"];
  const exclude = options.exclude || [];
  const results = [];

  function visit(absDir, relDir) {
    let entries;
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch (_err) {
      return;
    }
    for (const entry of entries) {
      const absChild = path.join(absDir, entry.name);
      const relChild = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (matchGlob(relChild, exclude)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absChild, relChild);
      } else if (entry.isFile()) {
        if (matchGlob(relChild, include)) {
          results.push(relChild);
        }
      }
    }
  }

  visit(rootDir, "");
  return results;
}

function countLines(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    if (content.length === 0) return 0;
    return content.split(/\r\n|\n|\r/).length;
  } catch (_err) {
    return null;
  }
}

// Detect the project stack to inform messages and command choices.
function detectStack(cwd = REPO_ROOT) {
  const stack = {
    packageManager: null,
    testRunner: null,
    eslint: false,
    typescript: false,
    unity: false,
    python: false,
    hasGit: false,
  };

  if (fileExists(path.join(cwd, "pnpm-lock.yaml"))) stack.packageManager = "pnpm";
  else if (fileExists(path.join(cwd, "yarn.lock"))) stack.packageManager = "yarn";
  else if (fileExists(path.join(cwd, "package-lock.json"))) stack.packageManager = "npm";
  else if (fileExists(path.join(cwd, "package.json"))) stack.packageManager = "npm";

  const pkg = readJson(path.join(cwd, "package.json"), null);
  if (pkg) {
    const allDeps = Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {});
    if (allDeps.vitest) stack.testRunner = "vitest";
    else if (allDeps.jest) stack.testRunner = "jest";
    if (allDeps.eslint) stack.eslint = true;
    if (allDeps.typescript) stack.typescript = true;
  }

  if (
    !stack.eslint &&
    (fileExists(path.join(cwd, ".eslintrc.js")) ||
      fileExists(path.join(cwd, ".eslintrc.cjs")) ||
      fileExists(path.join(cwd, ".eslintrc.json")) ||
      fileExists(path.join(cwd, ".eslintrc.yml")) ||
      fileExists(path.join(cwd, ".eslintrc.yaml")) ||
      fileExists(path.join(cwd, "eslint.config.js")) ||
      fileExists(path.join(cwd, "eslint.config.cjs")) ||
      fileExists(path.join(cwd, "eslint.config.mjs")))
  ) {
    stack.eslint = true;
  }

  if (!stack.typescript && fileExists(path.join(cwd, "tsconfig.json"))) {
    stack.typescript = true;
  }

  if (
    dirExists(path.join(cwd, "Assets")) &&
    dirExists(path.join(cwd, "ProjectSettings"))
  ) {
    stack.unity = true;
  }

  if (
    fileExists(path.join(cwd, "pyproject.toml")) ||
    fileExists(path.join(cwd, "requirements.txt"))
  ) {
    stack.python = true;
  }

  if (dirExists(path.join(cwd, ".git"))) {
    stack.hasGit = true;
  }

  return stack;
}

function getCurrentBranch() {
  const res = runCommandSafe("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!res.ok) return null;
  return res.stdout.trim() || null;
}

function isMainLikeBranch(name) {
  if (!name) return false;
  return ["main", "master", "develop"].includes(name);
}

module.exports = {
  REPO_ROOT,
  fileExists,
  dirExists,
  readJson,
  readText,
  ensureDir,
  writeJson,
  writeText,
  runCommandSafe,
  formatPercent,
  formatDelta,
  safeNumber,
  normalizePath,
  globToRegex,
  matchGlob,
  walkFiles,
  countLines,
  detectStack,
  getCurrentBranch,
  isMainLikeBranch,
};
