// ─── BlinkBreak content.js ───────────────────────────────────────────────────

const ROUTINES = [
  { icon: "👀", title: "Look Away",     msg: "Look at something 20 feet away for 20 seconds to relax your eye muscles." },
  { icon: "💧", title: "Stay Hydrated", msg: "Take a deep breath and have a sip of water." },
  { icon: "🧘", title: "Check Posture", msg: "Sit up straight, drop your shoulders, and un-clench your jaw." },
  { icon: "😌", title: "Blink Slowly",  msg: "Close your eyes and blink slowly 10 times to rehydrate them." }
];

const OVERLAY_CSS = `
  :host { all: initial; }
  #bb-overlay {
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    z-index: 2147483647;
    display: flex; justify-content: center; align-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Helvetica, Arial, sans-serif;
    animation: bb-in 0.45s cubic-bezier(0.16,1,0.3,1) both;
  }
  .bb-card {
    text-align: center;
    background: rgba(28,28,30,0.85);
    padding: 52px 64px; border-radius: 32px;
    box-shadow: 0 32px 80px rgba(0,0,0,0.5), inset 0 0 0 0.5px rgba(255,255,255,0.1);
    max-width: 420px; width: 90vw; color: #f5f5f7;
    backdrop-filter: blur(40px); -webkit-backdrop-filter: blur(40px);
  }
  .bb-icon { font-size: 56px; margin-bottom: 16px; display: block; animation: bb-float 3s ease-in-out infinite; }
  .bb-card h2 { margin: 0 0 12px; font-size: 26px; font-weight: 700; letter-spacing: -0.6px; color: #f5f5f7; }
  .bb-card p  { font-size: 16px; color: #aeaeb2; margin: 0 0 28px; line-height: 1.5; }
  .bb-ring { position: relative; width: 110px; height: 110px; margin: 0 auto 28px; }
  .bb-ring svg { transform: rotate(-90deg); width: 110px; height: 110px; }
  .bb-ring circle.track    { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 5; }
  .bb-ring circle.progress { fill: none; stroke: url(#bbGrad); stroke-width: 5; stroke-linecap: round; transition: stroke-dashoffset 0.9s linear; }
  .bb-time { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); font-size: 34px; font-weight: 700; color: #f5f5f7; font-variant-numeric: tabular-nums; letter-spacing: -1px; }
  .bb-btns { display: flex; gap: 12px; justify-content: center; }
  .bb-btn { padding: 13px 28px; border: none; border-radius: 16px; font-size: 15px; font-weight: 600; cursor: pointer; transition: transform 0.15s, opacity 0.15s; font-family: inherit; }
  .bb-btn:active { transform: scale(0.95); } .bb-btn:hover { opacity: 0.85; }
  .bb-skip   { background: #0a84ff; color: #fff; }
  .bb-snooze { background: rgba(255,255,255,0.1); color: #f5f5f7; border: 1px solid rgba(255,255,255,0.12); }
  .bb-snooze:hover { background: rgba(255,255,255,0.17); }
  @keyframes bb-in    { from { opacity:0; transform:scale(0.96); } to { opacity:1; transform:scale(1); } }
  @keyframes bb-float { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-6px); } }
`;

// ─── seenBreakId ──────────────────────────────────────────────────────────────
// Persisted on window so it survives content.js re-injection within the same
// page lifetime. Tracks which breakId this tab has already rendered.
if (typeof window.__bbSeenId === "undefined") window.__bbSeenId = null;
const getSeenId = () => window.__bbSeenId;
const setSeenId = (id) => { window.__bbSeenId = id; };

// ─── syncWithStorage ──────────────────────────────────────────────────────────
// Single function called from every trigger path.
// Reads storage and decides whether to show or remove the overlay.
function syncWithStorage() {
  try {
    chrome.storage.local.get(
      ["isBreakActive", "breakId", "breakDuration", "breakStartedAt", "breakRoutineIndex"],
      (state) => {
        if (chrome.runtime.lastError) return;

        const overlayUp = !!document.getElementById("bb-host");

        if (state.isBreakActive && state.breakId) {
          if (!overlayUp && state.breakId !== getSeenId()) {
            // CRITICAL FIX: Do NOT set seenId here — only set it inside
            // showOverlay() after we confirm the overlay will actually render.
            // Setting it here caused background tabs (where startAt <= 0) to
            // mark the break as "seen" and then send breakFinished, killing
            // the break before any tab showed the overlay.
            showOverlay(state);
          }
        } else if (!state.isBreakActive && overlayUp) {
          removeOverlay();
        }
      }
    );
  } catch (e) { /* extension context gone */ }
}

// ─── Trigger 1: immediate on injection ───────────────────────────────────────
syncWithStorage();

// ─── Trigger 2: message from background (fast path) ──────────────────────────
// background.js sends showBreak/removeBreak after writing storage.
// This is the fastest delivery for tabs with a live context.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "showBreak" || msg.action === "removeBreak") {
    syncWithStorage();
  }
});

// ─── Trigger 3: storage.onChanged ────────────────────────────────────────────
// Fires when storage changes in tabs with a live extension context.
// Does NOT fire in frozen contexts (Energy Saver / Memory Saver).
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("isBreakActive" in changes || "breakId" in changes) {
    syncWithStorage();
  }
});

