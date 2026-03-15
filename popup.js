// ─── BlinkBreak — popup.js ───────────────────────────────────────────────────

let isPaused        = false;
let timerIsRunning  = false; // true when an alarm is active (not paused, not stopped)
let settingsChanged = false; // true when user edits inputs while timer is running

// Saved values from storage — used to detect if inputs actually changed
let savedWork = null;
let savedBreak = null;

document.addEventListener("DOMContentLoaded", () => {
  chrome.storage.local.get(["workInterval", "breakDuration", "isPaused"], (data) => {
    savedWork  = data.workInterval  || 25;
    savedBreak = data.breakDuration || 300;
    document.getElementById("workTime").value  = savedWork;
    document.getElementById("breakTime").value = savedBreak;
    isPaused = !!data.isPaused;
    updatePauseBtn();
  });

  // Watch for input changes while timer is running
  document.getElementById("workTime").addEventListener("input",  onSettingChange);
  document.getElementById("breakTime").addEventListener("input", onSettingChange);

  // rAF loop for smooth countdown display
  function loop() { updateStatus(); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
});

// ─── Settings change detection ────────────────────────────────────────────────

function onSettingChange() {
  if (!timerIsRunning) return; // only matters when timer is active
  const w = Number(document.getElementById("workTime").value);
  const b = Number(document.getElementById("breakTime").value);
  // Changed if either value differs from what's saved in storage
  settingsChanged = (w !== savedWork || b !== savedBreak);
  updateStartBtn();
}

// ─── Start button state ───────────────────────────────────────────────────────
// Three states:
//   1. Idle (timer stopped)   → active green gradient, "Start Focus Session"
//   2. Running, no changes    → dimmed/disabled, "Session Running"
//   3. Running, settings changed → amber gradient, "Restart with New Settings"

function updateStartBtn() {
  const btn      = document.getElementById("startBtn");
  const btnText  = document.getElementById("startBtnText");
  if (!btn || !btnText) return;

  btn.classList.remove("is-running", "settings-changed");

  if (!timerIsRunning) {
    // Idle
    btnText.textContent = "Start Focus Session";
  } else if (settingsChanged) {
    // Running but user changed settings → invite restart
    btn.classList.add("settings-changed");
    btnText.textContent = "Restart with New Settings";
  } else {
    // Running, nothing changed → disabled
    btn.classList.add("is-running");
    btnText.textContent = "Session Running";
  }
}

// ─── Status display ──────────────────────────────────────────────────────────

let lastStatusKey = "";

function updateStatus() {
  chrome.storage.local.get(["isBreakActive", "isPaused", "pausedTimeLeft", "pausedAt"], (data) => {
    if (chrome.runtime.lastError) return;

    if (data.isBreakActive) {
      timerIsRunning = true;
      setStatus("red", "Break in progress", "");
      updateStartBtn();
      return;
    }

    if (data.isPaused) {
      timerIsRunning = false; // alarm is cleared while paused
      const stored = data.pausedTimeLeft || 0;
      const drift  = data.pausedAt ? (Date.now() - data.pausedAt) : 0;
      const ms     = Math.max(0, stored - drift);
      const key    = Math.floor(ms / 1000).toString();
      if (key !== lastStatusKey) {
        lastStatusKey = key;
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
        setStatus("orange", "Paused", `${m}:${s}`);
      }
      updateStartBtn();
      return;
    }

    chrome.alarms.get("breakAlarm", (alarm) => {
      if (alarm) {
        timerIsRunning = true;
        const ms  = Math.max(0, alarm.scheduledTime - Date.now());
        const key = Math.floor(ms / 1000).toString();
        if (key !== lastStatusKey) {
          lastStatusKey = key;
          const m = Math.floor(ms / 60000);
          const s = Math.floor((ms % 60000) / 1000).toString().padStart(2, "0");
          setStatus(m < 2 ? "orange" : "", "Next break in", `${m}:${s}`);
        }
      } else {
        timerIsRunning = false;
        if (lastStatusKey !== "stopped") {
          lastStatusKey = "stopped";
          setStatus("", "Timer stopped", "");
        }
      }
      updateStartBtn();
    });
  });
}

function setStatus(dotClass, label, time) {
  const dot   = document.getElementById("statusDot");
  const lbl   = document.getElementById("statusLabel");
  const timer = document.getElementById("timeLeft");
  if (dot)   dot.className    = "pill-dot " + (dotClass || "");
  if (lbl)   lbl.textContent  = label;
  if (timer) timer.textContent = time || "";
}

// ─── Pause button ─────────────────────────────────────────────────────────────

function updatePauseBtn() {
  const btn = document.getElementById("pauseBtn");
  if (!btn) return;
  if (isPaused) {
    btn.textContent       = "Resume";
    btn.style.background  = "rgba(48,209,88,0.2)";
    btn.style.color       = "#30d158";
    btn.style.borderColor = "rgba(48,209,88,0.35)";
  } else {
    btn.textContent       = "Pause";
    btn.style.background  = "";
    btn.style.color       = "";
    btn.style.borderColor = "";
  }
}

// ─── Button handlers ──────────────────────────────────────────────────────────

document.getElementById("startBtn").addEventListener("click", () => {
  const work = Number(document.getElementById("workTime").value)  || 25;
  const brk  = Number(document.getElementById("breakTime").value) || 300;
  // Save as new baseline so change-detection resets
  savedWork  = work;
  savedBreak = brk;
  settingsChanged  = false;
  chrome.storage.local.set({ workInterval: work, breakDuration: brk });
  chrome.runtime.sendMessage({ action: "startTimer", minutes: work });
  isPaused       = false;
  timerIsRunning = true;
  lastStatusKey  = "";
  updatePauseBtn();
  updateStartBtn();
});

document.getElementById("snoozeBtn").addEventListener("click", () => {
  const mins = Number(document.getElementById("snoozeTime").value) || 5;
  chrome.runtime.sendMessage({ action: "snooze", minutes: mins });
  isPaused       = false;
  timerIsRunning = true;
  lastStatusKey  = "";
  updatePauseBtn();
  updateStartBtn();
});

document.getElementById("pauseBtn").addEventListener("click", () => {
  if (isPaused) {
    chrome.runtime.sendMessage({ action: "resumeTimer" });
    isPaused = false;
  } else {
    chrome.runtime.sendMessage({ action: "pauseTimer" });
    isPaused = true;
  }
  lastStatusKey = "";
  updatePauseBtn();
});

document.getElementById("stopBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "stopTimer" });
  isPaused        = false;
  timerIsRunning  = false;
  settingsChanged = false;
  lastStatusKey   = "stopped";
  updatePauseBtn();
  updateStartBtn();
  setStatus("", "Timer stopped", "");
});