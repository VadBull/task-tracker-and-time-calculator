import { dateAtTodayMinutes, isBedtimeValid, parseTimeToMinutes } from "./logic";

export function getBedtimeMinutes(bedtime) {
  if (!isBedtimeValid(bedtime)) return null;
  return parseTimeToMinutes(bedtime);
}

export function getSums(tasks) {
  let plannedNotDone = 0;
  let actualDone = 0;

  for (const t of tasks) {
    if (t.done) {
      const fact = t.actualMin === null || t.actualMin === undefined ? 0 : t.actualMin;
      actualDone += fact;
    } else {
      plannedNotDone += t.plannedMin;
    }
  }

  return {
    plannedNotDoneMin: plannedNotDone,
    actualDoneMin: actualDone,
    totalWorkMin: plannedNotDone,
  };
}

export function getTimeUntilBedMs(bedtimeMinutes, nowMs) {
  if (bedtimeMinutes === null) return null;
  const bedDate = dateAtTodayMinutes(bedtimeMinutes);
  return bedDate.getTime() - nowMs;
}

export function getBufferMs(timeUntilBedMs, totalWorkMin) {
  if (timeUntilBedMs === null) return null;
  return timeUntilBedMs - totalWorkMin * 60_000;
}

export function getCompletionAtMs(nowMs, totalWorkMin) {
  return nowMs + totalWorkMin * 60_000;
}

export function getBedtimeDateMs(bedtimeMinutes) {
  if (bedtimeMinutes === null) return null;
  return dateAtTodayMinutes(bedtimeMinutes).getTime();
}

export function getProgress(timeUntilBedMs, totalWorkMin) {
  if (timeUntilBedMs === null) return null;

  const denom = Math.max(1, timeUntilBedMs);
  const busy = (totalWorkMin * 60_000) / denom;
  const pct = Math.round(Math.max(0, Math.min(1.5, busy)) * 100);
  return pct;
}

export function hasDoneWithoutActual(tasks) {
  return tasks.some((t) => t.done && (t.actualMin === null || t.actualMin === undefined));
}
