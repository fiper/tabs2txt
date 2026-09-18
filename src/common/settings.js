/**
 * Single source of truth for everything the extension remembers.
 * Stored in browser.storage.local so it stays on this machine.
 */

export const ALARM_NAME = "tabs-to-txt-tick";

export const MIN_INTERVAL_MINUTES = 1;
export const MAX_INTERVAL_MINUTES = 1440; // 24 h

export const DEFAULTS = Object.freeze({
  // Pause / resume, toggled from the toolbar popup.
  enabled: true,
  // How often a backup is written, in minutes.
  intervalMinutes: 15,
  // Folder inside the browser's download directory. "" writes to its root.
  folder: "tab-backups",
  // Prefix for each file: window1_..., window2_...
  filePrefix: "window",
  // Write the tab title above each URL as a "# comment" line.
  includeTitles: false,
  // Write a small header with the date and window number.
  includeHeader: true,
  // Skip a run when no tab has changed since the previous one.
  skipUnchanged: true,
  // Also back up private windows (needs "Run in Private Windows" enabled).
  includePrivateWindows: false,
  // Remove the entries from the Downloads list once written (files are kept).
  hideFromDownloadHistory: true,

  // Run state — written by the background script, read by the UI.
  lastRunAt: null,
  lastRunFiles: 0,
  lastRunSkipped: false,
  lastError: null,
  lastSignature: null,
});

const RUN_STATE_KEYS = [
  "lastRunAt",
  "lastRunFiles",
  "lastRunSkipped",
  "lastError",
  "lastSignature",
];

/** Clamp and coerce whatever is in storage into something usable. */
export function normalize(raw = {}) {
  const merged = { ...DEFAULTS, ...raw };
  const interval = Number(merged.intervalMinutes);

  return {
    ...merged,
    enabled: Boolean(merged.enabled),
    intervalMinutes: Number.isFinite(interval)
      ? Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, Math.round(interval)))
      : DEFAULTS.intervalMinutes,
    folder: String(merged.folder ?? ""),
    filePrefix: String(merged.filePrefix || DEFAULTS.filePrefix),
    includeTitles: Boolean(merged.includeTitles),
    includeHeader: Boolean(merged.includeHeader),
    skipUnchanged: Boolean(merged.skipUnchanged),
    includePrivateWindows: Boolean(merged.includePrivateWindows),
    hideFromDownloadHistory: Boolean(merged.hideFromDownloadHistory),
  };
}

export async function getSettings() {
  const raw = await browser.storage.local.get(Object.keys(DEFAULTS));
  return normalize(raw);
}

/** Merge a partial update into storage. */
export async function patchSettings(patch) {
  await browser.storage.local.set(patch);
}

/** Reset the user-facing preferences, keeping the run state intact. */
export async function resetSettings() {
  const preferences = { ...DEFAULTS };
  for (const key of RUN_STATE_KEYS) delete preferences[key];
  await browser.storage.local.set(preferences);
}

/** True when a storage change touched something the scheduler cares about. */
export function affectsSchedule(changes) {
  return (
    Object.prototype.hasOwnProperty.call(changes, "enabled") ||
    Object.prototype.hasOwnProperty.call(changes, "intervalMinutes")
  );
}
