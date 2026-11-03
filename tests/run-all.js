/**
 * run-all.js — runs every automated test and prints a summary.
 * Usage (from the project folder):  npm test   or   node tests/run-all.js
 */
"use strict";
const { chromium } = require("playwright");

const SUITES = [
  ["walkthrough", require("./walkthrough.test")],
  ["scenarios", require("./scenarios.test")],
  ["quiz", require("./quiz.test")],
  ["sound", require("./sound.test")],
  ["security", require("./security.test")],
  ["fit", require("./fit.test")]
];

(async () => {
  const only = process.argv[2];
  const browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  let failed = 0;
  for (const [name, suite] of SUITES) {
    if (only && only !== name) continue;
    try { failed += await suite(browser); }
    catch (e) { failed++; console.log(`\n== ${name} ==\nFAIL  crashed: ${e.message}`); }
  }
  await browser.close();
  console.log(failed === 0 ? "\nAll tests passed." : `\n${failed} check(s) failed.`);
  process.exit(failed === 0 ? 0 : 1);
})();
