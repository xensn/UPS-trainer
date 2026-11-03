/**
 * engine.js — UPS simulation
 * ---------------------------------------------------------------------------
 * The "brain" of the simulated Liebert GXT5. It holds the unit's state and the
 * rules for how it behaves: which operating mode it is in, what each
 * front-panel button does, and what the test bench (mains, load, cooling)
 * changes. Nothing in here draws on the page — see display.js for that.
 *
 * Behaviour follows the Vertiv Liebert GXT5 Installer/User Guide, simplified
 * for training.
 *
 * Exposes: GXT5.engine
 */
(function (GXT5) {
  "use strict";

  /* =========================================================================
     CONSTANTS
     ========================================================================= */

  /** Items on the LCD main menu, in order. */
  var MAIN_MENU = ["Status", "Control", "Log"];

  /** Tabs on the Status screen, in order. */
  var STATUS_TABS = ["Input", "Bypass", "Battery", "Output", "Load"];

  /** Rated output of the 6 kVA unit. Power factor is 1.0, so kW = kVA. */
  var RATED_KW = 6;

  /** How much one press of the bench + / − load buttons changes the load. */
  var LOAD_STEP_KW = 1.5;

  /* =========================================================================
     STATE
     ========================================================================= */

  /**
   * Make a fresh UPS state: running normally on mains at about 45% load.
   * Pass an object to override any field, e.g. createState({ mains: false }).
   *
   * Fields:
   *   mains            true when the supply feeding the UPS is present
   *   loadKW           connected load in kW
   *   batteryTesting   battery self-test running
   *   bypassEngaged    load transferred to bypass
   *   faultLatched     name of a latched fault, or null
   *   faultSub         optional second line for the fault screen
   *   faultCauseActive true while the cause of the fault is still present
   *   outputOff        UPS output switched off (standby)
   *   forceBattery     UPS internal failure: on battery even though mains is present
   *   muted, mutedFor  alarm silenced, and for which mode
   *   lastEvent        name of the last thing that happened (used by checks/tests)
   *   view             which LCD screen is showing, plus its cursor position
   */
  function createState(overrides) {
    var s = {
      mains: true,
      loadKW: 2.7,
      batteryTesting: false,
      bypassEngaged: false,
      faultLatched: null,
      faultSub: null,
      faultCauseActive: false,
      outputOff: false,
      forceBattery: false,
      muted: false,
      mutedFor: null,
      lastEvent: null,
      view: { name: "home" }
    };
    if (overrides) {
      Object.keys(overrides).forEach(function (k) { s[k] = overrides[k]; });
    }
    return s;
  }

  /* =========================================================================
     DERIVED STATUS — what the unit is doing right now
     ========================================================================= */

  /**
   * Work out the operating mode, LED colours and buzzer pattern from the state.
   * Modes: ONLINE, BATTERY, BYPASS, OVERLOAD, FAULT, OFFLINE (standby),
   *        NOOUTPUT (on bypass with mains lost).
   */
  function deriveStatus(s) {
    if (s.faultLatched)               return { mode: "FAULT",    run: "off", alarm: "red",   buzzer: "fast" };
    if (s.outputOff)                  return { mode: "OFFLINE",  run: "off", alarm: "off",   buzzer: "off"  };
    if (s.bypassEngaged && !s.mains)  return { mode: "NOOUTPUT", run: "off", alarm: "red",   buzzer: "fast" };
    if (s.bypassEngaged)              return { mode: "BYPASS",   run: "on",  alarm: "amber", buzzer: "slow" };
    if (!s.mains || s.batteryTesting || s.forceBattery)
                                      return { mode: "BATTERY",  run: "on",  alarm: "amber", buzzer: "slow" };
    if (s.loadKW > RATED_KW)          return { mode: "OVERLOAD", run: "on",  alarm: "amber", buzzer: "fast" };
    return                                   { mode: "ONLINE",   run: "on",  alarm: "off",   buzzer: "off"  };
  }

  /** True when the UPS output is not supplying the load. */
  function isOutputOff(s) {
    var m = deriveStatus(s).mode;
    return m === "FAULT" || m === "OFFLINE" || m === "NOOUTPUT";
  }

  /** Load as a percentage of the rated output. */
  function loadPercent(s) {
    return Math.round(s.loadKW / RATED_KW * 100);
  }

  /** Rough backup time in minutes for the present load (shorter at higher load). */
  function backupMinutes(s) {
    return Math.max(1, Math.round(54 / Math.max(s.loadKW, 0.5)));
  }

  /** True when the current alarm has been silenced with ESC or Mute. */
  function isSilenced(s) {
    return !!(s.muted && s.mutedFor === deriveStatus(s).mode);
  }

  /** True when the Status screen is showing the named tab. */
  function isOnStatusTab(s, tab) {
    return s.view.name === "status" && STATUS_TABS[s.view.tab || 0] === tab;
  }

  /* =========================================================================
     MENU CONTENTS
     ========================================================================= */

  /** Items on the Control screen. */
  function controlItems(s) {
    return [
      s.batteryTesting ? "Stop battery test" : "Start battery test",
      "Clear faults",
      isSilenced(s) ? "Unmute alarm" : "Mute alarm"
    ];
  }

  /**
   * Options in the POWER dialog. Per the GXT5 manual, "Turn ON to bypass" is only
   * offered while the bypass (mains) supply is in range; without mains, only
   * "Turn off" is offered.
   */
  function powerOptions(s) {
    var mode = deriveStatus(s).mode;
    if (s.bypassEngaged) return ["Turn on UPS (normal)", "Turn off UPS", "Cancel"];
    if (s.faultLatched || s.outputOff || mode === "NOOUTPUT") return ["Turn on UPS", "Cancel"];
    if (!s.mains) return ["Turn off UPS", "Cancel"];
    return ["Turn ON to bypass", "Turn off UPS", "Cancel"];
  }

  /** Messages on the Log → Current alarms screen. */
  function currentAlarms(s) {
    switch (deriveStatus(s).mode) {
      case "BATTERY":  return ["Battery mode"];
      case "BYPASS":   return ["Bypass mode"];
      case "OVERLOAD": return ["Inverter overload"];
      case "NOOUTPUT": return ["UPS has no output"];
      case "FAULT":    return [s.faultLatched];
      default:         return ["No active alarms"];
    }
  }

  /* =========================================================================
     ACTIONS — what happens when something is pressed
     ========================================================================= */

  /** Show a one-off message on the LCD (e.g. "Operation failed"). */
  function showMessage(s, big, sub, tone) {
    s.view = { name: "message" };
    s.msg = { big: big, sub: sub || "", tone: tone || null };
  }

  /** Carry out an item chosen on the Control screen. */
  function runControl(s, item) {
    if (item === "Start battery test") {
      if (deriveStatus(s).mode === "ONLINE") {
        s.batteryTesting = true; s.lastEvent = "test-start"; s.view = { name: "home" };
      } else {
        showMessage(s, "Operation failed", "Condition is not met", "warn"); s.lastEvent = "op-failed";
      }
    } else if (item === "Stop battery test") {
      s.batteryTesting = false; s.lastEvent = "test-stop"; s.view = { name: "home" };
    } else if (item === "Clear faults") {
      if (!s.faultLatched) {
        showMessage(s, "No active faults"); s.lastEvent = "clear-none";
      } else if (s.faultCauseActive) {
        showMessage(s, "Operation failed", "Condition is not met", "warn"); s.lastEvent = "clear-failed";
      } else {
        s.faultLatched = null; s.faultSub = null; s.lastEvent = "clear-ok";
        showMessage(s, "Faults cleared", "Ready to start", "ok");
      }
    } else if (item === "Mute alarm") {
      s.muted = true; s.mutedFor = deriveStatus(s).mode; s.view = { name: "home" }; s.lastEvent = "mute";
    } else if (item === "Unmute alarm") {
      s.muted = false; s.view = { name: "home" }; s.lastEvent = "unmute";
    }
  }

  /** Carry out an option chosen in the POWER dialog. */
  function runPowerOption(s, option) {
    if (option === "Turn ON to bypass" && s.mains) { s.bypassEngaged = true; s.lastEvent = "to-bypass"; }
    else if (option === "Turn on UPS (normal)")    { s.bypassEngaged = false; s.lastEvent = "to-normal"; }
    else if (option === "Turn on UPS")             { s.outputOff = false; s.lastEvent = "power-on"; }
    else if (option === "Turn off UPS")            { s.outputOff = true; s.lastEvent = "power-off"; }
    s.view = { name: "home" };
  }

  /**
   * Press a front-panel button: "power", "esc", "up", "down" or "enter".
   *   ENTER  opens the menu / selects the highlighted item
   *   UP/DOWN move the highlight, or change tab on the Status screen
   *   ESC    goes back one screen; on the home screen it silences the alarm
   *   POWER  opens the power dialog (turn on / to bypass / off)
   */
  function pressButton(s, btn) {
    var v = s.view, n = v.name;

    if (btn === "esc") {
      if (n === "home") { s.muted = true; s.mutedFor = deriveStatus(s).mode; s.lastEvent = "silence"; }
      else if (n === "status" || n === "control" || n === "log") s.view = { name: "menu", sel: 0 };
      else s.view = { name: "home" };
      return s;
    }

    if (btn === "power") { s.view = { name: "dialog", sel: 0 }; return s; }

    if (btn === "up" || btn === "down") {
      var dir = btn === "down" ? 1 : -1;
      var wrap = function (i, len) { return (i + dir + len) % len; };
      if (n === "menu")         v.sel = wrap(v.sel, MAIN_MENU.length);
      else if (n === "status")  v.tab = wrap(v.tab || 0, STATUS_TABS.length);
      else if (n === "control") v.sel = wrap(v.sel, controlItems(s).length);
      else if (n === "dialog")  v.sel = wrap(v.sel, powerOptions(s).length);
      return s;
    }

    if (btn === "enter") {
      if (n === "home") s.view = { name: "menu", sel: 0 };
      else if (n === "menu") {
        if (v.sel === 0) s.view = { name: "status", tab: 0 };
        else if (v.sel === 1) s.view = { name: "control", sel: 0 };
        else s.view = { name: "log" };
      }
      else if (n === "control") runControl(s, controlItems(s)[v.sel]);
      else if (n === "dialog")  runPowerOption(s, powerOptions(s)[v.sel]);
      else if (n === "message") s.view = { name: "home" };
      return s;
    }
    return s;
  }

  /**
   * Change something on the test bench (the outside world):
   *   benchAction(s, "mains", true|false)    close / open the mains breaker
   *   benchAction(s, "load", +1 | -1)        add / remove one step of load
   *   benchAction(s, "cooling", true|false)  cooling OK / blocked
   * Once the UPS is overloaded (over 100%), more load cannot be added: there is
   * nothing more to learn from pushing it further.
   */
  function benchAction(s, key, value) {
    if (key === "mains") {
      s.mains = !!value;
    } else if (key === "load") {
      if (value > 0 && s.loadKW > RATED_KW) { s.lastEvent = "load-capped"; return s; }
      var next = Math.round((s.loadKW + value * LOAD_STEP_KW) * 10) / 10;
      s.loadKW = Math.max(0.3, next);
    } else if (key === "cooling") {
      s.faultCauseActive = !value;
    }
    s.lastEvent = "bench-" + key;
    return s;
  }

  /** True when the bench + button should be disabled. */
  function canAddLoad(s) {
    return s.loadKW <= RATED_KW;
  }

  /* =========================================================================
     PUBLIC INTERFACE
     ========================================================================= */
  GXT5.engine = {
    MAIN_MENU: MAIN_MENU,
    STATUS_TABS: STATUS_TABS,
    RATED_KW: RATED_KW,
    createState: createState,
    deriveStatus: deriveStatus,
    isOutputOff: isOutputOff,
    loadPercent: loadPercent,
    backupMinutes: backupMinutes,
    isSilenced: isSilenced,
    isOnStatusTab: isOnStatusTab,
    controlItems: controlItems,
    powerOptions: powerOptions,
    currentAlarms: currentAlarms,
    pressButton: pressButton,
    benchAction: benchAction,
    canAddLoad: canAddLoad
  };
})(window.GXT5 = window.GXT5 || {});
