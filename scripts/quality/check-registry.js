const path = require("path");
const {
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("./report-status");

const CHECK_DEFINITIONS = [
  {
    id: "build",
    name: "Build",
    blocking: true,
    section: null,
    evidence: "logs/build.log",
    alwaysSkipped: true,
    skipReason: "Build step is owned by the host project's CI; this template runs no build.",
    humanSkipReason: "No build wired in this template; the host project owns build.",
  },
  {
    id: "tests",
    name: "Tests",
    blocking: true,
    section: "tests",
    evidence: "logs/tests.log",
  },
  {
    id: "lint",
    name: "Lint",
    blocking: true,
    section: "eslint",
    evidence: "logs/lint.log",
  },
  {
    id: "typecheck",
    name: "Type Check",
    blocking: true,
    section: null,
    evidence: "logs/typecheck.log",
    alwaysSkipped: true,
    skipReason: "Type-check is configured per project; no tsc/mypy task is wired in this template.",
    humanSkipReason: "No tsc/mypy task configured.",
  },
  {
    id: "security",
    name: "Security Audit",
    blocking: true,
    section: "audit",
    evidence: "logs/security.log",
    humanName: "Security",
  },
  {
    id: "coverage",
    name: "Coverage",
    blocking: true,
    section: "coverage",
    evidence: "logs/coverage.log",
  },
  {
    id: "duplication",
    name: "Duplication",
    blocking: true,
    section: "duplication",
    evidence: "logs/duplication.log",
  },
  {
    id: "files",
    name: "File Size",
    blocking: true,
    section: "files",
    evidence: "logs/files.log",
  },
  {
    id: "complexity",
    name: "Complexity",
    blocking: true,
    section: "complexity",
    evidence: "logs/complexity.log",
  },
];

const SECTION_TYPE_PREFIX = {
  coverage: ["coverage"],
  audit: ["audit"],
  eslint: ["lint"],
  duplication: ["duplication"],
  files: ["oversized", "new-file-oversized", "file-near-limit", "files"],
  complexity: ["complexity"],
};

function typeMatchesSection(type, section) {
  if (!type) return false;
  const prefixes = SECTION_TYPE_PREFIX[section] || [section];
  return prefixes.some((p) => type === p || type.startsWith(`${p}-`));
}

function deriveCheckStatus(report, section) {
  if (!section) return STATUS_SKIPPED;
  const current = (report.current || {})[section];
  if (current && current.available === false) return STATUS_SKIPPED;
  const regressions = report.regressions || [];
  const warnings = report.warnings || [];
  if (regressions.some((r) => typeMatchesSection(r.type, section))) return STATUS_FAIL;
  if (warnings.some((w) => typeMatchesSection(w.type, section))) return STATUS_WARN;
  return STATUS_PASS;
}

function deriveCheckStatusForCheck(report, check) {
  if (!check || check.alwaysSkipped) return STATUS_SKIPPED;
  return deriveCheckStatus(report, check.section);
}

function checkLogFile(check) {
  return path.posix.basename(check.evidence);
}

function evidencePath(check, evidenceRoot = ".quality-gate") {
  return evidenceRoot ? path.posix.join(evidenceRoot, check.evidence) : check.evidence;
}

function buildChecks(report, options = {}) {
  const evidenceRoot = options.evidenceRoot === undefined ? ".quality-gate" : options.evidenceRoot;
  return CHECK_DEFINITIONS.map((def) => ({
    id: def.id,
    name: def.name,
    blocking: def.blocking,
    evidence: evidencePath(def, evidenceRoot),
    status: deriveCheckStatusForCheck(report, def),
    skipReason: def.skipReason || null,
    section: def.section,
  }));
}

function checkIdForType(type) {
  if (!type) return "-";
  for (const check of CHECK_DEFINITIONS) {
    if (!check.section) continue;
    if (typeMatchesSection(type, check.section)) return check.id;
  }
  return "-";
}

function evidenceForCheck(id, checks) {
  const found = checks.find((check) => check.id === id);
  return found ? found.evidence : "logs/";
}

module.exports = {
  CHECK_DEFINITIONS,
  SECTION_TYPE_PREFIX,
  buildChecks,
  checkIdForType,
  checkLogFile,
  deriveCheckStatus,
  deriveCheckStatusForCheck,
  evidenceForCheck,
  evidencePath,
  typeMatchesSection,
};
