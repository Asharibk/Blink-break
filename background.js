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

function scheduleBadgeAlarm() {
  chrome.alarms.get("breakAlarm", (alarm) => {
    if (!alarm) return;
    const msLeft = Math.max(0, alarm.scheduledTime - Date.now());
    if (msLeft <= 0) return;
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
    // Notify all tabs so overlays are removed immediately
    sendToAllTabs("removeBreak");
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
    sendToAllTabs("removeBreak");
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

  if (msg.action === "ping") {
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
    // Write storage FIRST — content scripts read this as source of truth
    chrome.storage.local.set({
      isBreakActive: true, breakId,
      breakStartedAt: Date.now(), breakRoutineIndex: routineIndex
    }, () => {
      // CRITICAL FIX: After storage is committed, also send a direct message
      // to every alive tab as a fast path. Tabs whose context was killed by
      // Energy Saver / Memory Saver won't receive this, but their 1s poll
      // + visibilitychange will catch it the moment the user switches to them.
      sendToAllTabs("showBreak");
      chrome.action.setBadgeText({ text: "REST" });
      chrome.action.setBadgeBackgroundColor({ color: "#FF3B30" });
    });
  }

  if (alarm.name === "badgeUpdate") updateBadge();

});

// ─── Tab messaging ────────────────────────────────────────────────────────────
// Sends a best-effort message to all http/https tabs.
// Dead contexts silently fail — storage poll in content.js handles those.

function sendToAllTabs(action) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      if (!tab.id || !tab.url) return;
      if (!tab.url.startsWith("http://") && !tab.url.startsWith("https://")) return;
      chrome.tabs.sendMessage(tab.id, { action }, () => {
        void chrome.runtime.lastError; // silence dead-context errors
      });
    });
  });
}

// ─── Badge ────────────────────────────────────────────────────────────────────

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
        const msLeft    = Math.max(0, alarm.scheduledTime - Date.now());
        const totalSecs = Math.ceil(msLeft / 1000);
        const mins      = Math.floor(totalSecs / 60);
        const secs      = totalSecs % 60;
        const text      = mins < 10
          ? mins + ":" + secs.toString().padStart(2, "0")
          : mins + "m";
        chrome.action.setBadgeText({ text });
        chrome.action.setBadgeBackgroundColor({ color: mins < 2 ? "#FF9500" : "#34C759" });
      } else {
        chrome.action.setBadgeText({ text: "" });
      }
    });
  });
}