/**
 * helpers.js — shared tools for the automated tests
 * ---------------------------------------------------------------------------
 * Each test file uses these to open the trainer in a real (headless) browser
 * and press its buttons the way a trainee would.
 */
"use strict";
const path = require("path");
const { pathToFileURL } = require("url");

/** Address of the trainer's index.html. */
const PAGE_URL = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;

/** Index of each segment in the left-hand list (must match js/content.js). */
const SEG = { maintenance: 0, status: 1, endurance: 2, load: 3, bypass: 4, reset: 5, testMains: 6, testUps: 7, quiz: 8 };

/** Records PASS / FAIL lines for one test file. */
function makeReport(name) {
  const lines = [];
  let failed = 0;
  return {
    check(label, condition, detail) {
      if (!condition) failed++;
      lines.push(`${condition ? "PASS" : "FAIL"}  ${label}${detail ? "  (" + detail + ")" : ""}`);
    },
    get failed() { return failed; },
    print() { console.log(`\n== ${name} ==\n` + lines.join("\n")); }
  };
}

/**
 * Open the trainer in a fresh browser context.
 * options: { viewport, fakeClock, colorScheme, isMobile }
 * Returns helpers for pressing buttons and reading the screen.
 */
async function openTrainer(browser, options = {}) {
  const context = await browser.newContext({
    viewport: options.viewport || { width: 1440, height: 900 },
    colorScheme: options.colorScheme || "light",
    isMobile: !!options.isMobile, hasTouch: !!options.isMobile
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  if (options.fakeClock) await page.clock.install();
  await page.goto(PAGE_URL);

  const t = {
    page, context, errors,
    /** Press a front-panel button: power, esc, up, down, enter. */
    press: async (...buttons) => { for (const b of buttons) await page.click(`.pbtn[data-btn="${b}"]`); },
    /** Use a bench control, e.g. bench("mains", "1") or bench("load", "1"). */
    bench: (key, val) => page.click(`button[data-bench="${key}"][data-val="${val}"]`),
    /** Open a segment from the left-hand list by index. */
    go: (index) => page.click(`#rail button[data-go="${index}"]`),
    lcd: () => page.textContent("#lcd"),
    side: () => page.textContent("#side"),
    taskHeading: () => page.textContent("#sideTop .task-h"),
    quizText: () => page.textContent("#quizPane"),
    /** Move the fake clock forward (only when opened with fakeClock). */
    wait: (ms) => (options.fakeClock ? page.clock.runFor(ms) : page.waitForTimeout(ms)),
    close: () => context.close()
  };
  return t;
}

/** Finish one guided check by pressing the right buttons. */
const CHECK_STEPS = {
  // Main menu order: Status, Settings, Control, Log, About, Maintenance
  async status(t) { await t.press("enter", "down", "down", "down", "enter"); await t.bench("mains", "1"); },
  async endurance(t) {
    await t.press("enter", "down", "down", "down", "down", "enter", "down", "down"); // About > Battery age
    await t.press("esc", "esc");                                     // back to the home page (runtime)
    await t.press("enter", "down", "down", "enter", "enter");        // Control > Start battery test
    await t.press("enter", "enter", "down", "down");                 // Status > Battery tab
    await t.press("esc", "down", "down", "enter", "enter");          // back > Control > Stop battery test
  },
  async load(t) {
    await t.press("enter", "enter", "up");                   // Status > Load tab
    for (let i = 0; i < 3; i++) await t.bench("load", "1");  // to 7.2 kW (120%)
    await t.bench("load", "-1");                              // back to 5.7 kW
  },
  async bypass(t) {
    await t.press("power", "enter");                         // Turn ON to bypass
    await t.bench("mains", "0");                              // lose mains on bypass
    await t.bench("mains", "1");
    await t.press("power", "enter");                         // Turn on UPS (normal)
  },
  async reset(t) {
    await t.press("enter", "down", "down", "enter", "down", "enter"); // Clear faults (refused)
    await t.bench("cooling", "1");                             // fix the cause
    await t.press("esc", "enter", "down", "down", "enter", "down", "enter"); // Clear faults (works)
    await t.press("power", "enter");                          // Turn on UPS
    await t.wait(1700);                                       // inverter starting (RUN blinks)
  }
};

/** Pass each scenario test with the correct response. */
const TEST_PASS = {
  async mains(t) {
    await t.page.click('[data-action="start-test"]');
    await t.press("enter", "enter", "down", "down");          // Status > Battery tab
    await t.bench("mains", "1");                               // restore supply
  },
  async ups(t) {
    await t.page.click('[data-action="start-test"]');
    await t.press("power", "enter");                          // Turn ON to bypass
  }
};

module.exports = { PAGE_URL, SEG, makeReport, openTrainer, CHECK_STEPS, TEST_PASS };
