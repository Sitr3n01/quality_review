const FILE_CATEGORY_RULES = [
  { pattern: /^\.github\//, category: "infra" },
  { pattern: /^\.agent(s)?\//, category: "infra" },
  { pattern: /^scripts\/quality\//, category: "infra" },
  { pattern: /^quality\//, category: "config" },
  { pattern: /^tests?\//, category: "test" },
  { pattern: /\.test\.[a-z]+$/i, category: "test" },
  { pattern: /^docs?\//, category: "docs" },
  { pattern: /\.md$/i, category: "docs" },
  { pattern: /(^|\/)package(-lock)?\.json$/i, category: "config" },
  { pattern: /(^|\/)pnpm-lock\.yaml$/i, category: "config" },
  { pattern: /(^|\/)yarn\.lock$/i, category: "config" },
  { pattern: /^(src|lib|app|scripts)\//, category: "source" },
];

const HIGH_RISK_PATTERNS = [
  /\.github\/workflows\//i,
  /\.github\/actions\//i,
  /(^|\/)\.env(\.|$)/i,
  /(^|\/)secrets?(\/|\.)/i,
  /(^|\/)auth(\/|\.|z|n)/i,
  /(^|\/)payments?(\/|\.)/i,
  /(^|\/)credentials?(\/|\.)/i,
  /(^|\/)deploy(\/|\.)/i,
  /(^|\/)quality\/baseline\.json$/i,
  /(^|\/)quality\/quality-gate\.config\.cjs$/i,
];

const MEDIUM_RISK_PATTERNS = [
  /^scripts\//,
  /^src\//,
  /^lib\//,
  /^app\//,
];

function classifyFileCategory(file) {
  for (const rule of FILE_CATEGORY_RULES) {
    if (rule.pattern.test(file)) return rule.category;
  }
  return "unknown";
}

function hasHighRiskFile(files) {
  return files.some((file) => HIGH_RISK_PATTERNS.some((re) => re.test(file)));
}

function classifyFileRisk(file) {
  if (HIGH_RISK_PATTERNS.some((re) => re.test(file))) return "high";
  if (/^tests?\//.test(file) || /\.test\.[a-z]+$/i.test(file)) return "low";
  if (/\.md$/i.test(file) || /^docs?\//.test(file)) return "low";
  if (MEDIUM_RISK_PATTERNS.some((re) => re.test(file))) return "medium";
  return "unknown";
}

module.exports = {
  classifyFileCategory,
  classifyFileRisk,
  hasHighRiskFile,
  FILE_CATEGORY_RULES,
  HIGH_RISK_PATTERNS,
  MEDIUM_RISK_PATTERNS,
};
