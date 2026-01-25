// ===== BACKEND API =====
// По умолчанию ходим в локальный backend, но даём переопределить через Vite env.
const DEFAULT_HOST =
  typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "localhost";
const API_BASE = import.meta.env.VITE_API_BASE || `http://${DEFAULT_HOST}:3001`;
const WS_BASE = import.meta.env.VITE_WS_BASE || API_BASE.replace(/^http/, "ws");

const STORAGE_KEY = "sleep_tasks_v1";

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

async function safeReadJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function loadSharedState() {
  const res = await fetch(`${API_BASE}/state`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const txt = await safeReadText(res);
    throw new Error(`loadSharedState failed: ${res.status} ${txt}`);
  }

  const json = await safeReadJson(res);
  if (!json || typeof json !== "object") {
    throw new Error("loadSharedState failed: invalid JSON");
  }

  return json;
}

export async function saveSharedState(state) {
  console.log("Saving state to backend:", `${API_BASE}/state`, state);
  const res = await fetch(`${API_BASE}/state`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(state),
  });

  if (!res.ok) {
    const txt = await safeReadText(res);
    throw new Error(`saveSharedState failed: ${res.status} ${txt}`);
  }
  return true;
}

export function connectSharedState(onState) {
  const ws = new WebSocket(WS_BASE);

  const handler = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      if (parsed?.type === "state") {
        onState(parsed.payload);
      }
    } catch {
      // ignore broken event
    }
  };

  ws.addEventListener("message", handler);

  return () => {
    try {
      ws.removeEventListener("message", handler);
      ws.close();
    } catch {
      // ignore
    }
  };
}

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

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const bedtime = typeof parsed.bedtime === "string" ? parsed.bedtime : "22:30";
    const tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];

    const normalizedTasks = tasks
      .filter((t) => t && typeof t === "object")
      .map((t) => ({
        id: typeof t.id === "string" ? t.id : safeRandomId(),
        title: typeof t.title === "string" ? t.title : "",
        plannedMin: clampInt(t.plannedMin, { min: 1, max: 10_000 }),
        actualMin:
          t.actualMin === null || t.actualMin === undefined
            ? null
            : clampInt(t.actualMin, { min: 0, max: 10_000 }),
        done: Boolean(t.done),
        createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
        updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),

        timerRunning: Boolean(t.timerRunning),
        timerStartedAtMs: typeof t.timerStartedAtMs === "number" ? t.timerStartedAtMs : null,
        timerAccumulatedMs: typeof t.timerAccumulatedMs === "number" ? t.timerAccumulatedMs : 0,
      }))
      .filter((t) => t.title.trim().length > 0);

    const updatedAt =
      typeof parsed.updatedAt === "number" && Number.isFinite(parsed.updatedAt) ? parsed.updatedAt : Date.now();

    return { bedtime, tasks: normalizedTasks, updatedAt };
  } catch {
    return null;
  }
}

export function normalizeSharedState(incoming) {
  const base = incoming && typeof incoming === "object" ? incoming : {};

  const bedtime = typeof base.bedtime === "string" ? base.bedtime : "22:30";
  const tasksRaw = Array.isArray(base.tasks) ? base.tasks : [];

  const updatedAt =
    typeof base.updatedAt === "number" && Number.isFinite(base.updatedAt) ? base.updatedAt : Date.now();

  const tasks = tasksRaw
    .filter((t) => t && typeof t === "object")
    .map((t) => ({
      id: typeof t.id === "string" ? t.id : safeRandomId(),
      title: typeof t.title === "string" ? t.title : "",
      plannedMin: clampInt(t.plannedMin, { min: 1, max: 10_000 }),
      actualMin:
        t.actualMin === null || t.actualMin === undefined
          ? null
          : clampInt(t.actualMin, { min: 0, max: 10_000 }),
      done: Boolean(t.done),
      createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
      updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),

      timerRunning: Boolean(t.timerRunning),
      timerStartedAtMs: typeof t.timerStartedAtMs === "number" ? t.timerStartedAtMs : null,
      timerAccumulatedMs: typeof t.timerAccumulatedMs === "number" ? t.timerAccumulatedMs : 0,
    }))
    .filter((t) => t.title.trim().length > 0);

  return { bedtime, tasks, updatedAt };
}

export function saveState({ bedtime, tasks, updatedAt }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bedtime, tasks, updatedAt }));
}

export { STORAGE_KEY };
