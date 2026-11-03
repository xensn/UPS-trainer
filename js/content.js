/**
 * content.js — Training content
 * ---------------------------------------------------------------------------
 * Everything a trainee reads or is tested on lives here, so it can be edited
 * without touching the page logic:
 *   1. SEGMENTS      the list on the left, in order
 *   2. CHECKS        the five guided serviceability checks
 *   3. TESTS         the two scenario tests (no instructions, timed)
 *   4. QUIZ          the knowledge check (unlocks after everything else)
 *   5. MAINTENANCE   the Maintenance page text
 *
 * Step instructions use a small notation that app.js turns into keycaps:
 *   "Press [ENTER] > Control > Clear faults"   panel button, then menu items
 *   "Bench: Mains breaker > [CLOSED]"          a test-bench control
 *
 * Exposes: GXT5.content
 * Depends on: GXT5.engine
 */
(function (GXT5) {
  "use strict";
  var E = GXT5.engine;

  /* =========================================================================
     1. SEGMENTS — the list on the left
     kind: "info" (reading page), "check" (guided), "test" (scenario test), "quiz"
     ========================================================================= */
  var SEGMENTS = [
    { id: "maintenance", title: "Maintenance",        kind: "info"  },
    { id: "status",      title: "Status Check",       kind: "check" },
    { id: "endurance",   title: "Endurance Check",    kind: "check" },
    { id: "load",        title: "Load Utilisation",   kind: "check" },
    { id: "bypass",      title: "Bypass",             kind: "check" },
    { id: "reset",       title: "UPS Reset",          kind: "check" },
    { id: "test-mains",  title: "Mains Failure Test", kind: "test"  },
    { id: "test-ups",    title: "UPS Failure Test",   kind: "test"  },
    { id: "quiz",        title: "Quiz",               kind: "quiz"  }
  ];

  /** Segments that must be finished (tests: passed) before the quiz unlocks. */
  var QUIZ_REQUIRES = ["maintenance", "status", "endurance", "load", "bypass", "reset", "test-mains", "test-ups"];

  /** Score needed to pass the quiz. */
  var QUIZ_PASS_MARK = 8;

  /* =========================================================================
     2. CHECKS — guided, step by step
     Each objective: path (what to press), goal (why), test (done yet?),
     result (read-out shown once the step is done).
     ========================================================================= */
  var CHECKS = {
    status: {
      situation: "Learn to read the panel. The unit is on battery right now. Find the active alarm, then restore mains and confirm it is healthy.",
      bench: ["mains"],
      setup: function () { return E.createState({ mains: false }); },
      intro: {
        seeing: "Amber ALARM and one beep a second, output still on.",
        why: "Amber means a warning with the load still protected. Red would mean a fault, a failure. The UPS Reset check shows a red fault live."
      },
      objectives: [
        {
          path: ["Press [ENTER] > Log"],
          goal: "Find the active alarm and read why the UPS is alarming.",
          test: function (s) { return s.view.name === "log"; },
          result: { seeing: "The log reads Battery mode. Amber ALARM, output still on.",
                    why: "A logged alarm with amber and live output is a warning, not a failure." }
        },
        {
          path: ["Bench: Mains breaker > [CLOSED]"],
          goal: "Restore the supply and confirm the unit is healthy.",
          test: function (s) { return s.mains && E.deriveStatus(s).mode === "ONLINE"; },
          result: { seeing: "Back to ON LINE, ALARM off. Current alarms now read none.",
                    why: "With mains back in range the UPS returns to normal automatically. Green with no alarms is your baseline." }
        }
      ]
    },

    endurance: {
      situation: "Prove the UPS can carry its load on battery. Run the battery self-test from the panel and read the backup time it reports.",
      bench: [],
      setup: function () { return E.createState(); },
      intro: {
        seeing: "ON LINE, RUN green, ALARM off, buzzer silent. Load about 45%.",
        why: "Normal running: the UPS conditions mains power and keeps the battery charged."
      },
      objectives: [
        {
          path: ["Press [ENTER] > Control > Start battery test"],
          goal: "Start the battery self-test.",
          test: function (s) { return s.batteryTesting === true; },
          result: { seeing: "The display goes to ON BATTERY, amber ALARM, buzzer once a second.",
                    why: "The UPS moved the load onto the battery to prove it can carry it. Amber is an alarm, not a fault." }
        },
        {
          path: ["Press [ENTER] > Status > [DOWN] to Battery tab"],
          goal: "Read the backup time the battery reports.",
          test: function (s) { return E.isOnStatusTab(s, "Battery"); },
          result: { seeing: "Battery tab shows Discharging, a backup time, and remaining capacity.",
                    why: "Backup time is how long the battery holds this load. It falls with a heavier load or aged batteries." }
        },
        {
          path: ["Press [ESC] > Control > Stop battery test"],
          goal: "End the test and return to normal.",
          test: function (s) { return !s.batteryTesting && E.deriveStatus(s).mode === "ONLINE"; },
          result: { seeing: "Back to ON LINE, ALARM off.",
                    why: "Check done and the UPS recharges. In a real outage, a low-battery pre-warning gives about two minutes before end-of-discharge." }
        }
      ]
    },

    load: {
      situation: "Check how much of the 6 kVA / 6 kW the load draws, then push it into overload. Power factor is 1.0, so the kVA and kW limits are both 6.",
      bench: ["load"],
      setup: function () { return E.createState({ loadKW: 2.7 }); },
      intro: {
        seeing: "ON LINE, load about 45%.",
        why: "Normal running. Read the Load tab, then raise the connected load on the bench."
      },
      objectives: [
        {
          path: ["Press [ENTER] > Status > [UP] to Load tab"],
          goal: "Read how much of the 6 kW rating is in use.",
          test: function (s) { return E.isOnStatusTab(s, "Load"); },
          result: { seeing: "Load percent, Sout and Pout (equal), and PF 1.00.",
                    why: "Because PF is 1.0, kVA equals kW. Watch the single Load % figure." }
        },
        {
          path: ["Bench: Connected load > [+] until over 6 kW"],
          goal: "Push the load into overload and watch the alarm.",
          test: function (s) { return s.loadKW > E.RATED_KW; },
          result: { seeing: "Over 100%: Inverter overload, amber ALARM, fast buzzer. No more load can be added.",
                    why: "The overload timer is running. Reduce within a few seconds or the UPS transfers to bypass, or powers off if bypass is unavailable." }
        },
        {
          path: ["Bench: Connected load > [−] until under 6 kW"],
          goal: "Clear the overload.",
          test: function (s) { return s.loadKW <= E.RATED_KW; },
          result: { seeing: "Back under the limit, ALARM off.",
                    why: "With the overload cleared the UPS returns to normal inverter operation." }
        }
      ]
    },

    bypass: {
      situation: "Transfer the load to bypass and back, and see the key lesson: on bypass the load runs straight from mains with no battery backup.",
      bench: ["mains"],
      setup: function () { return E.createState(); },
      intro: {
        seeing: "ON LINE, protected by the inverter.",
        why: "Bypass sends the load straight from mains through the static switch, skipping the inverter."
      },
      objectives: [
        {
          path: ["Press [POWER] > Turn ON to bypass"],
          goal: "Transfer the load to bypass.",
          test: function (s) { return s.bypassEngaged && s.mains; },
          result: { seeing: "ON BYPASS, RUN green, amber ALARM, one beep a second.",
                    why: "The load is fed from raw mains. The inverter is idle, so there is no conditioning and no battery backup." }
        },
        {
          path: ["Bench: Mains breaker > [OPEN]"],
          goal: "Lose mains while on bypass and watch the output.",
          test: function (s) { return s.bypassEngaged && !s.mains; },
          result: { seeing: "Output drops: UPS has no output. RUN off, red ALARM, fast buzzer.",
                    why: "On bypass the battery is out of the path, so a mains loss drops the load at once." }
        },
        {
          path: ["Bench: Mains breaker > [CLOSED]", "Press [POWER] > Turn on UPS (normal)"],
          goal: "Restore mains and return to normal operation.",
          test: function (s) { return !s.bypassEngaged && s.mains && E.deriveStatus(s).mode === "ONLINE"; },
          result: { seeing: "Back to ON LINE, protected again.",
                    why: "With the inverter back in the path the load has conditioning and battery backup once more." }
        }
      ]
    },

    reset: {
      situation: "A fault has shut the output down. Learn that a reset is not a repair: Clear faults only works once the cause is gone.",
      bench: ["cooling"],
      setup: function () {
        return E.createState({ faultLatched: "System over temp", faultCauseActive: true, outputOff: true });
      },
      intro: {
        seeing: "System over temp. RUN off, red ALARM, fast buzzer.",
        why: "The UPS shut the inverter down to protect itself. The cause is still present: cooling is blocked."
      },
      objectives: [
        {
          path: ["Press [ENTER] > Control > Clear faults"],
          goal: "Try to clear the fault while its cause is still there.",
          test: function (s) { return s.lastEvent === "clear-failed"; },
          result: { seeing: "The panel refuses: Operation failed, condition is not met. The fault stays.",
                    why: "Clearing does nothing while the cause is still present. A reset is not a repair." }
        },
        {
          path: ["Bench: Cooling / airflow > [OK]"],
          goal: "Fix the cause by restoring airflow.",
          test: function (s) { return !s.faultCauseActive; },
          result: { seeing: "Heat-sink back in range. The fault is no longer active, only latched.",
                    why: "With the cause gone, the fault can now be cleared." }
        },
        {
          path: ["Press [ENTER] > Control > Clear faults"],
          goal: "Clear the fault now that the cause is fixed.",
          test: function (s) { return s.lastEvent === "clear-ok" && !s.faultLatched; },
          result: { seeing: "Faults cleared, ALARM off. The unit is in standby.",
                    why: "Clearing works now because the cause is resolved." }
        },
        {
          path: ["Press [POWER] > Turn on UPS"],
          goal: "Start the UPS.",
          test: function (s) { return E.deriveStatus(s).mode === "ONLINE"; },
          result: { seeing: "Back to ON LINE.",
                    why: "The UPS restarts into normal operation with the load protected." }
        }
      ]
    }
  };

  /* =========================================================================
     3. TESTS — scenario tests with no instructions
     The trainee reads the brief, starts the test and must handle it before the
     battery runs out. Hints only appear after failed attempts:
       1st fail: what went wrong
       2nd fail: + a tip and which check to revisit
       3rd fail onwards: + the exact steps
     outcome(state, memo) returns null (keep going), {pass:true} or {fail:"reasonKey"}.
     ========================================================================= */
  var TESTS = {
    "test-mains": {
      situation: "A timed test. No step-by-step instructions: respond as you would on the job.",
      brief: "The supply breaker feeding the UPS has tripped, and the UPS is now running on its battery. Handle the situation and keep the connected equipment running.",
      seconds: 45,
      bench: ["mains"],
      setup: function () { return E.createState({ mains: false }); },
      /** Track what the trainee has done so far. */
      onAction: function (s, memo) {
        if (E.isOnStatusTab(s, "Battery") && E.deriveStatus(s).mode === "BATTERY") memo.checkedBackup = true;
      },
      outcome: function (s, memo) {
        var mode = E.deriveStatus(s).mode;
        if (mode === "OFFLINE") return { fail: "switchedOff" };
        if (s.mains) {
          if (!memo.checkedBackup) return { fail: "restoredUnchecked" };
          if (mode === "ONLINE") return { pass: true };
        }
        return null;
      },
      failText: {
        timeout: "The battery ran out before the supply was restored, so the output dropped (Battery EOD).",
        switchedOff: "You switched the UPS off, so the connected equipment lost power.",
        restoredUnchecked: "You restored the supply without first checking how long the battery would last. Check the backup time first, in case the supply cannot be restored."
      },
      passText: "You checked the backup time while on battery, then restored the supply. The UPS is back on line and recharging. If the supply could not be restored, the next step would be to shut equipment down in order before the low-battery warning.",
      tip: "With the supply gone, bypass is not available and switching off drops the load. First find out how long the battery will last, then restore the supply.",
      revisit: ["endurance", "status"],
      steps: ["Press [ENTER] > Status > [DOWN] to Battery tab", "Bench: Mains breaker > [CLOSED]"]
    },

    "test-ups": {
      situation: "A timed test. No step-by-step instructions: respond as you would on the job.",
      brief: "The UPS has raised an internal alarm and dropped onto its battery. Handle the situation and keep the connected equipment running.",
      seconds: 20,
      bench: ["mains"],
      setup: function () { return E.createState({ forceBattery: true }); },
      onAction: function () {},
      outcome: function (s) {
        var mode = E.deriveStatus(s).mode;
        if (mode === "BYPASS") return { pass: true };
        if (mode === "OFFLINE") return { fail: "switchedOff" };
        return null;
      },
      failText: {
        timeout: "The battery ran out before the load was moved off the faulty UPS, so the output dropped (Battery EOD).",
        switchedOff: "You switched the UPS off, so the connected equipment lost power."
      },
      passText: "You moved the load onto mains through bypass before the battery ran out. The load stays up while the UPS fault is reported for servicing. Remember that bypass has no battery backup.",
      tip: "The UPS itself is faulty, but check whether mains is still available (the bench breaker, or Status → Input). If it is, move the load onto mains before the battery runs flat.",
      revisit: ["bypass"],
      steps: ["Press [POWER] > Turn ON to bypass"]
    }
  };

  /* =========================================================================
     4. QUIZ — type "mcq" (multiple choice) or "tf" (true/false; answer 0=True, 1=False)
     review: which segments to suggest if this question is answered wrongly
     ========================================================================= */
  var QUIZ = [
    { type: "mcq", q: "An amber ALARM with the load still powered means:",
      opts: ["A fault that needs service", "A warning: the load is still protected", "The UPS has switched off", "Nothing, it is normal"],
      answer: 1, review: ["status"],
      explain: "Amber is a warning (on battery, on bypass, overload). The load is still supplied. Red is a fault." },
    { type: "tf", q: "A red fault indicator means the UPS has failed and usually needs service, not just a reset.",
      answer: 0, review: ["status", "reset"],
      explain: "Red marks a failure. Clearing the fault does not repair it; the cause must be fixed first." },
    { type: "mcq", q: "Because the GXT5 power factor is 1.0, its 6 kVA rating equals:",
      opts: ["3 kW", "6 kW", "9 kW", "12 kW"],
      answer: 1, review: ["load"],
      explain: "At unity power factor kVA equals kW, so 6 kVA is 6 kW. Watch the single Load % figure." },
    { type: "mcq", q: "While the UPS is ON BYPASS and mains fails, the load:",
      opts: ["Stays protected on battery", "Is lost, because bypass has no battery backup", "Switches back to the inverter", "Is unaffected"],
      answer: 1, review: ["bypass"],
      explain: "On bypass the battery is out of the path, so a mains loss drops the load immediately." },
    { type: "tf", q: "Clear faults will clear a fault even while the cause is still present.",
      answer: 1, review: ["reset"],
      explain: "False. Clear faults only works once the cause is resolved. A reset is not a repair." },
    { type: "mcq", q: "The battery low pre-warning gives roughly how long before end-of-discharge at full load:",
      opts: ["About 2 minutes", "About 30 minutes", "About 2 hours", "No warning is given"],
      answer: 0, review: ["endurance"],
      explain: "The pre-warning gives about two minutes to shut equipment down in order before the UPS stops." },
    { type: "mcq", q: "The supply to the UPS fails and it switches to battery. What should you do first?",
      opts: ["Transfer to bypass", "Check the backup time on Status → Battery", "Switch the UPS off", "Clear faults"],
      answer: 1, review: ["endurance", "test-mains"],
      explain: "With mains gone, bypass is not available and switching off drops the load. Check how long the battery will last, then restore the supply or shut equipment down in order." },
    { type: "tf", q: "Transferring to bypass gives the same power conditioning as normal double-conversion mode.",
      answer: 1, review: ["bypass"],
      explain: "False. Bypass feeds the load from raw mains with no conditioning and no battery backup." },
    { type: "mcq", q: "The endurance check is performed by:",
      opts: ["Increasing the load until it trips", "Running the battery self-test and reading the backup time", "Clearing faults", "Muting the alarm"],
      answer: 1, review: ["endurance"],
      explain: "Endurance is about battery autonomy: run on battery and read how long it holds the load." },
    { type: "mcq", q: "An internal alarm drops the UPS to battery while mains is still available. To keep the load up you should:",
      opts: ["Do nothing and wait", "Transfer to bypass without delay", "Switch the UPS off", "Add more load"],
      answer: 1, review: ["bypass", "test-ups"],
      explain: "With mains present, transferring to bypass keeps the load on mains while the battery would otherwise run down." }
  ];

  /* =========================================================================
     5. MAINTENANCE — page text (objective a: describe the procedure)
     Colour is kept for the essentials only:
       D = red   (danger / do not)      W = amber (caution)
     Check names are plain bold (B). Keep highlights few so they stand out.
     ========================================================================= */
  function buildMaintenanceHtml() {
    var D = function (t) { return '<span class="hl danger">' + t + "</span>"; };
    var W = function (t) { return '<span class="hl warn">' + t + "</span>"; };
    var B = function (t) { return "<strong>" + t + "</strong>"; };
    return "" +
      '<p class="lead">Serviceability checks confirm the UPS will protect its load and can be maintained safely. ' +
        "Work through them in order; each one has its own segment in this trainer.</p>" +
      '<div class="legend" aria-label="Colour key">' +
        '<span class="lg-danger">Danger / do not</span><span class="lg-warn">Caution</span>' +
      "</div>" +
      '<div class="info-grid"><div>' +
        '<div class="callout">' +
          '<h2 class="sec sec-danger">Before you touch anything</h2>' +
          "<ul>" +
            "<li>The GXT5 carries " + D("hazardous voltages") + " and has no user-serviceable parts inside. " + D("Do not open the chassis.") + "</li>" +
            "<li>Batteries carry a " + W("shock and short-circuit risk") + " even with mains removed. Follow lockout and wear the correct PPE.</li>" +
            "<li>Keep at least 100&nbsp;mm clearance at the front and rear, and keep the air inlets clear.</li>" +
          "</ul>" +
        "</div>" +
        '<h2 class="sec sec-ok">Routine care</h2>' +
        "<ul>" +
          "<li>Keep the UPS plugged in so the batteries stay charged, and operate it around 15\u201325&nbsp;\u00B0C for battery life.</li>" +
          "<li>Check the display and log for active alarms, and note the battery replacement date.</li>" +
          "<li>A red fault means " + D("service (Vertiv), not a field repair") + ".</li>" +
        "</ul>" +
      "</div><div>" +
        '<h2 class="sec sec-key">The serviceability sequence</h2>' +
        '<ol class="seg-steps">' +
          "<li>" + B("Status check") + " \u2014 read the LEDs, the mode and the log; tell an alarm from a fault.</li>" +
          "<li>" + B("Endurance check") + " \u2014 run the battery self-test and confirm the backup time.</li>" +
          "<li>" + B("Load utilisation check") + " \u2014 confirm the load is within the 6&nbsp;kW rating.</li>" +
          "<li>" + B("Bypass") + " \u2014 transfer to bypass and back; know that bypass gives " + D("no battery backup") + ".</li>" +
          "<li>" + B("UPS reset (power on/off)") + " \u2014 clear a fault " + W("only once its cause is fixed") + ", then start the unit.</li>" +
        "</ol>" +
        '<p class="note">After the five checks, pass the two timed scenario tests to unlock the Quiz.</p>' +
      "</div></div>";
  }

  /* =========================================================================
     PUBLIC INTERFACE
     ========================================================================= */
  GXT5.content = {
    SEGMENTS: SEGMENTS,
    QUIZ_REQUIRES: QUIZ_REQUIRES,
    QUIZ_PASS_MARK: QUIZ_PASS_MARK,
    CHECKS: CHECKS,
    TESTS: TESTS,
    QUIZ: QUIZ,
    buildMaintenanceHtml: buildMaintenanceHtml
  };
})(window.GXT5 = window.GXT5 || {});
