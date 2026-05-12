#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

function collectTestFiles(root) {
  const absRoot = path.resolve(root);
  const files = [];

  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(abs);
      } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
        files.push(abs);
      }
    }
  }

  visit(absRoot);
  return files;
}

const roots = process.argv.slice(2);
const testFiles = roots.flatMap(collectTestFiles).sort();

if (testFiles.length === 0) {
  console.error("run-node-tests: no .test.js files found.");
  process.exitCode = 1;
} else {
  for (const file of testFiles) {
    require(file);
  }
}
