// Heuristic complexity collector.
//
// IMPORTANT: This is a first-pass heuristic, not a real AST analyzer.
// Every result is marked heuristicOnly: true. The aim is to provide a
// signal in the quality report without requiring a parser dependency.
//
// Future work documented in references/unity-extension.md and
// references/quality-rules.md should swap this for ESLint complexity,
// SonarQube, Roslyn, etc. The output shape is stable, so consumers
// (compare-baseline.js, render-markdown.js) won't need to change.

const fs = require("fs");
const path = require("path");
const { REPO_ROOT, walkFiles, normalizePath, fileExists, readJson } = require("./utils");

function countMaxBraceDepth(text) {
  let depth = 0;
  let max = 0;
  let inString = null;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    const next = text[i + 1];
    if (inLineComment) {
      if (c === "\n") inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === inString) inString = null;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 1;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      continue;
    }
    if (c === "{") {
      depth += 1;
      if (depth > max) max = depth;
    } else if (c === "}") {
      depth -= 1;
    }
  }
  return max;
}

// Detect rough function blocks and count branching tokens inside each.
// This intentionally misses many real cases (nested arrow returns,
// generators with weird signatures, etc). It's a signal, not a proof.
function analyzeFunctions(text, opts) {
  const maxFunctionLines = opts.maxFunctionLines || 80;
  const maxCyclomaticComplexity = opts.maxCyclomaticComplexity || 10;

  const longFunctions = [];
  const complexFunctions = [];

  const funcStartPattern = /(?:\bfunction\b\s*[A-Za-z0-9_$]*\s*\([^)]*\)|\b[A-Za-z0-9_$]+\s*\([^)]*\)\s*=>|\b[A-Za-z0-9_$]+\s*\([^)]*\))\s*\{/g;

  const matches = Array.from(text.matchAll(funcStartPattern));
  for (const match of matches) {
    const startIdx = match.index + match[0].lastIndexOf("{");
    let depth = 1;
    let i = startIdx + 1;
    while (i < text.length && depth > 0) {
      const c = text[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      i += 1;
    }
    if (depth !== 0) break;
    const body = text.slice(startIdx, i);
    const startLine = text.slice(0, match.index).split(/\r?\n/).length;
    const bodyLines = body.split(/\r?\n/).length;
    const nameMatch = match[0].match(/[A-Za-z0-9_$]+/);
    const name = nameMatch ? nameMatch[0] : "anonymous";

    if (bodyLines > maxFunctionLines) {
      longFunctions.push({ name, startLine, lines: bodyLines, limit: maxFunctionLines });
    }

    const branchTokens = [
      /\bif\b/g,
      /\belse\s+if\b/g,
      /\bfor\b/g,
      /\bwhile\b/g,
      /\bcase\b/g,
      /\bcatch\b/g,
      /&&/g,
      /\|\|/g,
      /\?[^.]/g,
    ];
    let complexity = 1;
    for (const re of branchTokens) {
      const m = body.match(re);
      if (m) complexity += m.length;
    }
    if (complexity > maxCyclomaticComplexity) {
      complexFunctions.push({ name, startLine, complexity, limit: maxCyclomaticComplexity });
    }
  }

  return { longFunctions, complexFunctions };
}

function extractFromEslintReport(json) {
  if (!Array.isArray(json)) return null;

  let maxDepthViolations = 0;
  let complexityViolations = 0;
  let longFunctionViolations = 0;
  const details = [];

  for (const entry of json) {
    if (!entry || typeof entry !== "object" || !Array.isArray(entry.messages)) continue;
    const file = entry.filePath ? normalizePath(path.relative(REPO_ROOT, entry.filePath)) : "unknown";
    for (const msg of entry.messages) {
      if (!msg || !msg.ruleId) continue;
      const base = {
        file,
        ruleId: msg.ruleId,
        message: msg.message,
        startLine: msg.line || null,
      };
      if (msg.ruleId === "max-depth") {
        maxDepthViolations += 1;
        details.push({ ...base, type: "depth" });
      } else if (msg.ruleId === "complexity") {
        complexityViolations += 1;
        details.push({ ...base, type: "complexity" });
      } else if (msg.ruleId === "max-lines-per-function") {
        longFunctionViolations += 1;
        details.push({ ...base, type: "long-function" });
      }
    }
  }

  return {
    heuristicOnly: false,
    maxDepthViolations,
    complexityViolations,
    longFunctionViolations,
    details: details.slice(0, 50),
    source: null,
    warnings: [],
  };
}

function collectHeuristicComplexity(config) {
  const filesCfg = (config && config.files) || {};
  const complexityCfg = (config && config.complexity) || {};
  const include = filesCfg.include || ["src/**/*.js", "src/**/*.jsx", "src/**/*.ts", "src/**/*.tsx"];
  const exclude = filesCfg.exclude || ["node_modules/**", "dist/**", "build/**"];

  const maxDepth = complexityCfg.maxDepth || 4;
  const maxFunctionLines = complexityCfg.maxFunctionLines || 80;
  const maxCyclomaticComplexity = complexityCfg.maxCyclomaticComplexity || 10;

  const all = walkFiles(REPO_ROOT, { include, exclude });
  let maxDepthViolations = 0;
  let complexityViolations = 0;
  let longFunctionViolations = 0;
  const details = [];

  for (const rel of all) {
    const abs = path.join(REPO_ROOT, rel);
    let text;
    try {
      text = fs.readFileSync(abs, "utf8");
    } catch (_err) {
      continue;
    }
    const depth = countMaxBraceDepth(text);
    const fnInfo = analyzeFunctions(text, { maxFunctionLines, maxCyclomaticComplexity });
    if (depth > maxDepth) {
      maxDepthViolations += 1;
      details.push({
        file: normalizePath(rel),
        type: "depth",
        depth,
        limit: maxDepth,
      });
    }
    for (const f of fnInfo.longFunctions) {
      longFunctionViolations += 1;
      details.push({
        file: normalizePath(rel),
        type: "long-function",
        name: f.name,
        startLine: f.startLine,
        lines: f.lines,
        limit: f.limit,
      });
    }
    for (const f of fnInfo.complexFunctions) {
      complexityViolations += 1;
      details.push({
        file: normalizePath(rel),
        type: "complexity",
        name: f.name,
        startLine: f.startLine,
        complexity: f.complexity,
        limit: f.limit,
      });
    }
  }

  return {
    heuristicOnly: true,
    maxDepthViolations,
    complexityViolations,
    longFunctionViolations,
    details: details.slice(0, 50),
    warnings: [
      {
        severity: "warning",
        message: "Complexity analysis is heuristic in this first version.",
        recommendation:
          "Adopt a real analyzer (ESLint complexity rule, SonarQube, Roslyn for C#) when ready.",
      },
    ],
  };
}

function collectComplexity(config) {
  const complexityCfg = (config && config.complexity) || {};
  const rel = complexityCfg.eslintJsonPath || "reports/complexity/eslint-complexity.json";
  const abs = path.join(REPO_ROOT, rel);

  if (fileExists(abs)) {
    const json = readJson(abs, null);
    const extracted = extractFromEslintReport(json);
    if (extracted) {
      extracted.source = rel;
      return extracted;
    }
    if (complexityCfg.heuristicFallback === false) {
      return {
        heuristicOnly: false,
        maxDepthViolations: null,
        complexityViolations: null,
        longFunctionViolations: null,
        details: [],
        source: rel,
        warnings: [
          {
            severity: "warning",
            message: `Complexity report ${rel} has an unrecognized shape.`,
            recommendation: "Regenerate with `npm run complexity:ci`.",
          },
        ],
      };
    }
  }

  if (complexityCfg.heuristicFallback === false) {
    return {
      heuristicOnly: false,
      maxDepthViolations: null,
      complexityViolations: null,
      longFunctionViolations: null,
      details: [],
      source: null,
      warnings: [
        {
          severity: "warning",
          message: `Complexity report not found at ${rel}.`,
          recommendation: "Run `npm run complexity:ci` before the gate.",
        },
      ],
    };
  }

  return collectHeuristicComplexity(config);
}

module.exports = {
  collectComplexity,
  collectHeuristicComplexity,
  extractFromEslintReport,
  countMaxBraceDepth,
  analyzeFunctions,
};
