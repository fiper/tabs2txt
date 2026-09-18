import {
  DEFAULTS,
  MAX_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  getSettings,
  patchSettings,
  resetSettings,
} from "../common/settings.js";
import { buildFilename, formatStamp, sanitizeFolder } from "../common/naming.js";
import { collectWindows, isPrivateAccessAllowed } from "../common/tabs.js";

const TEXT_FIELDS = ["folder", "filePrefix"];
const CHECK_FIELDS = [
  "includeHeader",
  "includeTitles",
  "skipUnchanged",
  "includePrivateWindows",
  "hideFromDownloadHistory",
];

const el = (id) => document.querySelector(`#${id}`);
const form = el("form");
const interval = el("intervalMinutes");
const preview = el("preview");
const previewRoot = el("preview-root");
const feedback = el("feedback");
const status = el("status");
const privateHint = el("private-hint");

let windowsSnapshot = [];
let feedbackTimer = null;

// ------------------------------------------------------------ form <-> storage

function readForm() {
  const values = { intervalMinutes: Number(interval.value) };
  for (const id of TEXT_FIELDS) values[id] = el(id).value;
  for (const id of CHECK_FIELDS) values[id] = el(id).checked;
  return values;
}

function fillForm(settings) {
  interval.value = settings.intervalMinutes;
  for (const id of TEXT_FIELDS) el(id).value = settings[id];
  for (const id of CHECK_FIELDS) el(id).checked = settings[id];
}

function validInterval() {
  const value = Number(interval.value);
  const ok =
    Number.isFinite(value) && value >= MIN_INTERVAL_MINUTES && value <= MAX_INTERVAL_MINUTES;
  interval.setAttribute("aria-invalid", String(!ok));
  return ok;
}

function say(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle("actions__feedback--error", isError);
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    feedback.textContent = "";
  }, 4000);
}

// ------------------------------------------------------------------- preview

function renderPreview() {
  const values = readForm();
  const folder = sanitizeFolder(values.folder);
  const stamp = formatStamp(new Date());

  previewRoot.textContent = folder
    ? `Inside your download folder, in “${folder}”.`
    : "Straight into your download folder.";

  preview.replaceChildren();

  if (windowsSnapshot.length === 0) {
    const empty = document.createElement("li");
    empty.className = "preview__empty";
    empty.textContent = "No window holds a saveable link right now.";
    preview.append(empty);
    return;
  }

  windowsSnapshot.forEach((win, position) => {
    const item = document.createElement("li");
    item.className = "preview__item";

    const name = document.createElement("span");
    name.textContent = buildFilename({
      folder,
      prefix: values.filePrefix,
      index: position + 1,
      total: windowsSnapshot.length,
      stamp,
    });

    const count = document.createElement("span");
    count.className = "preview__count";
    count.textContent = `${win.tabs.length} ${win.tabs.length === 1 ? "link" : "links"}`;

    item.append(name, count);
    preview.append(item);
  });
}

async function refreshSnapshot() {
  const values = readForm();
  windowsSnapshot = await collectWindows({ includePrivateWindows: values.includePrivateWindows });
  renderPreview();
}

// -------------------------------------------------------------------- status

function renderStatus(settings) {
  if (settings.lastError) {
    status.className = "status status--error";
    status.textContent = `Last backup failed: ${settings.lastError}`;
    return;
  }

  status.className = "status";

  if (!settings.lastRunAt) {
    status.textContent = "No backup written yet.";
    return;
  }

  const when = new Date(settings.lastRunAt).toLocaleString();
  status.textContent = settings.lastRunSkipped
    ? `Last check ${when} — skipped, nothing had changed.`
    : `Last backup ${when} — ${settings.lastRunFiles} file${settings.lastRunFiles === 1 ? "" : "s"}.`;
}

async function renderPrivateHint() {
  const allowed = await isPrivateAccessAllowed();
  if (allowed) {
    privateHint.className = "field__hint";
    privateHint.textContent = "Private windows are visible to this extension.";
  } else {
    privateHint.className = "field__hint field__hint--warn";
    privateHint.textContent =
      "Turn on “Run in Private Windows” for this extension first, otherwise private windows stay invisible.";
  }
}

// ------------------------------------------------------------------- events

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validInterval()) {
    say(`Use a number between ${MIN_INTERVAL_MINUTES} and ${MAX_INTERVAL_MINUTES}.`, true);
    return;
  }

  await patchSettings(readForm());
  say("Saved.");
  await refreshSnapshot();
});

el("backup-now").addEventListener("click", async () => {
  const result = await browser.runtime.sendMessage({ type: "backup-now" });

  if (result?.error) say(result.error, true);
  else if (result?.skipped) say("Skipped — nothing had changed.");
  else say(`Wrote ${result?.files ?? 0} file${result?.files === 1 ? "" : "s"}.`);

  renderStatus(await getSettings());
});

el("reset").addEventListener("click", async () => {
  await resetSettings();
  fillForm({ ...DEFAULTS });
  say("Defaults restored.");
  await refreshSnapshot();
});

form.addEventListener("input", (event) => {
  if (event.target.id === "includePrivateWindows") refreshSnapshot();
  else renderPreview();
});

// The file name carries the exact second, so keep the preview honest.
setInterval(renderPreview, 1000);

async function init() {
  const settings = await getSettings();
  fillForm(settings);
  renderStatus(settings);
  await renderPrivateHint();
  await refreshSnapshot();
}

init();
