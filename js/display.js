/**
 * display.js — UPS display screen
 * ---------------------------------------------------------------------------
 * Builds the HTML for the LCD on the simulated front panel: the coloured status
 * bar, the home screen with its power-path diagram, the menus, the Status tabs,
 * the alarm log and one-off messages. It reads the UPS state from engine.js and
 * never changes it.
 *
 * All text placed on the screen comes from this file, engine.js or content.js
 * (fixed strings and numbers); nothing typed by a user is ever inserted.
 *
 * Exposes: GXT5.display.renderScreen(state)
 * Depends on: GXT5.engine
 */
(function (GXT5) {
  "use strict";
  var E = GXT5.engine;

  /* =========================================================================
     STATUS BAR — coloured indicator at the top of every screen
     ========================================================================= */
  var STATUS_BAR = {
    ONLINE:   { cls: "ok",   label: "NORMAL" },
    BATTERY:  { cls: "warn", label: "ALARM · ON BATTERY" },
    BYPASS:   { cls: "warn", label: "ALARM · ON BYPASS" },
    OVERLOAD: { cls: "warn", label: "ALARM · OVERLOAD" },
    FAULT:    { cls: "bad",  label: "FAULT" },
    NOOUTPUT: { cls: "bad",  label: "NO OUTPUT" },
    STARTING: { cls: "off",  label: "INVERTER STARTING" },
    OFFLINE:  { cls: "off",  label: "STANDBY" }
  };

  function statusBar(s) {
    var b = STATUS_BAR[E.deriveStatus(s).mode];
    return '<div class="lcd-pill ' + b.cls + '"><span class="pd"></span>' + b.label + "</div>";
  }

  /* =========================================================================
     POWER-PATH DIAGRAM — shows where the load's power is coming from
     The line carrying power is lit green, whatever the alarm state (inspection
     procedure, Figure 21: in bypass, the bypass line is the one lit green).
     Lines are only lit where power is actually flowing:
       normal / overload : MAINS -> RECT/INV -> LOAD
       battery           : BATT  -> RECT/INV -> LOAD
       bypass            : MAINS -> (bypass arc) -> LOAD, the UPS is skipped
       no output / off   : nothing reaches the load
     ========================================================================= */
  function powerPath(s) {
    var mode = E.deriveStatus(s).mode;
    var p = { mainsIn: false, toLoad: false, batt: false, bypass: false };
    if (mode === "ONLINE" || mode === "OVERLOAD") { p.mainsIn = true; p.toLoad = true; }
    else if (mode === "BATTERY") { p.batt = true; p.toLoad = true; }
    else if (mode === "BYPASS")  { p.bypass = true; }

    var lineCls = function (on) { return on ? "seg live" : "seg"; };
    // Battery read-out beside the battery, as on the real home page (Figure 24)
    var onBatt = mode === "BATTERY";
    var battText = (onBatt ? "Discharge " : "Charge ") + (onBatt ? "86%" : "100%");
    var loadFed = p.toLoad || p.bypass;
    // Node styles: live (carrying power), normal (available), dim (absent / off), fault
    var mainsNode = (p.mainsIn || p.bypass) ? "node live" : (s.mains ? "node" : "node dim");
    var upsNode   = mode === "FAULT" ? "node fault" : ((p.mainsIn || p.batt) ? "node live" : "node dim");
    var loadNode  = loadFed ? "node live" : "node dim";
    var battNode  = p.batt ? "node live" : "node";

    return '<div class="flow"><svg viewBox="0 0 300 120" role="img" aria-label="Power path: ' + mode.toLowerCase() + '">' +
      // bypass arc: from the top of MAINS straight to the top of LOAD
      '<path class="' + lineCls(p.bypass) + '" d="M39 48 C 100 4, 200 4, 262 48"/>' +
      '<text x="150" y="31" text-anchor="middle" class="' + (p.bypass ? "" : "dim") + '">BYPASS</text>' +
      // main path through the UPS
      '<line class="' + lineCls(p.mainsIn) + '" x1="60" y1="60" x2="110" y2="60"/>' +
      '<line class="' + lineCls(p.toLoad) + '" x1="190" y1="60" x2="240" y2="60"/>' +
      '<line class="' + lineCls(p.batt) + '" x1="150" y1="98" x2="150" y2="76"/>' +
      // nodes
      '<rect class="' + mainsNode + '" x="18" y="48" width="42" height="24" rx="3"/>' +
      '<text x="39" y="64" text-anchor="middle" class="' + (mainsNode === "node dim" ? "dim" : "") + '">MAINS</text>' +
      '<rect class="' + upsNode + '" x="110" y="44" width="80" height="32" rx="3"/>' +
      '<text x="150" y="58" text-anchor="middle">RECT / INV</text>' +
      '<text x="150" y="70" text-anchor="middle" class="dim">UPS</text>' +
      '<rect class="' + loadNode + '" x="240" y="48" width="44" height="24" rx="3"/>' +
      '<text x="262" y="64" text-anchor="middle" class="' + (loadFed ? "" : "dim") + '">LOAD</text>' +
      '<rect class="' + battNode + '" x="128" y="98" width="44" height="20" rx="3"/>' +
      '<text x="150" y="112" text-anchor="middle">BATT</text>' +
      '<text x="180" y="112" class="batt-info">' + battText + "</text>" +
      "</svg></div>";
  }

  /* =========================================================================
     SCREEN PARTS
     ========================================================================= */

  /** Screen heading with the cue for which button to use on the right. */
  function header(title, cue, tone) {
    return '<div class="lcd-head"><span class="lcd-title' + (tone ? " " + tone : "") + '">' + title + "</span>" +
      (cue ? '<span class="lcd-cue">' + cue + "</span>" : "") + "</div>";
  }

  /** One label / value row. */
  function row(label, value, tone) {
    return '<div class="lcd-row"><span class="k">' + label + '</span><span class="v' + (tone ? " " + tone : "") + '">' + value + "</span></div>";
  }

  /** Amber at 85%+, red at 100%+. */
  function loadTone(pct) {
    return pct >= 100 ? "bad" : (pct >= 85 ? "warn" : "");
  }

  /** A selectable list (menus and dialogs). */
  function list(items, selected) {
    return '<div class="lcd-list">' + items.map(function (text, i) {
      return '<div class="lcd-li' + (i === selected ? " sel" : "") + '"><span class="mk"></span><span>' + text + "</span></div>";
    }).join("") + "</div>";
  }

  /* =========================================================================
     SCREENS
     ========================================================================= */

  /** Home screen: mode, power-path diagram, load and (on battery) backup time. */
  function homeScreen(s) {
    var mode = E.deriveStatus(s).mode;
    if (mode === "FAULT") {
      return '<div class="lcd-msg"><div class="big bad">' + s.faultLatched + '</div><div class="sub">' +
        (s.faultSub || "Inverter off. Press ENTER for Control.") + "</div></div>";
    }
    if (mode === "OFFLINE") {
      return '<div class="lcd-msg"><div class="big">Standby</div><div class="sub">Output off. Press POWER to start.</div></div>';
    }
    if (mode === "STARTING") {
      return '<div class="lcd-msg"><div class="big">Inverter starting</div><div class="sub">The RUN LED blinks until the UPS has output.</div></div>';
    }
    var names = { ONLINE: "ON LINE", BATTERY: "ON BATTERY", BYPASS: "ON BYPASS", OVERLOAD: "OVERLOAD", NOOUTPUT: "NO OUTPUT" };
    var tone = mode === "ONLINE" ? "ok" : (mode === "NOOUTPUT" ? "bad" : "warn");
    var pct = E.isOutputOff(s) ? 0 : E.loadPercent(s);
    var rows = row("Load", pct + "%", loadTone(pct));
    // Estimated battery runtime is always on the home page (inspection procedure, Figure 24).
    // On bypass or with no output the battery is not supplying the load, so no estimate.
    if (!E.isOutputOff(s) && mode !== "BYPASS") rows += row("Est. battery runtime", E.backupMinutes(s) + " min");
    return header(names[mode], "Press ENTER for menu", tone) + powerPath(s) + '<div class="lcd-rows lcd-rows-gap">' + rows + "</div>";
  }

  /** Status screen with a visible tab strip so the trainee can see where they are. */
  function statusScreen(s) {
    var tab = E.STATUS_TABS[s.view.tab || 0];
    var mode = E.deriveStatus(s).mode;
    var off = E.isOutputOff(s);
    var pct = off ? 0 : E.loadPercent(s);
    var onBattery = mode === "BATTERY";
    var rows;

    if (tab === "Input" || tab === "Bypass") {
      rows = row("L-N voltage", s.mains ? "230 V" : "--- V") + row("Frequency", s.mains ? "50.0 Hz" : "--- Hz");
    } else if (tab === "Battery") {
      rows = row("Status", onBattery ? "Discharging" : "Float charging") +
             row("Backup time", off ? "--" : E.backupMinutes(s) + " min") +
             row("Remaining cap.", onBattery ? "86%" : "100%");
    } else if (tab === "Output") {
      rows = row("L-N voltage", off ? "0 V" : "230 V") + row("Frequency", off ? "--- Hz" : "50.0 Hz") + row("Load", pct + "%", loadTone(pct));
    } else {
      // Same fields and order as the real Load page (inspection procedure, Figure 23)
      rows = row("Sout (kVA)", (off ? 0 : s.loadKW).toFixed(2)) +
             row("Pout (kW)", (off ? 0 : s.loadKW).toFixed(2)) +
             row("Power factor", "1.00") +
             row("Load percent (%)", pct.toFixed(1), loadTone(pct));
    }
    var tabs = '<div class="lcd-tabs" role="tablist">' + E.STATUS_TABS.map(function (t) {
      return '<span role="tab" aria-selected="' + (t === tab) + '" class="' + (t === tab ? "on" : "") + '">' + t + "</span>";
    }).join("") + "</div>";
    return header("STATUS", "UP / DOWN: change tab") + tabs + '<div class="lcd-rows">' + rows + "</div>";
  }

  /**
   * Main menu: six items in a 3 x 2 grid, as on the real screen (Figure 20).
   * Top bar: ECO-mode indicator (not lit in normal operation), ambient
   * temperature, and date and time.
   */
  function menuScreen(s) {
    var now = new Date();
    var two = function (n) { return (n < 10 ? "0" : "") + n; };
    var stamp = now.getFullYear() + "-" + two(now.getMonth() + 1) + "-" + two(now.getDate()) + " " + two(now.getHours()) + ":" + two(now.getMinutes());
    var top = '<div class="lcd-topbar"><span class="eco" title="ECO-mode indicator (not lit)">ECO</span>' +
      "<span>25.4 \u00B0C</span><span>" + stamp + "</span></div>";
    var grid = '<div class="lcd-grid">' + E.MAIN_MENU.map(function (item, i) {
      return '<span class="' + (i === s.view.sel ? "sel" : "") + '">' + item + "</span>";
    }).join("") + "</div>";
    return top + header("MAIN MENU", "ENTER to select") + grid;
  }

  /** About screen with Product / Efficiency / Battery age tabs (Figure 22). */
  function aboutScreen(s) {
    var tab = E.ABOUT_TABS[s.view.tab || 0], rows;
    if (tab === "Product") rows = row("Model", "Liebert GXT5") + row("Rating", "6 kVA / 6 kW");
    else if (tab === "Efficiency") rows = row("Efficiency", "Not part of this check");
    else rows = row("State-Of-Health SOH (%)", String(E.SOH_PERCENT), E.SOH_PERCENT >= E.SOH_MIN ? "ok" : "bad") +
                row("Pass mark", "at least " + E.SOH_MIN + "%");
    return header("ABOUT", "UP / DOWN: change tab") + tabStrip(E.ABOUT_TABS, tab) + '<div class="lcd-rows">' + rows + "</div>";
  }

  /** Settings and Maintenance: restricted, not used in the inspection. */
  function restrictedScreen(title) {
    return header(title, "ESC to go back") +
      '<div class="lcd-msg"><div class="big">Restricted</div><div class="sub">Not used in the routine inspection.</div></div>';
  }

  function tabStrip(tabs, current) {
    return '<div class="lcd-tabs" role="tablist">' + tabs.map(function (t) {
      return '<span role="tab" aria-selected="' + (t === current) + '" class="' + (t === current ? "on" : "") + '">' + t + "</span>";
    }).join("") + "</div>";
  }

  function logScreen(s) {
    return header("CURRENT ALARMS", "ESC to go back") + list(E.currentAlarms(s), -1);
  }

  function messageScreen(s) {
    return '<div class="lcd-msg"><div class="big' + (s.msg.tone ? " " + s.msg.tone : "") + '">' + s.msg.big + "</div>" +
      (s.msg.sub ? '<div class="sub">' + s.msg.sub + "</div>" : "") +
      '<div class="lcd-cue lcd-cue-center">Press ENTER or ESC</div></div>';
  }

  /** Build the whole LCD for the current state. */
  function renderScreen(s) {
    var v = s.view, body;
    switch (v.name) {
      case "message": body = messageScreen(s); break;
      case "menu":    body = menuScreen(s); break;
      case "about":   body = aboutScreen(s); break;
      case "settings": body = restrictedScreen("SETTINGS"); break;
      case "maintenance": body = restrictedScreen("MAINTENANCE"); break;
      case "control": body = header("CONTROL", "ENTER to select") + list(E.controlItems(s), v.sel); break;
      case "dialog":  body = header("POWER", "ENTER to select") + list(E.powerOptions(s), v.sel); break;
      case "log":     body = logScreen(s); break;
      case "status":  body = statusScreen(s); break;
      default:        body = homeScreen(s);
    }
    return statusBar(s) + body;
  }

  /* =========================================================================
     PUBLIC INTERFACE
     ========================================================================= */
  GXT5.display = { renderScreen: renderScreen };
})(window.GXT5 = window.GXT5 || {});
