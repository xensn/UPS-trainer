/**
 * walkthrough.test.js — the five guided checks, the display and the bench
 */
"use strict";
const { SEG, makeReport, openTrainer, CHECK_STEPS } = require("./helpers");

module.exports = async function run(browser) {
  const r = makeReport("Walkthrough: checks, display, bench");
  const t = await openTrainer(browser);

  // Maintenance page
  await t.go(SEG.maintenance);
  r.check("Maintenance page shows the serviceability sequence", (await t.page.textContent("#infoPane")).includes("serviceability sequence"));

  // Each check completes using only the panel and the bench
  for (const name of ["status", "endurance", "load", "bypass", "reset"]) {
    await t.go(SEG[name]);
    await CHECK_STEPS[name](t);
    r.check(`${name} check completes`, (await t.taskHeading()) === "Check complete");
  }

  // Restart button: visible size and it works
  await t.go(SEG.bypass);
  const restart = t.page.locator('[data-action="restart"]');
  const box = await restart.boundingBox();
  r.check("Restart button is a full-size button", box && box.height >= 38 && box.width >= 150, box ? `${Math.round(box.width)}x${Math.round(box.height)}px` : "missing");
  await t.press("power", "enter");
  await restart.click();
  r.check("Restart returns the check to step 1", (await t.page.textContent("#sideTop")).includes("Step 1:"));

  // Display cues
  await t.press("enter", "enter", "down", "down");
  r.check("Status screen shows a tab strip with Battery highlighted", (await t.page.textContent(".lcd-tabs span.on")) === "Battery");
  r.check("Status screen shows the UP / DOWN cue", (await t.lcd()).includes("UP / DOWN: change tab"));

  // Power-path diagram: only the lines actually carrying power are coloured
  await t.go(SEG.bypass);
  const liveCount = () => t.page.locator(".flow .seg.live, .flow .seg.livewarn").count();
  r.check("Normal: 2 lines live (mains to UPS, UPS to load)", (await liveCount()) === 2);
  await t.press("power", "enter");
  const bypassLive = await t.page.locator(".flow path.seg.live").count();
  r.check("Bypass: only the bypass arc is lit green", (await liveCount()) === 1 && bypassLive === 1);
  await t.bench("mains", "0");
  r.check("No output: no lines live", (await liveCount()) === 0);
  await t.go(SEG.endurance);
  await t.press("enter", "down", "down", "enter", "enter");
  r.check("Battery: 2 lines live (battery to UPS, UPS to load)", (await liveCount()) === 2);
  await t.go(SEG.reset);
  await t.press("enter", "down", "down", "enter", "down", "enter"); // Clear faults is refused, fault stays
  await t.press("esc");                                       // back to the home screen
  r.check("Fault: no lines live (the fault screen replaces the diagram)", (await liveCount()) === 0);
  await t.go(SEG.testUps);
  await t.page.click('[data-action="start-test"]');
  r.check("UPS failure on battery: mains box shown as available, mains line not live",
    (await t.page.locator('.flow line.seg:not(.live)').count()) >= 1 && (await liveCount()) === 2);

  // Load cap: + stops working once over 100%
  await t.go(SEG.load);
  for (let i = 0; i < 3; i++) await t.bench("load", "1");
  const plus = t.page.locator('button[data-bench="load"][data-val="1"]');
  r.check("Load: + button disabled once overloaded", await plus.isDisabled());
  r.check("Load: stops at 120%", (await t.lcd()).includes("120%"));

  // Mains failure: POWER dialog does not offer bypass without mains (as in the manual)
  await t.go(SEG.status);
  await t.press("power");
  const dialog = await t.lcd();
  r.check("No mains: POWER dialog does not offer bypass", !dialog.includes("Turn ON to bypass") && dialog.includes("Turn off UPS"));

  r.check("No page errors", t.errors.length === 0, t.errors.join(" | "));
  // Inspection procedure screens
  await t.go(SEG.endurance);
  r.check("Home page shows the estimated battery runtime on mains", (await t.lcd()).includes("Est. battery runtime"));
  await t.press("enter");
  r.check("Main menu has the six items", (await t.page.locator(".lcd-grid span").count()) === 6);
  r.check("Main menu top bar shows ECO indicator and temperature", (await t.lcd()).includes("ECO") && (await t.lcd()).includes("25.4"));
  await t.press("down", "down", "down", "down", "enter", "down", "down");
  r.check("About > Battery age shows SOH", (await t.lcd()).includes("SOH") && (await t.lcd()).includes("96"));
  await t.press("esc", "down", "enter");
  r.check("Maintenance screen is restricted", (await t.lcd()).includes("Restricted"));
  await t.press("esc", "down", "enter", "up");
  const loadRows = await t.page.$$eval(".lcd-row .k", (els) => els.map((e) => e.textContent));
  r.check("Load tab fields in manual order", loadRows.join("|") === "Sout (kVA)|Pout (kW)|Power factor|Load percent (%)", loadRows.join("|"));
  await t.go(SEG.reset);
  await t.press("enter", "down", "down", "enter", "down", "enter");
  await t.bench("cooling", "1");
  await t.press("esc", "enter", "down", "down", "enter", "down", "enter", "power", "enter");
  r.check("Turn on: RUN LED blinks while the inverter starts", (await t.page.getAttribute("#ledRun", "class")).includes("is-blink"));
  await t.wait(1700);
  r.check("After starting: RUN steady, back on line", (await t.page.getAttribute("#ledRun", "class")).includes("is-run") && (await t.lcd()).includes("ON LINE"));

  await t.close();
  r.print();
  return r.failed;
};
