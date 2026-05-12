#!/usr/bin/env node
// Render the PR comment file (reports/pr-comment.md) from the existing
// quality-gate.md, prepending the sticky-comment marker.
//
// Usage: node scripts/quality/render-pr-comment.js

const path = require("path");
const { fileExists, readText, writeText, REPO_ROOT } = require("./utils");

const MARKER = "<!-- quality-gate-comment -->";

function buildComment(markdownBody) {
  if (markdownBody.startsWith(MARKER)) return markdownBody;
  return `${MARKER}\n\n${markdownBody}`;
}

function main() {
  const mdPath = path.join(REPO_ROOT, "reports", "quality-gate.md");
  const outPath = path.join(REPO_ROOT, "reports", "pr-comment.md");
  if (!fileExists(mdPath)) {
    console.error(`render-pr-comment: ${mdPath} not found. Run \`npm run quality:report\` or \`npm run quality:check\` first.`);
    process.exit(1);
  }
  const body = readText(mdPath, "");
  const comment = buildComment(body);
  writeText(outPath, comment);
  console.log(`render-pr-comment: wrote ${outPath}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildComment, MARKER };
