/**
 * quiz.test.js — quiz lock, failing (review + retry), passing (completion page, no retry)
 */
"use strict";
const { SEG, makeReport, openTrainer, CHECK_STEPS, TEST_PASS } = require("./helpers");

module.exports = async function run(browser) {
  const r = makeReport("Quiz");
  const t = await openTrainer(browser, { fakeClock: true });

  await t.go(SEG.quiz);
  r.check("Quiz locked on a fresh visit", (await t.quizText()).includes("Quiz is locked"));

  // Finish everything
  await t.go(SEG.maintenance);
  for (const name of ["status", "endurance", "load", "bypass", "reset"]) { await t.go(SEG[name]); await CHECK_STEPS[name](t); }
  await t.go(SEG.testMains); await TEST_PASS.mains(t);
  await t.go(SEG.testUps); await TEST_PASS.ups(t);

  const answers = await t.page.evaluate(() => GXT5.content.QUIZ.map((q) => q.answer));
  const answerAll = async (pick) => {
    for (let i = 0; i < answers.length; i++) {
      await t.page.click(`button[data-opt="${pick(answers[i], i)}"]`);
      await t.page.click('[data-action="next-question"]');
    }
  };

  // Fail: all wrong
  await t.go(SEG.quiz);
  await answerAll((a) => (a === 0 ? 1 : 0));
  const failText = await t.quizText();
  r.check("Fail: shows Not yet", failText.includes("Not yet"));
  r.check("Fail: suggests segments to review", (await t.page.locator("#quizPane .link-btn").count()) > 0);
  r.check("Fail: offers a retry", (await t.page.locator('[data-action="retry-quiz"]').count()) === 1);

  // Pass: retry and answer correctly
  await t.page.click('[data-action="retry-quiz"]');
  await answerAll((a) => a);
  const passText = await t.quizText();
  r.check("Pass: shows the thank-you completion page", passText.includes("Thank you for completing"));
  r.check("Pass: no retry button", (await t.page.locator('[data-action="retry-quiz"]').count()) === 0);
  r.check("Pass: shows the score", passText.includes("10 / 10"));

  // Coming back to the quiz after passing shows the completion page again
  await t.go(SEG.status);
  await t.go(SEG.quiz);
  r.check("Revisit after passing: completion page, not a new attempt", (await t.quizText()).includes("Thank you for completing"));

  // Progress survives a reload (saved in the browser)
  await t.page.reload();
  await t.go(SEG.quiz);
  r.check("Progress kept after reload", (await t.quizText()).includes("Thank you for completing"));

  r.check("No page errors", t.errors.length === 0, t.errors.join(" | "));
  await t.close();
  r.print();
  return r.failed;
};
