/**
 * Reads the current window/tab state. Tab groups are deliberately ignored:
 * one file per window, nothing else.
 */

/** Only real, linkable addresses. Skips about:, moz-extension:, view-source:, ... */
const SAVEABLE = /^(https?|ftp|file):/i;

export function isSaveable(url) {
  return typeof url === "string" && SAVEABLE.test(url);
}

/** Whether the user ticked "Run in Private Windows" for this extension. */
export async function isPrivateAccessAllowed() {
  try {
    return await browser.extension.isAllowedIncognitoAccess();
  } catch {
    return false;
  }
}

/**
 * @returns {Promise<Array<{id:number, incognito:boolean, tabs:Array<{url:string,title:string}>}>>}
 *   Normal windows that hold at least one saveable tab, in the order the
 *   browser reports them. That order is what decides which window becomes
 *   window1, window2, ... and it is not guaranteed to be stable.
 */
export async function collectWindows({ includePrivateWindows = false } = {}) {
  const allowPrivate = includePrivateWindows && (await isPrivateAccessAllowed());
  const windows = await browser.windows.getAll({ populate: true });

  return windows
    .filter((win) => win.type === "normal")
    .filter((win) => allowPrivate || !win.incognito)
    .map((win) => ({
      id: win.id,
      incognito: Boolean(win.incognito),
      tabs: (win.tabs || [])
        .filter((tab) => isSaveable(tab.url))
        .map((tab) => ({ url: tab.url, title: tab.title || "" })),
    }))
    .filter((win) => win.tabs.length > 0);
}
