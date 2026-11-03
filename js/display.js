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
    OFFLINE:  { cls: "off",  label: "STANDBY" }
  };

  function statusBar(s) {
    var b = STATUS_BAR[E.deriveStatus(s).mode];
    return '<div class="lcd-pill ' + b.cls + '"><span class="pd"></span>' + b.label + "</div>";
  }

  /* =========================================================================
     POWER-PATH DIAGRAM — shows where the load's power is coming from
     Lines are only coloured where power is actually flowing:
       normal / overload : MAINS -> RECT/INV -> LOAD
       battery           : BATT  -> RECT/INV -> LOAD
       bypass            : MAINS -> (bypass arc) -> LOAD, the UPS is skipped
       no output / off   : nothing reaches the load
     ========================================================================= */
  function powerPath(s) {
    var mode = E.deriveStatus(s).mode;
    var p = { mainsIn: false, toLoad: false, batt: false, bypass: false, warn: false };
    if (mode === "ONLINE" || mode === "OVERLOAD") { p.mainsIn = true; p.toLoad = true; p.warn = mode === "OVERLOAD"; }
    else if (mode === "BATTERY") { p.batt = true; p.toLoad = true; p.warn = true; }
    else if (mode === "BYPASS")  { p.bypass = true; p.warn = true; }

    var lineCls = function (on) { return on ? (p.warn ? "seg livewarn" : "seg live") : "seg"; };
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
    var names = { ONLINE: "ON LINE", BATTERY: "ON BATTERY", BYPASS: "ON BYPASS", OVERLOAD: "OVERLOAD", NOOUTPUT: "NO OUTPUT" };
    var tone = mode === "ONLINE" ? "ok" : (mode === "NOOUTPUT" ? "bad" : "warn");
    var pct = E.isOutputOff(s) ? 0 : E.loadPercent(s);
    var rows = row("Load", pct + "%", loadTone(pct));
    if (mode === "BATTERY") rows += row("Backup time", E.backupMinutes(s) + " min");
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
             row("Backup time", onBattery ? E.backupMinutes(s) + " min" : "--") +
             row("Remaining cap.", onBattery ? "86%" : "100%");
    } else if (tab === "Output") {
      rows = row("L-N voltage", off ? "0 V" : "230 V") + row("Frequency", off ? "--- Hz" : "50.0 Hz") + row("Load", pct + "%", loadTone(pct));
    } else {
      rows = row("Load percent", pct + "%", loadTone(pct)) +
             row("Sout", (off ? 0 : s.loadKW).toFixed(2) + " kVA") +
             row("Pout", (off ? 0 : s.loadKW).toFixed(2) + " kW") +
             row("Power factor", "1.00");
    }
    var tabs = '<div class="lcd-tabs" role="tablist">' + E.STATUS_TABS.map(function (t) {
      return '<span role="tab" aria-selected="' + (t === tab) + '" class="' + (t === tab ? "on" : "") + '">' + t + "</span>";
    }).join("") + "</div>";
    return header("STATUS", "UP / DOWN: change tab") + tabs + '<div class="lcd-rows">' + rows + "</div>";
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
      case "menu":    body = header("MAIN MENU", "ENTER to select") + list(E.MAIN_MENU, v.sel); break;
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
