/**
 * Background event page.
 *
 * Firefox MV3 uses a non-persistent event page, so every listener is
 * registered at the top level and all state lives in browser.storage.local.
 */

import { ALARM_NAME, affectsSchedule, getSettings, patchSettings } from "../common/settings.js";
import { buildFilename, formatStamp, renderFile, signature } from "../common/naming.js";
import { collectWindows } from "../common/tabs.js";

const BADGE_PAUSED = "OFF";
const COLOR_PAUSED = "#5d6470";

/** Blob URLs waiting for their download to finish, so they can be released. */
const pendingUrls = new Map();

// ---------------------------------------------------------------- badge

async function paintBadge(enabled) {
  try {
    await browser.action.setBadgeText({ text: enabled ? "" : BADGE_PAUSED });
    await browser.action.setBadgeBackgroundColor({ color: COLOR_PAUSED });
    await browser.action.setBadgeTextColor({ color: "#ffffff" });
    await browser.action.setTitle({
      title: enabled ? "Tabs to TXT — automatic backup on" : "Tabs to TXT — paused",
    });
  } catch (error) {
    console.warn("Could not update the toolbar badge", error);
  }
}

// ------------------------------------------------------------ scheduling

/** Recreate the alarm from the current settings. Resets the countdown. */
async function reschedule() {
  const settings = await getSettings();
  await browser.alarms.clear(ALARM_NAME);

  if (settings.enabled) {
    browser.alarms.create(ALARM_NAME, {
      periodInMinutes: settings.intervalMinutes,
      delayInMinutes: settings.intervalMinutes,
    });
  }

  await paintBadge(settings.enabled);
}

/**
 * Create the alarm only if it is missing. Called when the event page wakes up:
 * recreating it unconditionally would push the next run further away every
 * time the page is loaded.
 */
async function ensureSchedule() {
  const settings = await getSettings();
  await paintBadge(settings.enabled);

  if (!settings.enabled) {
    await browser.alarms.clear(ALARM_NAME);
    return;
  }

  const existing = await browser.alarms.get(ALARM_NAME);
  if (!existing) await reschedule();
}

// --------------------------------------------------------------- writing

async function writeFile(filename, text, settings) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    const downloadId = await browser.downloads.download({
      url,
      filename,
      conflictAction: "uniquify",
      saveAs: false,
    });
    pendingUrls.set(downloadId, { url, erase: settings.hideFromDownloadHistory });
    return downloadId;
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/**
 * Take a snapshot and write one .txt per window.
 * @returns {Promise<{files:number, skipped:boolean, windows:number}>}
 */
async function runBackup() {
  const settings = await getSettings();
  const windows = await collectWindows(settings);

  if (windows.length === 0) {
    await patchSettings({
      lastRunAt: Date.now(),
      lastRunFiles: 0,
      lastRunSkipped: true,
      lastError: null,
    });
    return { files: 0, skipped: true, windows: 0 };
  }

  const snapshot = signature(windows);
  if (settings.skipUnchanged && snapshot === settings.lastSignature) {
    await patchSettings({
      lastRunAt: Date.now(),
      lastRunFiles: 0,
      lastRunSkipped: true,
      lastError: null,
    });
    return { files: 0, skipped: true, windows: windows.length };
  }

  const date = new Date();
  const stamp = formatStamp(date);
  let written = 0;

  for (const [position, win] of windows.entries()) {
    const index = position + 1;
    const filename = buildFilename({
      folder: settings.folder,
      prefix: settings.filePrefix,
      index,
      total: windows.length,
      stamp,
    });
    const text = renderFile({
      tabs: win.tabs,
      index,
      total: windows.length,
      date,
      includeHeader: settings.includeHeader,
      includeTitles: settings.includeTitles,
    });

    await writeFile(filename, text, settings);
    written += 1;
  }

  await patchSettings({
    lastRunAt: date.getTime(),
    lastRunFiles: written,
    lastRunSkipped: false,
    lastError: null,
    lastSignature: snapshot,
  });

  return { files: written, skipped: false, windows: windows.length };
}

async function runBackupSafely() {
  try {
    return await runBackup();
  } catch (error) {
    const message = error?.message ? String(error.message) : String(error);
    console.error("Backup failed", error);
    await patchSettings({
      lastRunAt: Date.now(),
      lastRunFiles: 0,
      lastRunSkipped: false,
      lastError: message,
    });
    return { files: 0, skipped: false, error: message };
  }
}

// -------------------------------------------------------------- listeners

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) runBackupSafely();
});

browser.downloads.onChanged.addListener((delta) => {
  if (!delta.state || delta.state.current === "in_progress") return;

  const pending = pendingUrls.get(delta.id);
  if (!pending) return;

  URL.revokeObjectURL(pending.url);
  pendingUrls.delete(delta.id);

  // Keep the Downloads panel usable: drop the entry, never the file.
  if (pending.erase && delta.state.current === "complete") {
    browser.downloads.erase({ id: delta.id }).catch(() => {});
  }
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (affectsSchedule(changes)) reschedule();
});

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "backup-now") return runBackupSafely();
  return undefined;
});

browser.runtime.onInstalled.addListener(() => reschedule());
browser.runtime.onStartup.addListener(() => reschedule());

ensureSchedule();
