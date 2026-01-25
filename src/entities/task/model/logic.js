
export function safeRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function clampInt(v, { min = 0, max = 10_000 } = {}) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function parseTimeToMinutes(timeStr) {
  // "HH:MM" -> minutes from midnight
  if (!timeStr || typeof timeStr !== "string") return null;
  const m = timeStr.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export function isBedtimeValid(timeStr) {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return false;

  // строго > 14:00 (1140), и строго < 23:59 (1439)
  return mins > 14 * 60 && mins < (23 * 60 + 59);
}

export function dateAtTodayMinutes(minsFromMidnight) {
  const d = new Date();
  const hh = Math.floor(minsFromMidnight / 60);
  const mm = minsFromMidnight % 60;
  d.setHours(hh, mm, 0, 0);
  return d;
}

export function formatDurationMs(ms) {
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);

  const totalSeconds = Math.floor(abs / 1000);
  const s = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const m = totalMinutes % 60;
  const h = Math.floor(totalMinutes / 60);

  const pad2 = (x) => String(x).padStart(2, "0");
  return `${sign}${pad2(h)}:${pad2(m)}:${pad2(s)}`;
}

export function taskTimerMs(task, nowMs) {
  const acc = typeof task.timerAccumulatedMs === "number" ? task.timerAccumulatedMs : 0;

  if (task.timerRunning && typeof task.timerStartedAtMs === "number") {
    return acc + Math.max(0, nowMs - task.timerStartedAtMs);
  }

  return acc;
}

export function msToMinutesCeil(ms) {
  // 0..∞, округляем вверх, чтобы 1 секунда не превращалась в 0 минут
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60000);
}

export function stopTimerFields(task, nowMs) {
  if (!task.timerRunning || typeof task.timerStartedAtMs !== "number") {
    return task;
  }

  const elapsed = Math.max(0, nowMs - task.timerStartedAtMs);
  const acc = (typeof task.timerAccumulatedMs === "number" ? task.timerAccumulatedMs : 0) + elapsed;

  return {
    ...task,
    timerRunning: false,
    timerStartedAtMs: null,
    timerAccumulatedMs: acc,

    // фактическое время теперь из таймера (можно потом руками поправить через Edit)
    actualMin: msToMinutesCeil(acc),
  };
}

