// Helpers for "recent" sidebar links. Options live in the link target as a query string,
// e.g. "limit=10&newTab=true", so they persist without backend schema changes.

export const RECENT_LIMIT_OPTIONS = [5, 10, 15, 20];
export const RECENT_DEFAULT_LIMIT = 10;
export const RECENT_DEFAULT_ICON = "hourglass";

/**
 * @param {string | undefined} target
 * @returns {{ limit: number, newTab: boolean }}
 */
export function parseRecentTarget(target) {
  const params = new URLSearchParams(target || "");
  const limit = Number.parseInt(params.get("limit") || "", 10);
  return {
    limit: RECENT_LIMIT_OPTIONS.includes(limit) ? limit : RECENT_DEFAULT_LIMIT,
    newTab: params.get("newTab") === "true",
  };
}

/**
 * @param {{ limit?: number, newTab?: boolean }} options
 * @returns {string}
 */
export function buildRecentTarget({ limit = RECENT_DEFAULT_LIMIT, newTab = false } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (newTab) {
    params.set("newTab", "true");
  }
  return params.toString();
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function capitalize(text, locale) {
  return text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
}

/**
 * Whole calendar days between the day a file was opened and today (0 = today).
 * @param {number} openedAt Unix seconds
 * @param {Date} now
 */
export function daysAgo(openedAt, now = new Date()) {
  const opened = startOfDay(new Date(openedAt * 1000));
  return Math.round((startOfDay(now).getTime() - opened.getTime()) / DAY_MS);
}

/**
 * Groups files (newest first) under day headings: today, yesterday, the weekday
 * for the rest of the past week, then month (and year when not this year).
 * Labels come from Intl, so they follow the user's language without translations.
 * @param {Array<{ openedAt: number }>} files
 * @param {string} locale
 * @param {Date} now
 * @returns {Array<{ key: string, label: string, files: any[] }>}
 */
export function groupRecentFiles(files, locale = "en", now = new Date()) {
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "long" });
  const groups = [];
  for (const file of files) {
    const days = daysAgo(file.openedAt, now);
    const opened = new Date(file.openedAt * 1000);
    let key;
    let label;
    if (days <= 1) {
      key = `day-${days}`;
      label = relative.format(-Math.max(days, 0), "day");
    } else if (days < 7) {
      key = `day-${days}`;
      label = weekday.format(opened);
    } else {
      const sameYear = opened.getFullYear() === now.getFullYear();
      key = `month-${opened.getFullYear()}-${opened.getMonth()}`;
      label = new Intl.DateTimeFormat(locale, sameYear ? { month: "long" } : { month: "long", year: "numeric" }).format(opened);
    }
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.files.push(file);
    } else {
      groups.push({ key, label: capitalize(label, locale), files: [file] });
    }
  }
  return groups;
}

/**
 * Short time shown next to a file: the time of day for the past week, the date before that.
 * @param {number} openedAt Unix seconds
 * @param {string} locale
 * @param {Date} now
 */
export function formatOpenedTime(openedAt, locale = "en", now = new Date()) {
  const opened = new Date(openedAt * 1000);
  if (daysAgo(openedAt, now) < 7) {
    return new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(opened);
  }
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(opened);
}

/**
 * Parent folder of a file path, without leading/trailing slashes ("" for the source root).
 * @param {string} path
 */
export function parentFolder(path) {
  const parts = (path || "").split("/").filter(Boolean);
  parts.pop();
  return parts.join("/");
}
