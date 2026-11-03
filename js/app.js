/**
 * app.js — Page controller
 * ---------------------------------------------------------------------------
 * Ties everything together: the segment list, the front panel and test bench,
 * the guided checks, the scenario tests, the Maintenance page and the quiz.
 *
 * Sections:
 *   1. Setup and page elements
 *   2. Saved progress (browser storage, validated on load)
 *   3. Segment list (left rail)
 *   4. Front panel and test bench
 *   5. Task cards (the "Step 1: Press ENTER -> ..." instructions)
 *   6. Guided checks
 *   7. Scenario tests
 *   8. Maintenance page
 *   9. Quiz
 *  10. Switching segments
 *  11. Event wiring and start-up
 *
 * Depends on: GXT5.engine, GXT5.content, GXT5.display, GXT5.audio
 */
(function (GXT5) {
  "use strict";
  var E = GXT5.engine, C = GXT5.content, D = GXT5.display, A = GXT5.audio;

  /* =========================================================================
     1. SETUP AND PAGE ELEMENTS
     ========================================================================= */
  function $(id) { return document.getElementById(id); }
  var el = {
    title: $("scTitle"), situation: $("scSituation"), rail: $("rail"),
    workbench: $("workbench"), infoPane: $("infoPane"), quizPane: $("quizPane"), foot: $("foot"),
    ledRun: $("ledRun"), ledAlarm: $("ledAlarm"), buzzer: $("buzzer"), lcd: $("lcd"),
    panelButtons: $("panelButtons"), bench: $("bench"), benchRows: $("benchRows"),
    sideTop: $("sideTop"), sideBottom: $("sideBottom"), soundBtn: $("soundBtn")
  };

  /** What is on screen right now. */
  var view = {
    segment: null,     // entry from C.SEGMENTS
    state: null,       // UPS state from E.createState
    check: null,       // entry from C.CHECKS (guided checks only)
    step: 0,           // current objective index in a check
    lastResult: null   // read-out text shown under the task card
  };

  /** Scenario-test run state. */
  var run = {
    timer: null, secondsLeft: 0, running: false, over: false, memo: {},
    fails: { "test-mains": 0, "test-ups": 0 }, lastOutcome: null
  };

  /** Quiz attempt state. */
  var quiz = null;

  function segmentById(id) {
    for (var i = 0; i < C.SEGMENTS.length; i++) if (C.SEGMENTS[i].id === id) return C.SEGMENTS[i];
    return null;
  }
  function segmentIndex(id) {
    for (var i = 0; i < C.SEGMENTS.length; i++) if (C.SEGMENTS[i].id === id) return i;
    return -1;
  }

  /* =========================================================================
     2. SAVED PROGRESS
     Stored in the browser only (localStorage), never sent anywhere. Anything
     read back is checked against the known segment list, so edited or corrupt
     storage cannot inject unexpected values.
     ========================================================================= */
  var STORAGE_KEY = "gxt5-trainer-progress-v2";
  var KNOWN_IDS = C.SEGMENTS.map(function (s) { return s.id; });
  var saved = { done: Object.create(null), quizScore: null };

  function loadProgress() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (data && typeof data === "object") {
        if (Array.isArray(data.done)) {
          data.done.forEach(function (id) {
            if (typeof id === "string" && KNOWN_IDS.indexOf(id) !== -1) saved.done[id] = true;
          });
        }
        var q = data.quizScore;
        if (typeof q === "number" && q % 1 === 0 && q >= 0 && q <= C.QUIZ.length) saved.quizScore = q;
        // "quiz done" only counts with a genuine passing score behind it
        if (saved.done.quiz && !(saved.quizScore !== null && saved.quizScore >= C.QUIZ_PASS_MARK)) delete saved.done.quiz;
      }
      localStorage.removeItem("gxt5_done"); // remove the old format from earlier versions
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  }

  function saveProgress() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ done: Object.keys(saved.done), quizScore: saved.quizScore }));
    } catch (e) { /* private window or storage blocked: progress lasts for this visit only */ }
  }

  function isDone(id) { return saved.done[id] === true; }

  function markDone(id) {
    if (isDone(id)) return;
    saved.done[id] = true;
    saveProgress();
    renderRail();
  }

  function quizUnlocked() { return C.QUIZ_REQUIRES.every(isDone); }
  function quizPassed() { return saved.quizScore !== null && saved.quizScore >= C.QUIZ_PASS_MARK; }

  /* =========================================================================
     3. SEGMENT LIST (left rail)
     ========================================================================= */
  function renderRail() {
    var h = "";
    C.SEGMENTS.forEach(function (s, i) {
      var current = view.segment && view.segment.id === s.id;
      var dot = "";
      if (isDone(s.id)) dot = '<span class="dot done" title="Done"></span>';
      else if (s.kind === "quiz" && !quizUnlocked()) dot = '<span class="dot lock" title="Locked"></span>';
      h += '<button type="button" data-go="' + i + '" aria-current="' + (current ? "true" : "false") + '">' +
        '<span class="n">' + (i + 1) + '</span><span class="lbl">' + s.title + "</span>" + dot + "</button>";
    });
    h += '<p class="rail-note">A practice bench, not the live unit. Behaviour follows the GXT5 manual, simplified for learning. ' +
      "The test bench stands in for the real world: mains, load and cooling.</p>";
    el.rail.innerHTML = h;
  }

  /* =========================================================================
     4. FRONT PANEL AND TEST BENCH
     ========================================================================= */

  /** Redraw the LEDs, buzzer indicator and LCD, and set the buzzer sound. */
  function renderPanel() {
    var s = view.state, d = E.deriveStatus(s);
    // A silenced alarm sounds again as soon as a different alarm condition appears
    if (s.muted && s.mutedFor !== d.mode) s.muted = false;
    var active = d.buzzer !== "off", silenced = active && E.isSilenced(s), audible = active && !silenced;

    el.ledRun.className = "led" + (d.run === "on" ? " is-run" : "");
    el.ledAlarm.className = "led" + (d.alarm === "amber" ? " is-amber" : (d.alarm === "red" ? " is-red" : ""));
    el.buzzer.className = "buzzer" + (active ? " on" + (audible ? " pulse" : "") + (d.buzzer === "fast" ? " fast" : "") : "");
    el.buzzer.textContent = silenced ? "BUZZER (silenced)" : "BUZZER";
    el.lcd.innerHTML = D.renderScreen(s);
    A.setPattern(d.buzzer, audible);
  }

  /** Draw the bench controls this segment uses: "mains", "load", "cooling". */
  function renderBench(keys) {
    if (!keys || !keys.length) { el.bench.hidden = true; el.benchRows.innerHTML = ""; return; }
    var s = view.state, h = "";
    if (keys.indexOf("mains") !== -1) {
      h += '<div class="bench-row"><div><div class="bench-label">Mains breaker</div><div class="bench-sub">The supply feeding the UPS</div></div>' +
        '<span class="switch warn">' +
        '<button type="button" data-bench="mains" data-val="1" class="' + (s.mains ? "on" : "") + '">CLOSED</button>' +
        '<button type="button" data-bench="mains" data-val="0" class="' + (!s.mains ? "on" : "") + '">OPEN</button></span></div>';
    }
    if (keys.indexOf("load") !== -1) {
      var canAdd = E.canAddLoad(s);
      h += '<div class="bench-row"><div><div class="bench-label">Connected load</div><div class="bench-sub">' +
        (canAdd ? "Equipment drawing from the UPS" : "Overloaded: no more load can be added") + "</div></div>" +
        '<span class="stepper">' +
        '<button type="button" data-bench="load" data-val="-1" aria-label="Reduce load">−</button>' +
        '<span class="val">' + s.loadKW.toFixed(1) + " kW</span>" +
        '<button type="button" data-bench="load" data-val="1" aria-label="Increase load"' + (canAdd ? "" : " disabled") + ">+</button></span></div>";
    }
    if (keys.indexOf("cooling") !== -1) {
      h += '<div class="bench-row"><div><div class="bench-label">Cooling / airflow</div><div class="bench-sub">Blocked airflow caused the over-temp</div></div>' +
        '<span class="switch warn">' +
        '<button type="button" data-bench="cooling" data-val="0" class="' + (s.faultCauseActive ? "on" : "") + '">BLOCKED</button>' +
        '<button type="button" data-bench="cooling" data-val="1" class="' + (!s.faultCauseActive ? "on" : "") + '">OK</button></span></div>';
    }
    el.bench.hidden = false;
    el.benchRows.innerHTML = h;
  }

  /** Apply a bench button press to the UPS state. */
  function applyBench(button) {
    var key = button.getAttribute("data-bench"), val = button.getAttribute("data-val");
    if (key === "mains" || key === "cooling") E.benchAction(view.state, key, val === "1");
    else if (key === "load") E.benchAction(view.state, "load", val === "1" ? 1 : -1);
  }

  /* =========================================================================
     5. TASK CARDS
     Turns "Press [ENTER] > Control > Clear faults" into keycaps and arrows, and
     "Bench: Mains breaker > [OPEN]" into a bench tag with switch chips.
     ========================================================================= */
  function stepPath(lines) {
    return lines.map(function (line, n) {
      var bench = line.indexOf("Bench: ") === 0;
      if (bench) line = line.slice(7);
      var h = '<div class="step-line">' + (n > 0 ? '<span class="then">then</span>' : "") + (bench ? '<span class="bench-tag">Bench</span>' : "");
      line.split(" > ").forEach(function (part, i) {
        if (i > 0) h += '<span class="arr" aria-hidden="true">→</span><span class="sr">, then </span>';
        h += '<span class="sp">' + part.replace(/\[([^\]]+)\]/g, function (_, key) {
          return '<span class="' + (bench ? "bv" : "kc") + '">' + key + "</span>";
        }) + "</span>";
      });
      return h + "</div>";
    }).join("");
  }

  /** Progress dots: green done, blue current, grey to come. */
  function progressDots(total, current) {
    var h = '<span class="dots" aria-label="Step ' + Math.min(current + 1, total) + " of " + total + '">';
    for (var i = 0; i < total; i++) h += '<i class="' + (i < current ? "done" : (i === current ? "on" : "")) + '"></i>';
    return h + "</span>";
  }

  /** Read-out panel: what you are seeing / why. */
  function readOut(r) {
    r = r || {};
    return '<div class="debrief"><h2>Read-out</h2>' +
      '<div class="db-item"><span class="db-k seeing">What you are seeing</span><p class="db-v">' + (r.seeing || "") + "</p></div>" +
      '<div class="db-item"><span class="db-k why">Why</span><p class="db-v">' + (r.why || "") + "</p></div></div>";
  }

  /* =========================================================================
     6. GUIDED CHECKS
     ========================================================================= */
  function startCheck(id) {
    view.check = C.CHECKS[id];
    view.state = view.check.setup();
    view.step = 0;
    view.lastResult = view.check.intro;
    el.situation.textContent = view.check.situation;
    showArea("workbench");
    advanceCheck();
    renderCheck();
  }

  /** Move past every objective that is now satisfied. */
  function advanceCheck() {
    var objs = view.check.objectives;
    while (view.step < objs.length && objs[view.step].test(view.state)) {
      view.lastResult = objs[view.step].result;
      view.step++;
    }
    if (view.step >= objs.length) markDone(view.segment.id);
  }

  function renderCheck() {
    renderPanel();
    renderBench(view.check.bench);
    var objs = view.check.objectives, finished = view.step >= objs.length;

    var h = '<div class="task' + (finished ? " complete" : "") + '"><div class="task-top"><div class="task-h">' +
      (finished ? "Check complete" : "Your task") + "</div>" + progressDots(objs.length, view.step) + "</div>";
    if (finished) {
      h += '<div class="task-body">All steps done. Go on to the next segment, or restart this check to practise again.</div>';
    } else {
      var o = objs[view.step];
      var usesPanel = o.path.some(function (l) { return l.indexOf("Press") === 0; });
      h += '<div class="step"><span class="step-no">Step ' + (view.step + 1) + ":</span><div>" + stepPath(o.path) + "</div></div>" +
        '<div class="step-goal">' + o.goal + "</div>" +
        (usesPanel ? '<div class="step-hint">In menus: UP / DOWN to highlight, ENTER to select, ESC to go back.</div>' : "");
    }
    el.sideTop.innerHTML = h + "</div>";

    var next = C.SEGMENTS[segmentIndex(view.segment.id) + 1];
    el.sideBottom.innerHTML = readOut(view.lastResult) +
      '<div class="action-row">' +
        (finished && next ? '<button type="button" class="btn-primary" data-go-id="' + next.id + '">Next: ' + next.title + "</button>" : "") +
        '<button type="button" class="btn-secondary" data-action="restart">Restart this check</button>' +
      "</div>";
  }

  function checkAction(apply) {
    apply();
    advanceCheck();
    renderCheck();
  }

  /* =========================================================================
     7. SCENARIO TESTS
     No step-by-step instructions. The trainee must handle the situation before
     the battery runs out. Wrong actions fail immediately. After repeated fails
     the result card gives more help (see content.js, TESTS).
     ========================================================================= */
  function testDef() { return C.TESTS[view.segment.id]; }

  function stopTimer() { if (run.timer) { clearInterval(run.timer); run.timer = null; } }

  /** Show the brief and the Start button. The panel is calm until the test starts. */
  function showTestBrief() {
    var t = testDef();
    stopTimer();
    run.running = false; run.over = false; run.lastOutcome = null;
    view.state = E.createState();
    el.situation.textContent = t.situation;
    showArea("workbench");
    renderPanel();
    renderBench(null);
    el.sideTop.innerHTML =
      '<div class="task"><div class="task-top"><div class="task-h">Scenario test</div>' +
        (isDone(view.segment.id) ? '<span class="tag-pass">Passed</span>' : "") + "</div>" +
        '<div class="task-body">' + t.brief + "</div>" +
        '<div class="step-goal">Battery time available: ' + t.seconds + " seconds. Use the panel and the test bench.</div></div>" +
      hintCard(view.segment.id, false) +
      '<p class="bench-sub">Turn your volume up. The alarm sounds as soon as the test starts.</p>';
    el.sideBottom.innerHTML = '<div class="action-row"><button type="button" class="btn-primary" data-action="start-test">Start test</button></div>';
  }

  function startTest() {
    var t = testDef();
    stopTimer();
    view.state = t.setup();
    run.memo = {}; run.secondsLeft = t.seconds; run.running = true; run.over = false;
    renderPanel();
    renderBench(t.bench);
    el.sideTop.innerHTML =
      '<div class="test-timer"><div><div class="timer-h">Battery remaining</div>' +
        '<div class="bench-sub">Handle the situation before it runs out</div></div>' +
        '<div class="num" id="testSeconds">' + run.secondsLeft + "s</div></div>" +
      '<div class="bar"><i id="testBar"></i></div>' +
      '<div class="task"><div class="task-top"><div class="task-h">Situation</div></div><div class="task-body">' + t.brief + "</div></div>";
    el.sideBottom.innerHTML = "";
    updateTimer();
    run.timer = setInterval(tick, 1000);
  }

  /** Update the countdown number and bar (set through script, which the security policy allows). */
  function updateTimer() {
    var t = testDef(), num = $("testSeconds"), bar = $("testBar");
    if (num) num.textContent = run.secondsLeft + "s";
    if (bar) bar.style.width = Math.max(0, Math.round(run.secondsLeft / t.seconds * 100)) + "%";
  }

  function tick() {
    if (!run.running) return;
    run.secondsLeft--;
    if (run.secondsLeft <= 0) { endTest({ fail: "timeout" }); return; }
    updateTimer();
  }

  /** Called after every panel or bench action during a test. */
  function testAction(apply) {
    var t = testDef();
    apply();
    t.onAction(view.state, run.memo);
    var outcome = t.outcome(view.state, run.memo);
    if (outcome) { endTest(outcome); return; }
    renderPanel();
    renderBench(t.bench);
  }

  function endTest(outcome) {
    var t = testDef(), id = view.segment.id;
    stopTimer();
    run.running = false; run.over = true; run.lastOutcome = outcome;
    if (outcome.fail === "timeout") {
      view.state.forceBattery = false;
      view.state.faultLatched = "Battery EOD";
      view.state.faultSub = "Battery exhausted. Output is off.";
      view.state.muted = false;
      view.state.view = { name: "home" };
    }
    if (outcome.pass) markDone(id); else run.fails[id]++;
    renderPanel();
    renderBench(null); // the bench is only usable while a test is running
    renderTestResult();
  }

  /**
   * Extra help after failed attempts.
   * forResult: true on the result card (includes the reason), false on the brief.
   */
  function hintCard(id, forResult) {
    var t = C.TESTS[id], fails = run.fails[id];
    if (fails < 2) return "";
    var h = '<div class="hint-card"><div class="hint-h">' + (forResult ? "Tip" : "Tip from your last attempts") + "</div>" +
      "<p>" + t.tip + "</p>" +
      '<div class="hint-revisit">Revisit: ' + t.revisit.map(function (sid) {
        return '<button type="button" class="link-btn" data-go-id="' + sid + '">' + segmentById(sid).title + "</button>";
      }).join(" ") + "</div>";
    if (fails >= 3) {
      h += '<div class="hint-steps"><div class="hint-h">Steps</div>' +
        t.steps.map(function (line, i) { return '<div class="step"><span class="step-no">' + (i + 1) + ".</span><div>" + stepPath([line]) + "</div></div>"; }).join("") +
        "</div>";
    }
    return h + "</div>";
  }

  function renderTestResult() {
    var t = testDef(), id = view.segment.id, o = run.lastOutcome;
    if (o.pass) {
      var bothPassed = isDone("test-mains") && isDone("test-ups");
      el.sideTop.innerHTML = '<div class="result pass"><h3>Test passed</h3><p>' + t.passText + "</p>" +
        '<p class="result-note">The alarm may still be sounding. Press ESC on the home screen to silence it.</p></div>';
      el.sideBottom.innerHTML = '<div class="action-row">' +
        (bothPassed && quizUnlocked() ? '<button type="button" class="btn-primary" data-go-id="quiz">Go to the quiz</button>' : "") +
        (!isDone(id === "test-mains" ? "test-ups" : "test-mains") ?
          '<button type="button" class="btn-primary" data-go-id="' + (id === "test-mains" ? "test-ups" : "test-mains") + '">Next: ' +
          segmentById(id === "test-mains" ? "test-ups" : "test-mains").title + "</button>" : "") +
        '<button type="button" class="btn-secondary" data-action="start-test">Run the test again</button></div>';
    } else {
      var attempts = run.fails[id];
      el.sideTop.innerHTML = '<div class="result fail"><h3>Test failed</h3><p>' + t.failText[o.fail] + "</p>" +
        '<p class="result-note">Failed attempts: ' + attempts + (attempts === 1 ? ". Try again; more help appears if you get stuck." : "") + "</p></div>" +
        hintCard(id, true);
      el.sideBottom.innerHTML = '<div class="action-row"><button type="button" class="btn-primary" data-action="start-test">Try again</button></div>';
    }
  }

  function testPanelPress(btn) {
    if (run.running) { testAction(function () { E.pressButton(view.state, btn); }); return; }
    // Before or after a run, only ESC (silence) does anything
    if (btn === "esc") { E.pressButton(view.state, "esc"); renderPanel(); }
  }

  /* =========================================================================
     8. MAINTENANCE PAGE
     ========================================================================= */
  function showMaintenance() {
    el.situation.textContent = "Describe the procedure for UPS serviceability and maintenance.";
    showArea("info");
    el.infoPane.innerHTML = C.buildMaintenanceHtml();
    markDone("maintenance");
  }

  /* =========================================================================
     9. QUIZ
     Locked until everything else is finished. Passing shows a completion page
     (no retry needed); failing offers a retry and suggests what to review.
     ========================================================================= */
  function showQuiz() {
    el.situation.textContent = "Multiple choice and true / false. " + C.QUIZ_PASS_MARK + " out of " + C.QUIZ.length + " to pass.";
    showArea("quiz");
    if (!quizUnlocked()) renderQuizLocked();
    else if (quizPassed()) renderCompletion(saved.quizScore);
    else startQuiz();
  }

  function renderQuizLocked() {
    var items = C.QUIZ_REQUIRES.map(function (id) {
      var seg = segmentById(id), ok = isDone(id), label = seg.kind === "test" ? "passed" : "done";
      return '<button type="button" class="lock-item' + (ok ? " ok" : "") + '" data-go-id="' + id + '"><span class="st"></span>' +
        seg.title + (ok ? " — " + label : "") + "</button>";
    }).join("");
    el.quizPane.innerHTML = '<div class="pane"><div class="quiz-lock"><h2 class="no-top">Quiz is locked</h2>' +
      "<p>Finish every segment below to unlock the quiz, including passing both scenario tests. You need " +
      C.QUIZ_PASS_MARK + " out of " + C.QUIZ.length + " to pass.</p>" +
      '<div class="lock-list">' + items + "</div></div></div>";
  }

  function startQuiz() {
    quiz = { i: 0, score: 0, answered: false, picked: -1, wrong: [] };
    renderQuestion();
  }

  function renderQuestion() {
    if (quiz.i >= C.QUIZ.length) { finishQuiz(); return; }
    var q = C.QUIZ[quiz.i], opts = q.type === "tf" ? ["True", "False"] : q.opts, letters = ["A", "B", "C", "D"];
    var h = '<div class="quiz"><div class="quiz-meta"><span>Question ' + (quiz.i + 1) + " of " + C.QUIZ.length + "</span><span>Score " + quiz.score + "</span></div>" +
      '<div class="q-card"><div class="q-type">' + (q.type === "tf" ? "True / False" : "Multiple choice") + "</div>" +
      '<div class="q-text">' + q.q + '</div><div class="q-opts">';
    opts.forEach(function (text, i) {
      var cls = "q-opt", mark = q.type === "tf" ? "" : letters[i];
      if (quiz.answered) {
        if (i === q.answer) { cls += " correct"; mark = "✓"; }
        else if (i === quiz.picked) { cls += " wrong"; mark = "✗"; }
      }
      h += '<button type="button" class="' + cls + '" data-opt="' + i + '"' + (quiz.answered ? " disabled" : "") + '><span class="mk">' + mark + "</span><span>" + text + "</span></button>";
    });
    h += "</div>";
    if (quiz.answered) {
      h += '<div class="q-explain"><b>' + (quiz.picked === q.answer ? "Correct." : "Not quite.") + "</b> " + q.explain + "</div>" +
        '<div class="q-actions"><button type="button" class="btn-primary" data-action="next-question">' +
        (quiz.i === C.QUIZ.length - 1 ? "See result" : "Next question") + "</button></div>";
    }
    el.quizPane.innerHTML = h + "</div></div>";
  }

  function answerQuestion(i) {
    if (quiz.answered) return;
    var q = C.QUIZ[quiz.i];
    quiz.picked = i; quiz.answered = true;
    if (i === q.answer) quiz.score++; else quiz.wrong.push(quiz.i);
    renderQuestion();
  }

  function finishQuiz() {
    if (quiz.score >= C.QUIZ_PASS_MARK) {
      saved.quizScore = quiz.score;
      saveProgress();
      markDone("quiz");
      renderCompletion(quiz.score);
      return;
    }
    var review = [];
    quiz.wrong.forEach(function (qi) {
      C.QUIZ[qi].review.forEach(function (id) { if (review.indexOf(id) === -1) review.push(id); });
    });
    el.quizPane.innerHTML = '<div class="pane"><div class="score-card fail">' +
      '<div class="score-big">' + quiz.score + " / " + C.QUIZ.length + "</div>" +
      '<div class="score-verdict">Not yet: ' + C.QUIZ_PASS_MARK + " needed to pass</div>" +
      '<p class="score-text">Review these segments, then try again:</p>' +
      '<div class="hint-revisit centred">' + review.map(function (id) {
        return '<button type="button" class="link-btn" data-go-id="' + id + '">' + segmentById(id).title + "</button>";
      }).join(" ") + "</div>" +
      '<div class="action-row centred"><button type="button" class="btn-primary" data-action="retry-quiz">Try the quiz again</button></div>' +
      "</div></div>";
  }

  /** Shown once the quiz is passed. No retry: the training is complete. */
  function renderCompletion(score) {
    el.quizPane.innerHTML = '<div class="pane"><div class="complete-card">' +
      '<div class="complete-badge">Training complete</div>' +
      "<h2>Thank you for completing the GXT5 serviceability training</h2>" +
      '<div class="score-big pass">' + score + " / " + C.QUIZ.length + "</div>" +
      "<p>You have worked through the maintenance procedure, all five serviceability checks and both scenario tests, and passed the knowledge check.</p>" +
      '<p class="note">You can revisit any segment from the list at any time for practice.</p>' +
      "</div></div>";
  }

  /* =========================================================================
     10. SWITCHING SEGMENTS
     ========================================================================= */

  /** Show one main area: "workbench", "info" or "quiz". */
  function showArea(area) {
    el.workbench.hidden = area !== "workbench";
    el.infoPane.hidden = area !== "info";
    el.quizPane.hidden = area !== "quiz";
    el.foot.hidden = area !== "workbench";
    if (area !== "workbench") A.stop();
  }

  function openSegment(index) {
    if (typeof index !== "number" || index < 0 || index >= C.SEGMENTS.length) return;
    stopTimer();
    run.running = false;
    A.stop();
    view.segment = C.SEGMENTS[index];
    el.title.textContent = view.segment.title;
    renderRail();
    switch (view.segment.kind) {
      case "check": startCheck(view.segment.id); break;
      case "test":  showTestBrief(); break;
      case "info":  showMaintenance(); break;
      case "quiz":  showQuiz(); break;
    }
  }

  function openSegmentById(id) { openSegment(segmentIndex(id)); }

  /* =========================================================================
     11. EVENT WIRING AND START-UP
     All clicks are handled here through data- attributes (no inline handlers).
     ========================================================================= */

  // Front-panel buttons
  el.panelButtons.addEventListener("click", function (e) {
    var b = e.target.closest(".pbtn"); if (!b) return;
    var btn = b.getAttribute("data-btn");
    if (view.segment.kind === "check") checkAction(function () { E.pressButton(view.state, btn); });
    else if (view.segment.kind === "test") testPanelPress(btn);
  });

  // Test-bench controls
  el.benchRows.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-bench]"); if (!b || b.disabled) return;
    if (view.segment.kind === "check") checkAction(function () { applyBench(b); });
    else if (view.segment.kind === "test" && run.running) testAction(function () { applyBench(b); });
  });

  // Segment list
  el.rail.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-go]"); if (!b) return;
    openSegment(parseInt(b.getAttribute("data-go"), 10));
  });

  // Buttons inside the task column, quiz and result cards
  document.addEventListener("click", function (e) {
    var go = e.target.closest("[data-go-id]");
    if (go) { openSegmentById(go.getAttribute("data-go-id")); return; }
    var opt = e.target.closest("button[data-opt]");
    if (opt && quiz) { answerQuestion(parseInt(opt.getAttribute("data-opt"), 10)); return; }
    var act = e.target.closest("[data-action]");
    if (!act) return;
    switch (act.getAttribute("data-action")) {
      case "restart":       startCheck(view.segment.id); break;
      case "start-test":    startTest(); break;
      case "next-question": quiz.i++; quiz.answered = false; quiz.picked = -1; renderQuestion(); break;
      case "retry-quiz":    startQuiz(); break;
    }
  });

  // Sound on / off
  el.soundBtn.addEventListener("click", function () {
    var on = !A.isEnabled();
    A.setEnabled(on);
    el.soundBtn.setAttribute("aria-pressed", on ? "true" : "false");
    el.soundBtn.textContent = on ? "Sound on" : "Sound off";
    if (view.segment && !el.workbench.hidden) renderPanel();
  });

  loadProgress();
  openSegment(0);
})(window.GXT5);
