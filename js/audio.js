/**
 * audio.js — Alarm buzzer
 * ---------------------------------------------------------------------------
 * Plays the GXT5 buzzer patterns, generated in the browser (no sound files):
 *   "slow"  one beep a second       (on battery, on bypass)
 *   "fast"  two beeps a second      (overload, fault, no output)
 *
 * Browsers only allow sound after the first tap, click or key press, so the
 * sound engine is started on the first interaction anywhere on the page.
 *
 * Exposes: GXT5.audio
 */
(function (GXT5) {
  "use strict";

  /* =========================================================================
     STATE
     ========================================================================= */
  var enabled = true;      // the header "Sound on / off" button
  var ctx = null;          // Web Audio context, created on first interaction
  var timer = null;        // repeating beep timer
  var pattern = "off";     // pattern currently playing
  var beeps = 0;           // number of beeps played (used by the automated tests)

  /* =========================================================================
     SOUND ENGINE
     ========================================================================= */

  /** Create or wake the audio context. Called on the first user interaction. */
  function wake() {
    if (!enabled) return;
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
    }
    if (ctx && ctx.state === "suspended") {
      try { ctx.resume(); } catch (e) { /* ignore */ }
    }
  }

  ["pointerdown", "keydown", "touchend"].forEach(function (type) {
    document.addEventListener(type, wake, true);
  });

  /** Play one short 2 kHz beep. */
  function beep(seconds) {
    if (!enabled || !ctx) return;
    beeps++;
    var osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
    osc.type = "square";
    osc.frequency.value = 2000;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(t + seconds + 0.02);
  }

  /* =========================================================================
     PATTERNS
     ========================================================================= */

  /**
   * Play a buzzer pattern: "slow", "fast" or "off". `audible` is false when the
   * alarm has been silenced. Only restarts when the pattern changes, so the
   * rhythm stays steady while the trainee presses buttons.
   */
  function setPattern(mode, audible) {
    var next = (enabled && audible && (mode === "slow" || mode === "fast")) ? mode : "off";
    if (next === pattern) return;
    stop();
    pattern = next;
    if (next === "off") return;
    var every = next === "fast" ? 500 : 1000;
    var length = next === "fast" ? 0.09 : 0.12;
    beep(length);
    timer = setInterval(function () { beep(length); }, every);
  }

  /** Stop all sound. */
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    pattern = "off";
  }

  /** Turn sound on or off for the whole page. */
  function setEnabled(on) {
    enabled = !!on;
    if (enabled) wake(); else stop();
  }

  /* =========================================================================
     PUBLIC INTERFACE
     ========================================================================= */
  GXT5.audio = {
    setPattern: setPattern,
    stop: stop,
    setEnabled: setEnabled,
    isEnabled: function () { return enabled; },
    beepCount: function () { return beeps; }
  };
})(window.GXT5 = window.GXT5 || {});
