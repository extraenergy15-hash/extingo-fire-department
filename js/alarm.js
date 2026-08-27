/**
 * Extingo Fire Department — status bar / siren logic
 *
 * Three visual states:
 *   all-clear     no active incidents
 *   active-alarm  one or more active incidents, not silenced
 *   silenced      one or more active incidents, dispatcher has silenced
 *
 * Audio: a looping siren plays the moment a *new* alert comes in — not on
 * every poll/re-render of the same alert. We track the last-seen alert id
 * in a module-level variable (`lastSeenEventId`) and only (re)start the
 * siren when that id changes. Silencing stops playback and does NOT reset
 * that tracker, so the same alert won't re-trigger it — only a genuinely
 * new alert id will.
 *
 * Two alert sources feed the dedup, since this project has both:
 *   1. ExtingoAPI's demo incident bus (`incident:new`), keyed by incident.id
 *   2. The live `extingo:data` feed from map.js (§3.8), assumed to carry
 *      `detail.alert.event` as a unique id, e.g.:
 *        { status: "EMERGENCY", lat, lon, alert: { event: "INC-2031" } }
 *      Adjust the field name below if the real payload differs.
 */

(function () {
  const statusBar = document.getElementById("status-bar");
  const headline = document.getElementById("status-headline");
  const meta = document.getElementById("status-meta");
  const silenceBtn = document.getElementById("silence-btn");

  let silenced = false;

  // ---------------------------------------------------------------------
  // Siren playback
  // ---------------------------------------------------------------------
  // Primary path: a looping <audio> element. If assets/siren.mp3 is
  // missing or the browser refuses to decode/play it, we fall back to a
  // synthesized two-tone wail via the Web Audio API so the alarm still
  // makes noise without the asset in place.
  const sirenAudio = new Audio("assets/siren.mp3");
  sirenAudio.loop = true;
  sirenAudio.preload = "auto";

  let usingFallbackTone = false;
  let audioCtx = null;
  let toneOscillator = null;
  let toneLfo = null;
  let toneGain = null;

  sirenAudio.addEventListener("error", () => {
    usingFallbackTone = true;
    console.warn(
      "assets/siren.mp3 failed to load — falling back to a synthesized " +
        "tone. Add a real siren audio file at that path for production."
    );
  });

  function startFallbackTone() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }

    toneOscillator = audioCtx.createOscillator();
    toneGain = audioCtx.createGain();
    toneLfo = audioCtx.createOscillator();
    const lfoGain = audioCtx.createGain();

    toneOscillator.type = "sine";
    toneOscillator.frequency.value = 700; // center pitch
    toneGain.gain.value = 0.12; // keep the synthesized fallback modest

    toneLfo.frequency.value = 0.6; // wail speed
    lfoGain.gain.value = 180; // wail depth in Hz

    toneLfo.connect(lfoGain).connect(toneOscillator.frequency);
    toneOscillator.connect(toneGain).connect(audioCtx.destination);

    toneOscillator.start();
    toneLfo.start();
  }

  function stopFallbackTone() {
    if (toneOscillator) {
      toneOscillator.stop();
      toneOscillator.disconnect();
      toneOscillator = null;
    }
    if (toneLfo) {
      toneLfo.stop();
      toneLfo.disconnect();
      toneLfo = null;
    }
    toneGain = null;
  }

  function playSiren() {
    if (usingFallbackTone) {
      startFallbackTone();
      return;
    }

    sirenAudio.currentTime = 0;
    const playPromise = sirenAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch((err) => {
        // Most likely a browser autoplay restriction (no user gesture
        // yet on this page) or a decode failure — fall back either way.
        usingFallbackTone = true;
        console.warn("Siren <audio> playback failed, using fallback tone:", err);
        startFallbackTone();
      });
    }
  }

  function stopSiren() {
    sirenAudio.pause();
    sirenAudio.currentTime = 0;
    stopFallbackTone();
  }

  // ---------------------------------------------------------------------
  // New-alert dedup — fires the siren exactly once per incident/alert id,
  // no matter how many times the underlying data is re-polled/re-rendered.
  // ---------------------------------------------------------------------
  let lastSeenEventId = null;

  function handleNewAlert(eventId) {
    if (eventId === undefined || eventId === null) return;
    if (eventId === lastSeenEventId) return; // already handled this one
    lastSeenEventId = eventId;
    silenced = false; // a genuinely new alert always re-arms
    playSiren();
    render();
  }

  // Demo incident feed (ExtingoAPI) — see api.js.
  ExtingoAPI.bus.addEventListener("incident:new", (e) => {
    handleNewAlert(e.detail && e.detail.id);
  });

  // Live emergency feed (map.js, §3.8) — assumed shape documented above.
  window.addEventListener("extingo:data", (e) => {
    const detail = e.detail || {};
    if (detail.status !== "EMERGENCY") return;
    const eventId = detail.alert && detail.alert.event;
    handleNewAlert(eventId);
  });

  ExtingoAPI.bus.addEventListener("incident:resolved", () => {
    // If nothing is active anymore, cut the siren — no point wailing
    // over an all-clear board.
    if (ExtingoAPI.getActiveIncidents().length === 0) {
      stopSiren();
    }
    render();
  });

  // ---------------------------------------------------------------------
  // Status bar rendering
  // ---------------------------------------------------------------------
  function formatTime(date) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function computeState(activeCount) {
    if (activeCount === 0) return "all-clear";
    return silenced ? "silenced" : "active-alarm";
  }

  function render() {
    const active = ExtingoAPI.getActiveIncidents();
    const state = computeState(active.length);
    statusBar.dataset.state = state;

    if (state === "all-clear") {
      headline.textContent = "All Clear";
      silenceBtn.disabled = true;
      silenceBtn.textContent = "Silence Alarm";
    } else if (state === "active-alarm") {
      headline.textContent = `Active Alarm \u00b7 ${active.length} Incident${
        active.length > 1 ? "s" : ""
      } Dispatched`;
      silenceBtn.disabled = false;
      silenceBtn.textContent = "Silence Alarm";
    } else {
      headline.textContent = `Alarm Silenced \u00b7 ${active.length} Active`;
      silenceBtn.disabled = true;
      silenceBtn.textContent = "Silenced";
    }

    meta.textContent = `Last update ${formatTime(new Date())}`;
  }

  silenceBtn.addEventListener("click", () => {
    if (silenceBtn.disabled) return;
    silenced = true;
    stopSiren();
    ExtingoAPI.silenceAlarm();
    render();
  });

  // Best-effort audio unlock: some browsers require a user gesture
  // anywhere on the page before any audio can play. This "primes" the
  // audio element on first interaction so a later siren isn't blocked.
  function unlockAudioOnce() {
    sirenAudio
      .play()
      .then(() => {
        sirenAudio.pause();
        sirenAudio.currentTime = 0;
      })
      .catch(() => {
        /* fine — playSiren() will fall back to a synthesized tone later */
      });
    document.removeEventListener("click", unlockAudioOnce);
  }
  document.addEventListener("click", unlockAudioOnce, { once: true });

  render();
  ExtingoAPI.startDemoFeed();
})();
