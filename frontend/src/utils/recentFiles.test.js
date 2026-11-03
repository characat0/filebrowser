import { describe, expect, it } from "vitest";
import {
  buildRecentTarget,
  daysAgo,
  formatOpenedTime,
  groupRecentFiles,
  parentFolder,
  parseRecentTarget,
  RECENT_DEFAULT_LIMIT,
} from "./recentFiles.js";

// Local-time dates so the day math matches the browser's calendar.
const now = new Date(2026, 10, 3, 15, 0, 0); // Tue 3 Nov 2026, 15:00
const at = (...args) => Math.floor(new Date(...args).getTime() / 1000);

describe("recent link target", () => {
  it("round-trips limit and newTab", () => {
    const target = buildRecentTarget({ limit: 15, newTab: true });
    expect(parseRecentTarget(target)).toEqual({ limit: 15, newTab: true });
  });

  it("falls back to defaults for empty or unknown values", () => {
    expect(parseRecentTarget("")).toEqual({ limit: RECENT_DEFAULT_LIMIT, newTab: false });
    expect(parseRecentTarget("limit=7&newTab=yes")).toEqual({ limit: RECENT_DEFAULT_LIMIT, newTab: false });
  });
});

describe("groupRecentFiles", () => {
  it("groups by today, yesterday, weekday, then month", () => {
    const files = [
      { path: "/a", openedAt: at(2026, 10, 3, 14, 30) },
      { path: "/b", openedAt: at(2026, 10, 3, 9, 0) },
      { path: "/c", openedAt: at(2026, 10, 2, 20, 0) },
      { path: "/d", openedAt: at(2026, 9, 30, 10, 0) }, // Fri 30 Oct
      { path: "/e", openedAt: at(2026, 9, 12, 10, 0) },
      { path: "/f", openedAt: at(2025, 11, 24, 10, 0) },
    ];
    const groups = groupRecentFiles(files, "en", now);
    expect(groups.map((g) => g.label)).toEqual(["Today", "Yesterday", "Friday", "October", "December 2025"]);
    expect(groups[0].files.map((f) => f.path)).toEqual(["/a", "/b"]);
  });
});

describe("formatting", () => {
  it("shows the time for the past week and the date before that", () => {
    // ICU may use a narrow no-break space before "PM".
    expect(formatOpenedTime(at(2026, 10, 3, 14, 30), "en", now)).toMatch(/^2:30\sPM$/);
    expect(formatOpenedTime(at(2026, 9, 12, 10, 0), "en", now)).toBe("Oct 12");
  });

  it("counts calendar days, not 24h periods", () => {
    expect(daysAgo(at(2026, 10, 2, 23, 59), now)).toBe(1);
    expect(daysAgo(at(2026, 10, 3, 0, 1), now)).toBe(0);
  });

  it("returns the parent folder without slashes", () => {
    expect(parentFolder("/Arenales/Alquiler/Contrato.docx")).toBe("Arenales/Alquiler");
    expect(parentFolder("/top.txt")).toBe("");
  });
});
