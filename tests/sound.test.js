/**
 * sound.test.js — the alarm sounds where it should, and is silent where it should be.
 * Counts beeps over 2.2 s of (fake) time: slow pattern = about 2, fast = about 4.
 */
"use strict";
const { SEG, makeReport, openTrainer } = require("./helpers");

module.exports = async function run(browser) {
  const r = makeReport("Sound");
  const t = await openTrainer(browser, { fakeClock: true });
  const beepsOver = async (ms = 2200) => {
    const before = await t.page.evaluate(() => GXT5.audio.beepCount());
    await t.wait(ms);
    return (await t.page.evaluate(() => GXT5.audio.beepCount())) - before;
  };
  const slow = (n) => n >= 2 && n <= 3, fast = (n) => n >= 4, silent = (n) => n === 0;
  let n;

  r.check("Sound is on by default", (await t.page.textContent("#soundBtn")) === "Sound on");
  await t.go(SEG.maintenance);
  r.check("Maintenance: silent", silent(await beepsOver()));

  await t.go(SEG.status);
  n = await beepsOver(); r.check("Status: on-battery alarm (slow)", slow(n), n + " beeps");
  await t.press("enter", "esc");
  n = await beepsOver(); r.check("Menu navigation does not silence", slow(n), n + " beeps");
  await t.press("esc");
  n = await beepsOver(); r.check("ESC on home screen silences", silent(n), n + " beeps");
  await t.bench("mains", "1");
  r.check("Normal running: silent", silent(await beepsOver()));

  await t.go(SEG.load);
  for (let i = 0; i < 3; i++) await t.bench("load", "1");
  n = await beepsOver(); r.check("Overload alarm (fast)", fast(n), n + " beeps");

  await t.go(SEG.bypass);
  await t.press("power", "enter");
  n = await beepsOver(); r.check("Bypass alarm (slow)", slow(n), n + " beeps");
  await t.press("esc");
  await t.bench("mains", "0");
  n = await beepsOver(); r.check("New alarm (no output) re-sounds after silencing", fast(n), n + " beeps");

  await t.go(SEG.reset);
  n = await beepsOver(); r.check("Fault alarm (fast)", fast(n), n + " beeps");

  await t.go(SEG.testMains);
  r.check("Scenario test: silent before Start", silent(await beepsOver()));
  await t.page.click('[data-action="start-test"]');
  n = await beepsOver(); r.check("Scenario test: alarm sounds on start", slow(n), n + " beeps");
  await t.wait(46000);
  n = await beepsOver(); r.check("Scenario test failed: Battery EOD alarm (fast)", fast(n), n + " beeps");
  await t.press("esc");
  r.check("ESC silences after a test ends", silent(await beepsOver()));

  await t.go(SEG.quiz);
  r.check("Quiz: silent", silent(await beepsOver()));
  await t.go(SEG.reset);
  await t.page.click("#soundBtn");
  r.check("Sound off: no beeps", silent(await beepsOver()));
  await t.page.click("#soundBtn");
  n = await beepsOver(); r.check("Sound back on: alarm resumes", fast(n), n + " beeps");

  r.check("No page errors", t.errors.length === 0, t.errors.join(" | "));
  await t.close();
  r.print();
  return r.failed;
};
