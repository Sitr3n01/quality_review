// Render the optional rich HTML report: .quality-gate/HUMAN_REPORT.html.
//
// Requirements:
//   - Self-contained: no external scripts, fonts, styles, or images.
//   - Safe to open locally without internet.
//   - No JavaScript (the prompt allows minimal JS, but we choose none).
//   - All user-controlled strings (file paths, messages) must be escaped to
//     prevent HTML/XSS injection from a malicious PR.
//   - Statuses use the human vocabulary (blocker / warning / info); the
//     machine PASS / FAIL / WARN / SKIPPED contract lives in QUALITY_GATE.md.

const {
  gateStatusLabel,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
} = require("./report-status");
const { CHECK_DEFINITIONS, deriveCheckStatusForCheck } = require("./check-registry");
const { classifyFileCategory, classifyFileRisk } = require("./file-risk");

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusBadgeClass(status) {
  switch (status) {
    case STATUS_PASS:
      return "badge badge-pass";
    case STATUS_FAIL:
      return "badge badge-fail";
    case STATUS_WARN:
      return "badge badge-warn";
    case STATUS_SKIPPED:
    default:
      return "badge badge-skipped";
  }
}

function severityFromFinding(finding) {
  const severity = (finding && finding.severity) || "warning";
  if (severity === "blocking") return "blocker";
  if (severity === "info") return "info";
  return "warning";
}

