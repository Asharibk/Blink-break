// ─── BlinkBreak background.js ────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    isBreakActive: false, breakId: null,
    isPaused: false, pausedTimeLeft: null, pausedAt: null
  });
  chrome.action.setBadgeText({ text: "" });
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    isBreakActive: false, breakId: null,
    isPaused: false, pausedTimeLeft: null, pausedAt: null
  });
  chrome.action.setBadgeText({ text: "" });
  chrome.tabs.create({ url: chrome.runtime.getURL("welcome.html") });
});

// ─── Timer ───────────────────────────────────────────────────────────────────

function startTimer(minutes) {
  chrome.alarms.clearAll();
  chrome.storage.local.set({
    isBreakActive: false, isPaused: false,
    pausedTimeLeft: null, pausedAt: null
  });
  chrome.alarms.create("breakAlarm", { delayInMinutes: Number(minutes) });
  if (minutes >= 1.5) {
    chrome.alarms.create("breakWarning", { delayInMinutes: Number(minutes) - 1 });
  }
  scheduleBadgeAlarm();
}

// Schedule badge alarm to fire exactly at the next whole minute boundary
// so the countdown ticks mm:ss accurately rather than every ~60s
function scheduleBadgeAlarm() {
  chrome.alarms.get("breakAlarm", (alarm) => {
    if (!alarm) return;
    const msLeft = Math.max(0, alarm.scheduledTime - Date.now());
    if (msLeft <= 0) return;
    // Fire badge update every minute, aligned to when the alarm fires
    chrome.alarms.create("badgeUpdate", { periodInMinutes: 1 });
    updateBadge();
  });
}

// ─── Messages ────────────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {

  if (msg.action === "startTimer") startTimer(msg.minutes);

  if (msg.action === "stopTimer") {
    chrome.alarms.clearAll();
    chrome.storage.local.set({
      isBreakActive: false, isPaused: false,
      pausedTimeLeft: null, pausedAt: null, breakId: null
    });
    chrome.action.setBadgeText({ text: "" });
  }

  if (msg.action === "pauseTimer") {
    chrome.alarms.get("breakAlarm", (alarm) => {
      if (!alarm) return;
      const timeLeft = Math.max(0, alarm.scheduledTime - Date.now());
      chrome.alarms.clearAll();
      chrome.storage.local.set({ isPaused: true, pausedTimeLeft: timeLeft, pausedAt: Date.now() });
      chrome.action.setBadgeText({ text: "||" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF9500" });
    });
  }

  if (msg.action === "resumeTimer") {
    chrome.storage.local.get(["pausedTimeLeft"], (data) => {
      if (!data.pausedTimeLeft) return;
      chrome.storage.local.set({ isPaused: false, pausedTimeLeft: null, pausedAt: null });
      startTimer(Math.max(1 / 60, data.pausedTimeLeft / 60000));
    });
  }

  if (msg.action === "snooze") {
    chrome.storage.local.set({ isBreakActive: false, breakId: null });
    startTimer(msg.minutes);
  }

  if (msg.action === "breakFinished") {
    chrome.storage.local.get(["isBreakActive", "breakId"], (data) => {
      if (!data.isBreakActive) return;
      if (msg.breakId && data.breakId && msg.breakId !== data.breakId) return;
      chrome.storage.local.set({ isBreakActive: false, breakId: null });
      chrome.storage.local.get(["workInterval"], (d) => startTimer(d.workInterval || 25));
    });
  }

  // Content script pings background to confirm it's alive and get current state.
  // This is called by content.js on visibility/focus — forces a storage re-read
  // on the background side which re-triggers any pending state.
  if (msg.action === "ping") {
    chrome.storage.local.get(["isBreakActive", "breakId"], (data) => {
      // Just reading storage is enough — content script will call syncWithStorage itself
    });
    updateBadge();
  }
});

// ─── Alarms ──────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "breakWarning") {
    chrome.notifications.create({
      type: "basic", iconUrl: "icons/icon.png",
      title: "BlinkBreak", message: "Your break starts in 1 minute."
    });
  }

  if (alarm.name === "breakAlarm") {
    const breakId      = Date.now().toString();
    const routineIndex = Math.floor(Math.random() * 4);
    chrome.storage.local.set({
      isBreakActive: true, breakId,
      breakStartedAt: Date.now(), breakRoutineIndex: routineIndex
    });
    chrome.action.setBadgeText({ text: "REST" });
    chrome.action.setBadgeBackgroundColor({ color: "#FF3B30" });
  }

  if (alarm.name === "badgeUpdate") updateBadge();
});

// ─── Badge — updates every minute via alarm ───────────────────────────────────
// Badge shows mm:ss countdown. Chrome alarms fire every 1min minimum,
// so badge shows whole minutes (e.g. "24m", "3m").
// The popup shows exact mm:ss via its own rAF loop.

function updateBadge() {
  chrome.storage.local.get(["isBreakActive", "isPaused"], (data) => {
    if (data.isBreakActive) {
      chrome.action.setBadgeText({ text: "REST" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF3B30" });
      return;
    }
    if (data.isPaused) {
      chrome.action.setBadgeText({ text: "||" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF9500" });
      return;
    }
    chrome.alarms.get("breakAlarm", (alarm) => {
      if (alarm) {
        const msLeft = Math.max(0, alarm.scheduledTime - Date.now());
        const totalSecs = Math.ceil(msLeft / 1000);
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        // Show mm:ss when under 10 minutes, just Xm when longer
        let text;
        if (mins < 10) {
          text = mins + ":" + secs.toString().padStart(2, "0");
        } else {
          text = mins + "m";
        }
        chrome.action.setBadgeText({ text });
        chrome.action.setBadgeBackgroundColor({ color: mins < 2 ? "#FF9500" : "#34C759" });
      } else {
        chrome.action.setBadgeText({ text: "" });
      }
    });
  });
}