// ─── Trigger 4: visibilitychange ─────────────────────────────────────────────
// Fires the instant user switches TO this tab — catches frozen tabs
// that missed the storage change and the message entirely.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncWithStorage();
});

// ─── Trigger 5: window focus ─────────────────────────────────────────────────
// Covers switching between Chrome windows.
window.addEventListener("focus", syncWithStorage);

// ─── Trigger 6: poll — final safety net ──────────────────────────────────────
// Catches any remaining edge cases: deeply frozen tabs, slow thaw, etc.
// 1s interval is fine — chrome.storage.local reads are fast cached reads.
if (!window.__bbPolling) {
  window.__bbPolling = true;
  setInterval(syncWithStorage, 1000);
}

// ─── Overlay ─────────────────────────────────────────────────────────────────
function showOverlay(state) {
  if (document.getElementById("bb-host")) return;

  const totalTime = Number(state.breakDuration) || 300;
  const elapsed   = state.breakStartedAt
    ? Math.floor((Date.now() - state.breakStartedAt) / 1000)
    : 0;
  const startAt   = Math.max(0, totalTime - elapsed);

  // CRITICAL FIX: Break already expired before this tab could show it.
  // Do NOT set seenId and do NOT send breakFinished — another tab that
  // actually showed the overlay is responsible for sending breakFinished.
  // This tab simply does nothing, preventing premature break termination.
  if (startAt <= 0) return;

  // Only mark as seen NOW — after we've confirmed the overlay will render.
  setSeenId(state.breakId);

  const routine = ROUTINES[(state.breakRoutineIndex || 0) % ROUTINES.length];
  const C       = 2 * Math.PI * 48;

  const host   = document.createElement("div");
  host.id      = "bb-host";
  host.style.cssText = "all:initial;position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:auto;";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>${OVERLAY_CSS}</style>
    <div id="bb-overlay">
      <div class="bb-card">
        <span class="bb-icon">${routine.icon}</span>
        <h2>${routine.title}</h2>
        <p>${routine.msg}</p>
        <div class="bb-ring">
          <svg viewBox="0 0 110 110" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="bbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%"   stop-color="#30d158"/>
                <stop offset="100%" stop-color="#34aadc"/>
              </linearGradient>
            </defs>
            <circle class="track"    cx="55" cy="55" r="48"/>
            <circle class="progress" cx="55" cy="55" r="48"
              stroke-dasharray="${C}" stroke-dashoffset="0"/>
          </svg>
          <div class="bb-time" id="bb-time">${startAt}</div>
        </div>
        <div class="bb-btns">
          <button class="bb-btn bb-skip"   id="bb-skip">Skip</button>
          <button class="bb-btn bb-snooze" id="bb-snooze">Snooze 5m</button>
        </div>
      </div>
    </div>`;

  document.documentElement.appendChild(host);

  const currentBreakId = state.breakId;

  // Escape key skips the break
  function onKeyDown(e) {
    if (e.key === "Escape") {
      document.removeEventListener("keydown", onKeyDown);
      removeOverlay();
      safeSend({ action: "breakFinished", breakId: currentBreakId });
    }
  }
  document.addEventListener("keydown", onKeyDown);

  shadow.getElementById("bb-skip").addEventListener("click", () => {
    document.removeEventListener("keydown", onKeyDown);
    removeOverlay();
    safeSend({ action: "breakFinished", breakId: currentBreakId });
  });

  shadow.getElementById("bb-snooze").addEventListener("click", () => {
    document.removeEventListener("keydown", onKeyDown);
    removeOverlay();
    safeSend({ action: "snooze", minutes: 5 });
  });

  // ── Tick engine ──────────────────────────────────────────────────────────
  const ring      = shadow.querySelector("circle.progress");
  const timeEl    = shadow.getElementById("bb-time");
  const startedAt = state.breakStartedAt || Date.now();
  let lastSec     = -1;
  let rafId       = null;
  let bgTimer     = null;

  function tick() {
    if (!document.getElementById("bb-host")) { stop(); return; }
    const sec = Math.max(0, totalTime - Math.floor((Date.now() - startedAt) / 1000));
    if (sec !== lastSec) {
      lastSec = sec;
      if (timeEl) timeEl.textContent = sec;
      if (ring)   ring.style.strokeDashoffset = C * (1 - sec / totalTime);
    }
    if (sec <= 0) {
      stop();
      removeOverlay();
      safeSend({ action: "breakFinished", breakId: currentBreakId });
      return;
    }
    next();
  }

  function next() {
    if (document.hidden) { bgTimer = setTimeout(tick, 500); }
    else                 { rafId   = requestAnimationFrame(tick); }
  }

  function stop() {
    if (rafId)   { cancelAnimationFrame(rafId); rafId = null; }
    if (bgTimer) { clearTimeout(bgTimer); bgTimer = null; }
    document.removeEventListener("visibilitychange", onVis);
  }

  function onVis() {
    if (!document.hidden) { stop(); tick(); }
  }
  document.addEventListener("visibilitychange", onVis);

  host.__bbStop = stop;
  tick();
}

function removeOverlay() {
  const host = document.getElementById("bb-host");
  if (!host) return;
  if (typeof host.__bbStop === "function") host.__bbStop();
  host.remove();
}

function safeSend(msg) {
  try {
    chrome.runtime.sendMessage(msg, () => { void chrome.runtime.lastError; });
  } catch (e) { /* extension context invalidated */ }
}