const INLINE_CSS = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  background: #fafafa;
  color: #1c1c1c;
  line-height: 1.5;
}
@media (prefers-color-scheme: dark) {
  body { background: #161618; color: #e6e6e6; }
  table { border-color: #303034 !important; }
  th { background: #202024 !important; }
  td, th { border-color: #303034 !important; }
  section { background: #1f1f22 !important; box-shadow: none !important; }
  code { background: #202024 !important; }
}
main { max-width: 1100px; margin: 0 auto; padding: 24px 20px 64px; }
header h1 { margin: 0 0 4px; font-size: 1.6rem; }
header .meta { display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 0.9rem; margin-bottom: 18px; }
header .meta span code { font-size: 0.8rem; }
section { background: #fff; border-radius: 10px; padding: 18px 22px; margin-bottom: 18px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
h2 { margin: 0 0 12px; font-size: 1.15rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin: 8px 0; }
.card { border: 1px solid #e3e3e6; border-radius: 8px; padding: 12px 14px; }
.card .label { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.05em; color: #6b6b70; }
.card .value { font-size: 1.4rem; font-weight: 600; margin-top: 4px; }
table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e3e3e6; vertical-align: top; }
th { background: #f3f3f4; font-weight: 600; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.78rem; font-weight: 600; letter-spacing: 0.04em; }
.badge-pass { background: #d8f5dd; color: #1a6b2a; }
.badge-fail { background: #fcdada; color: #8a1212; }
.badge-warn { background: #fdebc6; color: #7a4a05; }
.badge-skipped { background: #e6e6ea; color: #4a4a4f; }
.severity-blocker { color: #8a1212; font-weight: 600; }
.severity-warning { color: #7a4a05; font-weight: 600; }
.severity-info { color: #2a4a8a; font-weight: 600; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f3f3f4; padding: 1px 4px; border-radius: 4px; font-size: 0.88rem; }
footer { margin-top: 24px; font-size: 0.82rem; color: #6b6b70; }
.empty { color: #6b6b70; font-style: italic; }
`;

function inlineCss() {
  return INLINE_CSS;
}

function buildHeader(meta) {
  return `
<header>
  <h1>Quality Gate Report</h1>
  <div class="meta">
    <span><strong>Status:</strong> <span class="${statusBadgeClass(meta.gateStatus)}">${escapeHtml(meta.gateStatus)}</span></span>
    <span><strong>Generated:</strong> <code>${escapeHtml(meta.generatedAt)}</code></span>
    <span><strong>Commit:</strong> <code>${escapeHtml(meta.commitSha || "unknown")}</code></span>
    <span><strong>Branch:</strong> <code>${escapeHtml(meta.branch || "unknown")}</code></span>
    <span><strong>PR:</strong> <code>${escapeHtml(meta.prNumber || "none")}</code></span>
  </div>
</header>
`;
}

function buildExecutiveSummary(meta, report) {
  return `
<section>
  <h2>Executive Summary</h2>
  <div class="cards">
    <div class="card"><div class="label">Gate Status</div><div class="value">${escapeHtml(meta.gateStatus)}</div></div>
    <div class="card"><div class="label">Blocking Failures</div><div class="value">${escapeHtml(meta.blocking)}</div></div>
    <div class="card"><div class="label">Warnings</div><div class="value">${escapeHtml(meta.warnings)}</div></div>
    <div class="card"><div class="label">Infos</div><div class="value">${escapeHtml((report.summary && report.summary.infos) || 0)}</div></div>
  </div>
</section>
`;
}

function buildCheckMatrix(report) {
  const rows = CHECK_DEFINITIONS.map((c) => {
    const status = deriveCheckStatusForCheck(report, c);
    const reason = c.alwaysSkipped ? c.humanSkipReason || "" : "";
    return `<tr>
      <td><code>${escapeHtml(c.id)}</code></td>
      <td>${escapeHtml(c.humanName || c.name)}</td>
      <td><span class="${statusBadgeClass(status)}">${escapeHtml(status)}</span></td>
      <td>${escapeHtml(reason)}</td>
    </tr>`;
  }).join("\n");

  return `
<section>
  <h2>Gate Checks</h2>
  <table>
    <thead>
      <tr><th>Check ID</th><th>Name</th><th>Status</th><th>Note</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>
`;
}

function buildFindingTable(title, findings, emptyMessage) {
  if (!findings || findings.length === 0) {
    return `
<section>
  <h2>${escapeHtml(title)}</h2>
  <p class="empty">${escapeHtml(emptyMessage)}</p>
</section>
`;
  }
  const rows = findings.map((f) => {
    const severity = severityFromFinding(f);
    return `<tr>
      <td><code>${escapeHtml(f.type || "-")}</code></td>
      <td><span class="severity-${severity}">${escapeHtml(severity)}</span></td>
      <td>${escapeHtml(f.message || "")}</td>
      <td>${escapeHtml(f.recommendation || "")}</td>
    </tr>`;
  }).join("\n");
  return `
<section>
  <h2>${escapeHtml(title)}</h2>
  <table>
    <thead>
      <tr><th>Type</th><th>Severity</th><th>Message</th><th>Recommendation</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
</section>
`;
}

function buildChangedFiles(report) {
  const files = ((report.current || {}).files || {}).changedFiles || [];
  if (files.length === 0) {
    return `
<section>
  <h2>Changed Files and Risk</h2>
  <p class="empty">No changed files were reported for this run.</p>
</section>
`;
  }
  const rows = files.slice(0, 50).map((f) => {
    return `<tr>
      <td><code>${escapeHtml(f)}</code></td>
      <td>${escapeHtml(classifyFileCategory(f))}</td>
      <td>${escapeHtml(classifyFileRisk(f))}</td>
    </tr>`;
  }).join("\n");
  const overflow = files.length > 50 ? `<p class="empty">Showing first 50 of ${files.length} files.</p>` : "";
  return `
<section>
  <h2>Changed Files and Risk</h2>
  <table>
    <thead>
      <tr><th>File</th><th>Category</th><th>Risk</th></tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
  </table>
  ${overflow}
</section>
`;
}

function buildFixPlan(report) {
  const recs = Array.isArray(report.recommendations) ? report.recommendations.slice(0, 8) : [];
  if (recs.length === 0) {
    return `
<section>
  <h2>Suggested Fix Plan</h2>
  <p class="empty">No actionable recommendations were extracted from this run.</p>
</section>
`;
  }
  const items = recs.map((r) => `<li>${escapeHtml(r)}</li>`).join("\n");
  return `
<section>
  <h2>Suggested Fix Plan</h2>
  <ol>${items}</ol>
</section>
`;
}

function buildEvidence(options) {
  const outDir = options.outDir || ".quality-gate";
  return `
<section>
  <h2>Evidence</h2>
  <ul>
    <li>Machine Markdown report: <code>${escapeHtml(outDir + "/QUALITY_GATE.md")}</code></li>
    <li>Human summary: <code>${escapeHtml(outDir + "/HUMAN_SUMMARY.md")}</code></li>
    <li>Log files: <code>${escapeHtml(outDir + "/logs/")}</code></li>
    <li>Original JSON report: <code>reports/quality-gate.json</code></li>
  </ul>
  <p class="empty">The deterministic checks decide pass/fail. AI is advisory only.</p>
</section>
`;
}

function renderHumanHtml(report, options = {}) {
  const meta = {
    gateStatus: gateStatusLabel(report.status),
    generatedAt: report.generatedAt || new Date().toISOString(),
    commitSha: options.commitSha || "unknown",
    branch: options.branch || "unknown",
    prNumber: options.prNumber || "none",
    blocking: (report.summary && report.summary.blocking) || 0,
    warnings: (report.summary && report.summary.warnings) || 0,
  };

  const body = [
    buildHeader(meta),
    buildExecutiveSummary(meta, report),
    buildCheckMatrix(report),
    buildFindingTable("Blocking Failures", report.regressions, "No blocking failures."),
    buildFindingTable("Warnings", report.warnings, "No warnings."),
    buildChangedFiles(report),
    buildFixPlan(report),
    buildEvidence(options),
  ].join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Quality Gate Report</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${inlineCss()}</style>
</head>
<body>
<main>
${body}
<footer>Generated by the Quality Gate hybrid reporter. Deterministic checks decide pass/fail; AI is advisory only.</footer>
</main>
</body>
</html>
`;
}

module.exports = {
  renderHumanHtml,
  escapeHtml,
  severityFromFinding,
};
