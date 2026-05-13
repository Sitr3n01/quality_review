const STATUS_PASS = "PASS";
const STATUS_FAIL = "FAIL";
const STATUS_WARN = "WARN";
const STATUS_SKIPPED = "SKIPPED";

function gateStatusLabel(internalStatus) {
  switch (internalStatus) {
    case "failed":
      return STATUS_FAIL;
    case "warning":
      return STATUS_WARN;
    case "passed":
      return STATUS_PASS;
    case "skipped":
      return STATUS_SKIPPED;
    default:
      return STATUS_SKIPPED;
  }
}

module.exports = {
  gateStatusLabel,
  STATUS_PASS,
  STATUS_FAIL,
  STATUS_WARN,
  STATUS_SKIPPED,
};
