/**
 * security.test.js — checks the protections described in SECURITY.md:
 *   - the Content Security Policy is present and nothing on the page breaks it
 *   - an injected inline script does not run
 *   - tampered saved progress is ignored instead of unlocking things
 *   - no outside network requests are made
 */
"use strict";
const { SEG, makeReport, openTrainer, PAGE_URL } = require("./helpers");

module.exports = async function run(browser) {
  const r = makeReport("Security");
  const t = await openTrainer(browser, { fakeClock: true });
  const requests = [];
  t.page.on("request", (req) => { if (!req.url().startsWith("file:")) requests.push(req.url()); });

  // Collect any security-policy violations the page itself causes
  await t.page.evaluate(() => {
    window.__violations = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__violations.push(e.violatedDirective + " " + e.blockedURI));
  });

  const csp = await t.page.getAttribute('meta[http-equiv="Content-Security-Policy"]', "content");
  r.check("Content Security Policy is set", !!csp && csp.includes("script-src 'self'") && csp.includes("default-src 'none'"));

  // Visit every segment and run a test so all screens are drawn
  for (let i = 0; i < 9; i++) await t.go(i);
  await t.go(SEG.testMains);
  await t.page.click('[data-action="start-test"]');
  await t.wait(3000);
  const violations = await t.page.evaluate(() => window.__violations);
  r.check("The page's own code causes no policy violations", violations.length === 0, violations.join(" | "));

  // Try to inject and run an inline script (what an attacker's injected code would look like)
  const ran = await t.page.evaluate(() => {
    window.__injected = false;
    const s = document.createElement("script");
    s.textContent = "window.__injected = true";
    document.body.appendChild(s);
    return window.__injected;
  });
  r.check("Injected inline script is blocked", ran === false);

  // Injected inline event handler
  const handlerRan = await t.page.evaluate(() => {
    window.__handler = false;
    const d = document.createElement("div");
    d.innerHTML = '<img src="x" onerror="window.__handler=true">';
    document.body.appendChild(d);
    return new Promise((res) => setTimeout(() => res(window.__handler), 50));
  });
  await t.wait(100);
  r.check("Injected inline event handler is blocked", (await t.page.evaluate(() => window.__handler)) === false && handlerRan === false);

  // Tampered saved progress: unknown ids, prototype tricks and an impossible score are ignored
  await t.page.evaluate(() => localStorage.setItem("gxt5-trainer-progress-v2",
    JSON.stringify({ done: ["quiz", "__proto__", "<img src=x>", 42, "status"], quizScore: 999 })));
  await t.page.reload();
  await t.go(SEG.quiz);
  const quizText = await t.quizText();
  r.check("Tampered progress does not unlock the quiz or fake a pass", quizText.includes("Quiz is locked") && !quizText.includes("Thank you"));
  const stored = await t.page.evaluate(() => JSON.parse(localStorage.getItem("gxt5-trainer-progress-v2")));
  const knownOnly = stored.done.every((id) => ["maintenance", "status"].includes(id)) && stored.quizScore === null;
  r.check("Only genuine, known entries survive (bad ids, fake quiz pass and score dropped)", knownOnly, JSON.stringify(stored));

  // Corrupt storage does not break the page
  await t.page.evaluate(() => localStorage.setItem("gxt5-trainer-progress-v2", "{not json"));
  await t.page.reload();
  r.check("Corrupt storage: page still loads", (await t.page.locator("#rail button").count()) === 9);

  r.check("No requests to any outside address", requests.length === 0, requests.join(" | "));
  // Ignore the browser's own reports about the attacks above being blocked
  const realErrors = t.errors.filter((m) => !m.includes("Content Security Policy") && !m.includes("ERR_FILE_NOT_FOUND"));
  r.check("No page errors", realErrors.length === 0, realErrors.join(" | "));
  await t.close();
  r.print();
  return r.failed;
};
