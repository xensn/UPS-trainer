/**
 * fit.test.js — on computer screens at 100% zoom, every page and state fits
 * without scrolling; on phones there is no sideways scrolling.
 * Sizes are the browser area left after tabs, address bar and taskbar.
 */
"use strict";
const { SEG, makeReport, openTrainer, CHECK_STEPS } = require("./helpers");

const SIZES = [
  ["1280x720 laptop (150% scaling)", 1280, 560],
  ["1366x768 laptop", 1366, 610],
  ["1536x864 laptop (125% scaling)", 1536, 700],
  ["1440x900", 1440, 760],
  ["1920x1080 monitor", 1920, 930],
  ["2560x1440 monitor", 2560, 1290]
];

module.exports = async function run(browser) {
  const r = makeReport("Screen fit");
  for (const [label, width, height] of SIZES) {
    const t = await openTrainer(browser, { viewport: { width, height }, fakeClock: true });
    const over = [];
    const fits = async (name) => {
      const d = await t.page.evaluate(() => ({ y: document.documentElement.scrollHeight - innerHeight, x: document.documentElement.scrollWidth - innerWidth }));
      if (d.y > 0 || d.x > 0) over.push(`${name} (+${d.y}px)`);
    };
    await t.go(SEG.quiz); await fits("quiz locked");
    await t.go(SEG.maintenance); await fits("maintenance");
    for (const name of ["status", "endurance", "load", "bypass", "reset"]) {
      await t.go(SEG[name]); await fits(name + " start");
      await CHECK_STEPS[name](t); await fits(name + " complete");
    }
    await t.go(SEG.bypass); await t.press("power", "enter"); await fits("bypass step 2");
    await t.bench("mains", "0"); await fits("bypass step 3 (two-line step)");
    await t.go(SEG.endurance); await t.press("enter", "enter", "down", "down"); await fits("status tabs");
    for (const seg of [SEG.testMains, SEG.testUps]) {
      await t.go(seg); await fits("test brief");
      for (let attempt = 1; attempt <= 3; attempt++) {
        await t.page.click('[data-action="start-test"]'); await fits("test running");
        await t.wait(46000); await fits(`test failed x${attempt} (hints)`);
      }
    }
    // Quiz layouts: unlock through saved progress, then check every question with its explanation
    await t.page.evaluate(() => localStorage.setItem("gxt5-trainer-progress-v2",
      JSON.stringify({ done: ["maintenance", "status", "endurance", "load", "bypass", "reset", "test-mains", "test-ups"], quizScore: null })));
    await t.page.reload();
    await t.go(SEG.quiz);
    const answers = await t.page.evaluate(() => GXT5.content.QUIZ.map((q) => q.answer));
    for (let i = 0; i < answers.length; i++) {
      await fits(`quiz Q${i + 1}`);
      await t.page.click(`button[data-opt="${answers[i] === 0 ? 1 : 0}"]`);
      await fits(`quiz Q${i + 1} explanation`);
      await t.page.click('[data-action="next-question"]');
    }
    await fits("quiz failed (review list)");
    await t.page.evaluate(() => localStorage.setItem("gxt5-trainer-progress-v2",
      JSON.stringify({ done: ["maintenance", "status", "endurance", "load", "bypass", "reset", "test-mains", "test-ups", "quiz"], quizScore: 10 })));
    await t.page.reload();
    await t.go(SEG.quiz); await fits("completion page");
    r.check(`${label} (${width}x${height})`, over.length === 0, over.join(", "));
    await t.close();
  }
  for (const [w, h] of [[390, 844], [360, 740]]) {
    const t = await openTrainer(browser, { viewport: { width: w, height: h }, isMobile: true });
    let worst = 0;
    for (let i = 0; i < 9; i++) { await t.go(i); worst = Math.max(worst, await t.page.evaluate(() => document.documentElement.scrollWidth - innerWidth)); }
    r.check(`Phone ${w}px: no sideways scrolling`, worst <= 0, worst + "px");
    await t.close();
  }
  r.print();
  return r.failed;
};
