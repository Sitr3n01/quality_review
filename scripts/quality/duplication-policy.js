// Duplication policy module.
//
// Two independent policies operate on duplication, mirroring the
// coverage-policy.js shape:
//
//   1. Ratchet  — current must not exceed baseline when allowIncrease is
//      false. Blocking by default.
//   2. Absolute maximum — current must stay at or below a recommended
//      maximum percentage. Opt-in; defaults to warning severity so legacy
//      projects can adopt the gate without first refactoring away
//      duplicated fragments.
//
// Backward compatibility: configs that still use `maxPercentage` (the
// legacy field that historically blocked) are interpreted as a warning
// maximum. Teams that want the old blocking behavior must opt in with
// `maximum: { enabled: true, severity: "blocking", percentage: N }`.

const EPSILON = 0.001;

function resolveDuplicationMaximumPolicy(cfg) {
  const explicit = cfg && cfg.maximum;

  if (explicit && typeof explicit === "object") {
    const percentage = typeof explicit.percentage === "number" ? explicit.percentage : null;
    return {
      enabled: explicit.enabled === true,
      severity: explicit.severity === "blocking" ? "blocking" : "warning",
      percentage,
    };
  }

  if (cfg && typeof cfg.maxPercentage === "number") {
    return {
      enabled: true,
      severity: "warning",
      percentage: cfg.maxPercentage,
      legacy: true,
    };
  }

  return {
    enabled: false,
    severity: "warning",
    percentage: null,
  };
}

function duplicationNoBaselineFinding(currentPercentage) {
  return {
    type: "duplication-no-baseline",
    severity: "warning",
    current: currentPercentage,
    message: `No duplication baseline; current is ${currentPercentage.toFixed(2)}%.`,
    recommendation: "Run `npm run quality:baseline` on main to lock in the current value.",
  };
}

function evaluateDuplicationMaximum(currentPercentage, maximum, out) {
  if (!maximum || maximum.enabled !== true) return;
  if (typeof maximum.percentage !== "number") return;
  if (currentPercentage === null || currentPercentage === undefined) return;
  if (currentPercentage <= maximum.percentage + EPSILON) return;

  const blocking = maximum.severity === "blocking";
  const finding = {
    type: "duplication-over-maximum",
    severity: blocking ? "blocking" : "warning",
    current: currentPercentage,
    maximum: maximum.percentage,
    message: blocking
      ? `Duplication is ${currentPercentage.toFixed(2)}%, above the blocking maximum of ${maximum.percentage.toFixed(2)}%.`
      : `Duplication is ${currentPercentage.toFixed(2)}%, above the recommended maximum of ${maximum.percentage.toFixed(2)}%.`,
    recommendation: blocking
      ? "Refactor duplicated fragments before merging or switch the maximum to warning for legacy adoption."
      : "Reduce duplication over time. This is advisory because duplication maximum is configured as warning.",
  };

  (blocking ? out.regressions : out.warnings).push(finding);
}

function evaluateDuplicationRatchet(currentPercentage, baselinePercentage, cfg, out) {
  if (currentPercentage === null || currentPercentage === undefined) return;
  if (baselinePercentage === null || baselinePercentage === undefined) return;

  const allowIncrease = cfg && cfg.allowIncrease === true;
  const delta = Math.round((currentPercentage - baselinePercentage) * 100) / 100;

  if (!allowIncrease && currentPercentage > baselinePercentage + EPSILON) {
    out.regressions.push({
      type: "duplication-increase",
      severity: "blocking",
      baseline: baselinePercentage,
      current: currentPercentage,
      delta,
      message: `Duplication increased from ${baselinePercentage.toFixed(2)}% to ${currentPercentage.toFixed(2)}%.`,
      recommendation: "Refactor the new duplicated fragments before merging.",
    });
    return;
  }

  if (currentPercentage < baselinePercentage - EPSILON) {
    out.infos.push({
      type: "duplication-improved",
      severity: "info",
      baseline: baselinePercentage,
      current: currentPercentage,
      delta,
      message: `Duplication improved from ${baselinePercentage.toFixed(2)}% to ${currentPercentage.toFixed(2)}%.`,
    });
  }
}

module.exports = {
  EPSILON,
  resolveDuplicationMaximumPolicy,
  duplicationNoBaselineFinding,
  evaluateDuplicationMaximum,
  evaluateDuplicationRatchet,
};
