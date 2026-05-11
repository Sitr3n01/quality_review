// Collect file-level metrics: total files, line counts, oversized files,
// changed files (via git diff with fallback chain).

const path = require("path");
const {
  REPO_ROOT,
  walkFiles,
  countLines,
  runCommandSafe,
  normalizePath,
  dirExists,
} = require("./utils");

// Determine the changed files between the current HEAD and the base branch.
// Tries several strategies, degrading gracefully.
function getChangedFiles() {
  const warnings = [];
  if (!dirExists(path.join(REPO_ROOT, ".git"))) {
    warnings.push({
      severity: "info",
      message: "Working directory is not a git repository.",
      recommendation: "Changed-file detection is disabled. Initialize git to enable PR-aware checks.",
    });
    return { strategy: "none", files: null, warnings };
  }

  // Strategy 1: diff against origin/main (typical CI setup)
  let res = runCommandSafe("git", ["diff", "--name-only", "origin/main...HEAD"]);
  if (res.ok) {
    return {
      strategy: "origin/main...HEAD",
      files: res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      warnings,
    };
  }

  // Strategy 2: diff against origin/master
  res = runCommandSafe("git", ["diff", "--name-only", "origin/master...HEAD"]);
  if (res.ok) {
    return {
      strategy: "origin/master...HEAD",
      files: res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      warnings,
    };
  }

  // Strategy 3: diff against previous commit (good locally)
  res = runCommandSafe("git", ["diff", "--name-only", "HEAD~1", "HEAD"]);
  if (res.ok) {
    warnings.push({
      severity: "info",
      message: "Could not reach origin/main or origin/master; comparing against HEAD~1 instead.",
      recommendation: "In CI, ensure `fetch-depth: 0` so the remote main is available.",
    });
    return {
      strategy: "HEAD~1...HEAD",
      files: res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      warnings,
    };
  }

  // Strategy 4: unstaged + staged
  res = runCommandSafe("git", ["diff", "--name-only", "HEAD"]);
  if (res.ok) {
    warnings.push({
      severity: "info",
      message: "Falling back to local unstaged+staged diff vs HEAD.",
      recommendation: "Initial commit or shallow checkout. Changed-file precision is reduced.",
    });
    return {
      strategy: "HEAD",
      files: res.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean),
      warnings,
    };
  }

  warnings.push({
    severity: "warning",
    message: "Unable to determine changed files via git.",
    recommendation: "All source files will be treated as 'unchanged' for ratchet comparisons.",
  });
  return { strategy: "none", files: null, warnings };
}

function collectFileMetrics(config) {
  const filesCfg = (config && config.files) || {};
  const include = filesCfg.include || ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"];
  const exclude = filesCfg.exclude || ["node_modules/**", "dist/**", "build/**"];
  const warnLines = filesCfg.warnLines || 500;
  const maxLinesNewFile = filesCfg.maxLinesNewFile || 800;
  const maxLinesExistingFile = filesCfg.maxLinesExistingFile || 1200;

  const allFiles = walkFiles(REPO_ROOT, { include, exclude });
  const fileLineCounts = {};
  const oversizedFiles = [];
  const nearLimitFiles = [];
  const largestFiles = [];
  let maxLines = 0;

  for (const rel of allFiles) {
    const abs = path.join(REPO_ROOT, rel);
    const lines = countLines(abs);
    if (lines === null) continue;
    fileLineCounts[normalizePath(rel)] = lines;
    if (lines > maxLines) maxLines = lines;
    if (lines > maxLinesExistingFile) {
      oversizedFiles.push({ file: normalizePath(rel), lines, limit: maxLinesExistingFile });
    } else if (lines >= warnLines) {
      nearLimitFiles.push({ file: normalizePath(rel), lines, warnAt: warnLines });
    }
    largestFiles.push({ file: normalizePath(rel), lines });
  }

  largestFiles.sort((a, b) => b.lines - a.lines);

  const diffResult = getChangedFiles();
  const changedFiles = diffResult.files
    ? diffResult.files.map(normalizePath).filter((f) => fileLineCounts[f] !== undefined)
    : null;

  // Detect new files (changed and present, but absent from baseline-tracked set is
  // determined downstream in compare-baseline). Here we only flag obviously new files:
  // those listed by git as added.
  let addedFiles = [];
  if (dirExists(path.join(REPO_ROOT, ".git"))) {
    // git diff --diff-filter=A returns only added files vs the base ref.
    const refs = diffResult.strategy && diffResult.strategy !== "none" ? diffResult.strategy : null;
    if (refs && refs.includes("...")) {
      const [base, head] = refs.split("...");
      const res = runCommandSafe("git", ["diff", "--name-only", "--diff-filter=A", `${base}...${head}`]);
      if (res.ok) {
        addedFiles = res.stdout.split(/\r?\n/).map((s) => s.trim()).map(normalizePath).filter(Boolean);
      }
    }
  }

  return {
    available: true,
    totalFiles: allFiles.length,
    changedFiles,
    changedFilesStrategy: diffResult.strategy,
    addedFiles,
    largestFiles: largestFiles.slice(0, 25),
    oversizedFiles,
    nearLimitFiles,
    fileLineCounts,
    maxLines: maxLines || null,
    thresholds: {
      warnLines,
      maxLinesNewFile,
      maxLinesExistingFile,
    },
    warnings: diffResult.warnings,
  };
}

module.exports = {
  collectFileMetrics,
  getChangedFiles,
};
