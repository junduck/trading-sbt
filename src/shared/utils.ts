import type { TimeRep } from "../schema/data-source.schema.js";
import { getTimezoneOffset } from "date-fns-tz";

export function serverTime(): Date {
  return new Date();
}

/**
 * Convert epoch time to Date based on TimeRep configuration.
 * @param epoch Epoch time
 * @param rep Time representation config with epochUnit and timezone
 * @returns Date object
 *
 * @notes if epochUnit is "days", returns Date at midnight in specified timezone
 */
export function toDate(epoch: number, rep: TimeRep): Date {
  switch (rep.epochUnit) {
    case "s":
      return new Date(epoch * 1000);
    case "ms":
      return new Date(epoch);
    case "us":
      return new Date(epoch / 1000);
    case "days":
      const ms = epoch * 86400 * 1000;
      // if days, time is now days since epoch in specified timezone, get offset from Date(ms) to handle potential DST
      const offsetMs = getTimezoneOffset(rep.timezone, new Date(ms));
      return new Date(ms - offsetMs);
  }
}

/**
 * Convert Date to epoch time based on TimeRep configuration.
 * @param date Date object
 * @param rep Time representation config with epochUnit and timezone
 * @returns Epoch time
 *
 * @notes if epochUnit is "days", returns days since "local epoch" (1970-01-01 local midnight) in specified timezone
 */
export function toEpoch(date: Date, rep: TimeRep): number {
  switch (rep.epochUnit) {
    case "s":
      return Math.floor(date.getTime() / 1000);
    case "ms":
      return date.getTime();
    case "us":
      return date.getTime() * 1000;
    case "days":
      // if days, return days since epoch in specified timezone
      const offsetMs = getTimezoneOffset(rep.timezone, date);
      return Math.floor((date.getTime() + offsetMs) / (86400 * 1000));
  }
}

export function convertEpoch(
  epoch: number,
  from: TimeRep,
  to: TimeRep
): number {
  const date = toDate(epoch, from);
  return toEpoch(date, to);
}
