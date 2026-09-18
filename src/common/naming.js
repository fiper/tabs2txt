/**
 * Pure helpers for turning a snapshot of windows into file names and file
 * bodies. No browser APIs in here, which is what makes it unit testable.
 */

const MAX_FOLDER_DEPTH = 4;
const ILLEGAL_CHARS = /[<>:"|?*\u0000-\u001f\\]/g;

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

/** "2026-09-18_14-03-27" — local time, seconds included. */
export function formatStamp(date = new Date()) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`
  );
}

/** "2026-09-18 14:03:27" — for the header line inside the file. */
export function formatHuman(date = new Date()) {
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * downloads.download() only accepts a path relative to the browser's download
 * directory: no absolute paths, no "..", no segments that start or end with a
 * dot. Anything the user types has to survive that.
 */
export function sanitizeFolder(input = "") {
  const segments = String(input)
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) =>
      segment
        .replace(ILLEGAL_CHARS, "")
        .trim()
        .replace(/^\.+|\.+$/g, "")
        .trim(),
    )
    .filter((segment) => segment.length > 0 && segment !== "." && segment !== "..");

  return segments.slice(0, MAX_FOLDER_DEPTH).join("/");
}

export function sanitizePrefix(input = "window") {
  const cleaned = String(input)
    .replace(ILLEGAL_CHARS, "")
    .trim()
    .replace(/[/\s]+/g, "-")
    .replace(/^[-.]+/, "")
    .replace(/-+$/, "");
  return cleaned.length > 0 ? cleaned.slice(0, 40) : "window";
}

/**
 * "tab-backups/window1_2026-09-18_14-03-27.txt"
 * The index is padded once there are 10+ windows so files sort naturally.
 */
export function buildFilename({ folder = "", prefix = "window", index = 1, total = 1, stamp }) {
  const width = String(Math.max(total, 1)).length;
  const name = `${sanitizePrefix(prefix)}${pad(index, width)}_${stamp}.txt`;
  const dir = sanitizeFolder(folder);
  return dir ? `${dir}/${name}` : name;
}

function commentLine(text) {
  return `# ${String(text)
    .replace(/[\r\n]+/g, " ")
    .trim()}`;
}

/** The text that ends up inside one .txt file. */
export function renderFile({
  tabs,
  index = 1,
  total = 1,
  date = new Date(),
  includeHeader = true,
  includeTitles = false,
}) {
  const lines = [];

  if (includeHeader) {
    lines.push(commentLine(`Tabs to TXT — saved ${formatHuman(date)}`));
    lines.push(
      commentLine(
        `Window ${index} of ${total} — ${tabs.length} tab${tabs.length === 1 ? "" : "s"}`,
      ),
    );
    lines.push("");
  }

  for (const tab of tabs) {
    if (includeTitles && tab.title) lines.push(commentLine(tab.title));
    lines.push(tab.url);
  }

  return `${lines.join("\n")}\n`;
}

/**
 * A stable fingerprint of a whole snapshot, used to skip a run when nothing
 * changed. Window order is sorted out so that reordering windows alone does
 * not count as a change.
 */
export function signature(windows) {
  return windows
    .map((win) => win.tabs.map((tab) => tab.url).join("\n"))
    .sort()
    .join("\n----\n");
}
