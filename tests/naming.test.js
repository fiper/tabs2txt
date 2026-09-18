import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildFilename,
  formatStamp,
  renderFile,
  sanitizeFolder,
  sanitizePrefix,
  signature,
} from "../src/common/naming.js";

describe("formatStamp", () => {
  it("pads every part and keeps seconds", () => {
    assert.equal(formatStamp(new Date(2026, 0, 5, 9, 7, 3)), "2026-01-05_09-07-03");
  });
});

describe("sanitizeFolder", () => {
  it("keeps a plain nested path", () => {
    assert.equal(sanitizeFolder("backups/firefox"), "backups/firefox");
  });

  it("normalises backslashes", () => {
    assert.equal(sanitizeFolder("backups\\firefox"), "backups/firefox");
  });

  it("drops back-references and absolute roots", () => {
    assert.equal(sanitizeFolder("../../etc"), "etc");
    assert.equal(sanitizeFolder("/var/tmp"), "var/tmp");
  });

  it("strips characters the file system rejects", () => {
    assert.equal(sanitizeFolder('ta:b*s?"/<x>|'), "tabs/x");
  });

  it("strips leading and trailing dots, which Firefox rejects", () => {
    assert.equal(sanitizeFolder(".hidden/trailing."), "hidden/trailing");
  });

  it("caps the depth", () => {
    assert.equal(sanitizeFolder("a/b/c/d/e/f"), "a/b/c/d");
  });

  it("returns an empty string for nothing usable", () => {
    assert.equal(sanitizeFolder("   "), "");
    assert.equal(sanitizeFolder(".."), "");
  });
});

describe("sanitizePrefix", () => {
  it("falls back to the default when emptied", () => {
    assert.equal(sanitizePrefix("  "), "window");
  });

  it("replaces spaces and slashes with dashes", () => {
    assert.equal(sanitizePrefix("my window/set"), "my-window-set");
  });

  it("never starts the file name with a dot", () => {
    assert.equal(sanitizePrefix(".hidden"), "hidden");
  });
});

describe("buildFilename", () => {
  const stamp = "2026-09-18_14-03-27";

  it("joins folder, prefix, index and stamp", () => {
    assert.equal(
      buildFilename({ folder: "tab-backups", prefix: "window", index: 2, total: 3, stamp }),
      "tab-backups/window2_2026-09-18_14-03-27.txt",
    );
  });

  it("writes to the download root when no folder is set", () => {
    assert.equal(
      buildFilename({ folder: "", prefix: "window", index: 1, total: 1, stamp }),
      "window1_2026-09-18_14-03-27.txt",
    );
  });

  it("pads the index so files sort naturally past nine windows", () => {
    assert.equal(
      buildFilename({ folder: "", prefix: "window", index: 7, total: 12, stamp }),
      "window07_2026-09-18_14-03-27.txt",
    );
  });
});

describe("renderFile", () => {
  const tabs = [
    { url: "https://example.com/", title: "Example" },
    { url: "https://mozilla.org/", title: "Mozilla\nhome" },
  ];
  const date = new Date(2026, 8, 18, 14, 3, 27);

  it("writes one URL per line with no header", () => {
    const text = renderFile({ tabs, index: 1, total: 1, date, includeHeader: false });
    assert.equal(text, "https://example.com/\nhttps://mozilla.org/\n");
  });

  it("writes a header with the date and window number", () => {
    const text = renderFile({ tabs, index: 2, total: 4, date });
    const lines = text.split("\n");
    assert.equal(lines[0], "# Tabs to TXT — saved 2026-09-18 14:03:27");
    assert.equal(lines[1], "# Window 2 of 4 — 2 tabs");
    assert.equal(lines[2], "");
  });

  it("puts titles on their own comment line, newlines flattened", () => {
    const text = renderFile({ tabs, date, includeHeader: false, includeTitles: true });
    assert.equal(text, "# Example\nhttps://example.com/\n# Mozilla home\nhttps://mozilla.org/\n");
  });
});

describe("signature", () => {
  const a = { tabs: [{ url: "https://a.test/" }] };
  const b = { tabs: [{ url: "https://b.test/" }] };

  it("ignores the order of the windows", () => {
    assert.equal(signature([a, b]), signature([b, a]));
  });

  it("changes when a tab changes", () => {
    assert.notEqual(signature([a]), signature([b]));
  });
});
