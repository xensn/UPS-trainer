/**
 * scenarios.test.js — the two scenario tests: pass, every way to fail,
 * hints after repeated fails, and the quiz staying locked until both pass.
 * Uses a fake clock so the 45 s and 20 s limits can be fast-forwarded.
 */
"use strict";
const { SEG, makeReport, openTrainer, CHECK_STEPS, TEST_PASS } = require("./helpers");

module.exports = async function run(browser) {
  const r = makeReport("Scenario tests");
  const t = await openTrainer(browser, { fakeClock: true });
  const start = () => t.page.click('[data-action="start-test"]');

  /* ---- Mains failure test ---- */
  await t.go(SEG.testMains);
  r.check("Mains test: brief shown, no step instructions", !(await t.side()).includes("Step 1:"));
  await start();
  r.check("Mains test: unit on battery with alarm", (await t.lcd()).includes("ON BATTERY"));
  r.check("Mains test: no step instructions during the test", !(await t.side()).includes("Step 1:") && !(await t.side()).includes("Press"));

  // Fail 1: restore supply without checking backup time
  await t.bench("mains", "1");
  r.check("Mains test fail: restored without checking backup", (await t.side()).includes("without first checking"));
  r.check("1st fail: no hint yet", (await t.page.locator(".hint-card").count()) === 0);

  // Fail 2: switch the UPS off
  await start();
  await t.press("power", "enter");          // first option without mains is "Turn off UPS"
  r.check("Mains test fail: switched the UPS off", (await t.side()).includes("switched the UPS off"));
  r.check("2nd fail: tip and revisit links shown", (await t.page.locator(".hint-card").count()) === 1 && (await t.side()).includes("Revisit"));
  r.check("2nd fail: exact steps not shown yet", (await t.page.locator(".hint-steps").count()) === 0);

  // Fail 3: run out of time
  await start();
  await t.wait(46000);
  r.check("Mains test fail: battery ran out", (await t.side()).includes("battery ran out"));
  r.check("Timeout: panel shows Battery EOD", (await t.lcd()).includes("Battery EOD"));
  r.check("3rd fail: exact steps shown", (await t.page.locator(".hint-steps").count()) === 1);

  // Pass
  await TEST_PASS.mains(t);
  r.check("Mains test passes with the correct response", (await t.side()).includes("Test passed"));

  /* ---- UPS failure test ---- */
  await t.go(SEG.testUps);
  await start();
  r.check("UPS test: unit on battery with mains present", (await t.lcd()).includes("ON BATTERY"));
  await t.press("power", "down", "enter");  // Turn off UPS
  r.check("UPS test fail: switched off", (await t.side()).includes("switched the UPS off"));
  await start();
  await t.wait(21000);
  r.check("UPS test fail: battery ran out", (await t.side()).includes("battery ran out"));
  await TEST_PASS.ups(t);
  r.check("UPS test passes by transferring to bypass", (await t.side()).includes("Test passed"));
  await t.close();

  /* ---- Quiz needs both tests passed ---- */
  const q = await openTrainer(browser, { fakeClock: true });
  await q.go(SEG.maintenance);
  for (const name of ["status", "endurance", "load", "bypass", "reset"]) { await q.go(SEG[name]); await CHECK_STEPS[name](q); }
  await q.go(SEG.testMains); await TEST_PASS.mains(q);
  await q.go(SEG.quiz);
  r.check("Quiz still locked with only one test passed", (await q.quizText()).includes("Quiz is locked"));
  await q.go(SEG.testUps); await TEST_PASS.ups(q);
  await q.go(SEG.quiz);
  r.check("Quiz unlocks once both tests are passed", !(await q.quizText()).includes("Quiz is locked"));

  r.check("No page errors", t.errors.length === 0 && q.errors.length === 0, t.errors.concat(q.errors).join(" | "));
  await q.close();
  r.print();
  return r.failed;
};
