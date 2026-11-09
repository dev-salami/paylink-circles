import { addDays, isoDate } from "../vendor/paylink-core";
import type { Frequency } from "./types";

export { addDays, isoDate };

export function parseIsoDay(day: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, date ?? 1));
}

export function addMonthsClamped(day: string, months: number): string {
  const start = parseIsoDay(day);
  const target = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(start.getUTCDate(), lastDay));
  return isoDate(target);
}

/** Payout date of ajo round `index` (0-based); round 0 pays out on the start date. */
export function roundDate(startDate: string, frequency: Frequency, index: number): string {
  if (frequency === "monthly") return addMonthsClamped(startDate, index);
  const step = frequency === "weekly" ? 7 : 14;
  return isoDate(addDays(parseIsoDay(startDate), step * index));
}

/** A share is overdue once its due day has fully passed (UTC). */
export function isOverdue(dueDate: string, now: Date): boolean {
  return now.getTime() >= parseIsoDay(dueDate).getTime() + 24 * 60 * 60 * 1000;
}

export function daysUntil(dueDate: string, now: Date): number {
  const today = parseIsoDay(isoDate(now)).getTime();
  return Math.round((parseIsoDay(dueDate).getTime() - today) / (24 * 60 * 60 * 1000));
}

export function formatDay(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(parseIsoDay(day));
}

export function formatDayLong(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    parseIsoDay(day),
  );
}
