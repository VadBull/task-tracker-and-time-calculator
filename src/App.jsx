import React, { useEffect, useMemo, useReducer, useState, useRef } from "react";
import {
  AppBar,
  Box,
  Button,
  Chip,
  CssBaseline,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  IconButton,
  Paper,
  Stack,
  Switch,
  TextField,
  Toolbar,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Checkbox,
  Tooltip,
  LinearProgress,
  Alert,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import useMediaQuery from "@mui/material/useMediaQuery";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import SettingsBrightnessIcon from "@mui/icons-material/SettingsBrightness";
import SaveIcon from "@mui/icons-material/Save";

// ===== BACKEND API =====
// По умолчанию ходим в локальный backend, но даём переопределить через Vite env.
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

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

async function loadSharedState() {
  const res = await fetch(`${API_BASE}/api/v1/state`, {
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

class SaveConflictError extends Error {
  constructor(message, currentState) {
    super(message);
    this.name = "SaveConflictError";
    this.currentState = currentState;
  }
}

async function saveSharedState(state) {
  const res = await fetch(`${API_BASE}/api/v1/state`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(state),
  });

  if (res.status === 409) {
    const body = await safeReadJson(res);
    const current = body && typeof body === "object" ? body.currentState : null;
    throw new SaveConflictError("State conflict (409): incoming state is stale", current);
  }

  if (!res.ok) {
    const txt = await safeReadText(res);
    throw new Error(`saveSharedState failed: ${res.status} ${txt}`);
  }

  const json = await safeReadJson(res);
  if (!json || typeof json !== "object") {
    throw new Error("saveSharedState failed: invalid JSON");
  }

  return json;
}

function connectSharedState(onState) {
  const es = new EventSource(`${API_BASE}/api/v1/state/stream`);

  const handler = (ev) => {
    try {
      const parsed = JSON.parse(ev.data);
      onState(parsed);
    } catch {
      // ignore broken event
    }
  };

  es.addEventListener("state", handler);

  // EventSource сам пытается реконнектиться.
  // Можно добавить логирование ошибок, но UI обычно не должен дёргаться.
  es.onerror = () => {
    // ignore
  };

  return () => {
    try {
      es.removeEventListener("state", handler);
      es.close();
    } catch {
      // ignore
    }
  };
}

// ===== LOCAL CACHE (fallback) =====
const STORAGE_KEY = "sleep_tasks_v1";
const THEME_MODE_KEY = "ui_theme_mode_v1";

function safeRandomId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clampInt(v, { min = 0, max = 10_000 } = {}) {
  const n = Number.parseInt(String(v), 10);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function parseTimeToMinutes(timeStr) {
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

function isBedtimeValid(timeStr) {
  const mins = parseTimeToMinutes(timeStr);
  if (mins === null) return false;

  // строго > 14:00 (1140), и строго < 23:59 (1439)
  return mins > 14 * 60 && mins < (23 * 60 + 59);
}

function dateAtTodayMinutes(minsFromMidnight) {
  const d = new Date();
  const hh = Math.floor(minsFromMidnight / 60);
  const mm = minsFromMidnight % 60;
  d.setHours(hh, mm, 0, 0);
  return d;
}

function formatDurationMs(ms) {
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

function taskTimerMs(task, nowMs) {
  const acc = typeof task.timerAccumulatedMs === "number" ? task.timerAccumulatedMs : 0;

  if (task.timerRunning && typeof task.timerStartedAtMs === "number") {
    return acc + Math.max(0, nowMs - task.timerStartedAtMs);
  }

  return acc;
}

function msToMinutesCeil(ms) {
  // 0..∞, округляем вверх, чтобы 1 секунда не превращалась в 0 минут
  if (ms <= 0) return 0;
  return Math.ceil(ms / 60000);
}

function stopTimerFields(task, nowMs) {
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

function loadState() {
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

function normalizeSharedState(incoming) {
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

function saveState({ bedtime, tasks, updatedAt }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bedtime, tasks, updatedAt }));
}

// ===== REDUCER =====
function reducer(state, action) {
  switch (action.type) {
    case "init":
      return normalizeSharedState(action.payload);

    case "setBedtime":
      return { ...state, bedtime: action.bedtime, updatedAt: Date.now() };

    case "createTask": {
      const next = [action.task, ...state.tasks];
      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    case "updateTask": {
      const next = state.tasks.map((t) => (t.id === action.task.id ? action.task : t));
      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    case "deleteTask": {
      const next = state.tasks.filter((t) => t.id !== action.id);
      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    case "toggleDone": {
      const nowMs = action.nowMs;

      const next = state.tasks.map((t) => {
        if (t.id !== action.id) return t;

        let nt = t;

        // если отмечаем "готово" — остановим таймер и зафиксируем факт
        if (action.done) {
          nt = stopTimerFields(nt, nowMs);
        }

        const nextDone = action.done;

        // если задача стала done и факт пустой — возьмём:
        // 1) actualMin (если уже появился из таймера)
        // 2) иначе plannedMin
        const nextActual = nextDone
          ? nt.actualMin === null || nt.actualMin === undefined
            ? nt.plannedMin
            : nt.actualMin
          : nt.actualMin;

        return {
          ...nt,
          done: nextDone,
          actualMin: nextActual,
          updatedAt: new Date().toISOString(),
        };
      });

      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    case "resetAll": {
      return { bedtime: "22:30", tasks: [], updatedAt: Date.now() };
    }

    case "startTimer": {
      const nowMs = action.nowMs;

      const next = state.tasks.map((t) => {
        // 1) если где-то уже идёт таймер — остановим (накопим) его
        let nt = t;
        if (t.timerRunning) {
          nt = stopTimerFields(nt, nowMs);
        }

        // 2) стартуем нужную задачу, если она не done
        if (nt.id === action.id && !nt.done) {
          nt = {
            ...nt,
            timerRunning: true,
            timerStartedAtMs: nowMs,
            updatedAt: new Date().toISOString(),
          };
        }

        return nt;
      });

      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    case "stopTimer": {
      const nowMs = action.nowMs;

      const next = state.tasks.map((t) => {
        if (t.id !== action.id) return t;

        const stopped = stopTimerFields(t, nowMs);
        return { ...stopped, updatedAt: new Date().toISOString() };
      });

      return { ...state, tasks: next, updatedAt: Date.now() };
    }

    default:
      return state;
  }
}

// ===== DIALOG =====
function TaskDialog({ open, mode, initialTask, onCancel, onSubmit }) {
  const isEdit = mode === "edit";

  const [title, setTitle] = useState("");
  const [plannedMin, setPlannedMin] = useState(25);
  const [done, setDone] = useState(false);
  const [actualMin, setActualMin] = useState("");

  const [touched, setTouched] = useState(false);

  useEffect(() => {
    const t = initialTask || null;

    setTitle(t?.title ?? "");
    setPlannedMin(t?.plannedMin ?? 25);
    setDone(Boolean(t?.done ?? false));
    setActualMin(t?.actualMin === null || t?.actualMin === undefined ? "" : String(t.actualMin));

    setTouched(false);
  }, [open, initialTask]);

  const titleOk = title.trim().length >= 1;
  const plannedOk = Number.isInteger(plannedMin) && plannedMin > 0;

  const actualParsed = actualMin === "" ? null : clampInt(actualMin, { min: 0, max: 10_000 });
  const actualOk = !done || (actualParsed !== null && Number.isInteger(actualParsed));

  const formOk = titleOk && plannedOk && actualOk;

  function submit() {
    setTouched(true);
    if (!formOk) return;

    const nowIso = new Date().toISOString();
    const base =
      initialTask ??
      ({
        id: safeRandomId(),
        createdAt: nowIso,

        timerRunning: false,
        timerStartedAtMs: null,
        timerAccumulatedMs: 0,
      });

    const finalActual = done ? (actualParsed === null ? plannedMin : actualParsed) : actualParsed;

    onSubmit({
      ...base,
      title: title.trim(),
      plannedMin: clampInt(plannedMin, { min: 1, max: 10_000 }),
      done: Boolean(done),
      actualMin: finalActual,

      timerRunning: Boolean(base.timerRunning),
      timerStartedAtMs: typeof base.timerStartedAtMs === "number" ? base.timerStartedAtMs : null,
      timerAccumulatedMs: typeof base.timerAccumulatedMs === "number" ? base.timerAccumulatedMs : 0,

      updatedAt: nowIso,
    });
  }

  return (
    <Dialog open={open} onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>{isEdit ? "Редактировать задачу" : "Новая задача"}</DialogTitle>

      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Название"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            error={touched && !titleOk}
            helperText={touched && !titleOk ? "Название не должно быть пустым" : " "}
            fullWidth
            autoFocus
          />

          <TextField
            label="План (мин)"
            type="number"
            inputProps={{ min: 1, step: 1 }}
            value={plannedMin}
            onChange={(e) => setPlannedMin(clampInt(e.target.value, { min: 0, max: 10_000 }))}
            onBlur={() => setTouched(true)}
            error={touched && !plannedOk}
            helperText={touched && !plannedOk ? "План должен быть > 0" : " "}
            fullWidth
          />

          <FormControlLabel
            control={<Switch checked={done} onChange={(e) => setDone(e.target.checked)} />}
            label="Готово"
          />

          <TextField
            label="Факт (мин) — используется если 'Готово'"
            type="number"
            inputProps={{ min: 0, step: 1 }}
            value={actualMin}
            onChange={(e) => setActualMin(e.target.value)}
            onBlur={() => setTouched(true)}
            disabled={!done}
            error={touched && !actualOk}
            helperText={done ? "Если оставить пустым — возьмём план как факт" : "Факт можно заполнить позже при завершении"}
            fullWidth
          />
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onCancel}>Отмена</Button>

        <Button variant="contained" onClick={submit}>
          {isEdit ? "Сохранить" : "Создать"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

const DEFAULT_STATE = {
  bedtime: "22:30",
  tasks: [],
  updatedAt: 0,
};

export default function App() {
  // ===== THEME (dark / light / system) =====
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const [themeMode, setThemeMode] = useState(() => {
    try {
      const v = localStorage.getItem(THEME_MODE_KEY);
      if (v === "dark" || v === "light" || v === "system") return v;
      return "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch {
      // ignore
    }
  }, [themeMode]);

  const resolvedMode = themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;

  function cycleThemeMode() {
    setThemeMode((prev) => (prev === "dark" ? "light" : prev === "light" ? "system" : "dark"));
  }

  const theme = useMemo(() => {
    const isDark = resolvedMode === "dark";

    return createTheme({
      palette: {
        mode: resolvedMode,
        primary: { main: isDark ? "#4c7dff" : "#2f5cff" },
        background: {
          default: isDark ? "#0b1020" : "#f5f6fa",
          paper: isDark ? "#121a33" : "#ffffff",
        },
      },
      shape: { borderRadius: 14 },
      typography: {
        fontFamily:
          'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
      },
      components: {
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
            },
          },
        },
      },
    });
  }, [resolvedMode]);

  // ===== APP STATE =====
  const [state, dispatch] = useReducer(reducer, DEFAULT_STATE);

  const syncReadyRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const lastServerUpdatedAtRef = useRef(0);

  const [nowMs, setNowMs] = useState(Date.now());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | edit
  const [editingTask, setEditingTask] = useState(null);
  const [saveStatus, setSaveStatus] = useState("idle"); // idle | saving | saved | error
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState(null);

  // INIT: load from server; fallback local cache
  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const remote = await loadSharedState();
        if (!mounted) return;

        const normalized = normalizeSharedState(remote);

        applyingRemoteRef.current = true;
        lastServerUpdatedAtRef.current = normalized.updatedAt;
        dispatch({ type: "init", payload: normalized });
        applyingRemoteRef.current = false;

        saveState(normalized);
        syncReadyRef.current = true;
      } catch (e) {
        const local = loadState();
        if (!mounted) return;

        if (local) {
          const normalized = normalizeSharedState(local);

          applyingRemoteRef.current = true;
          lastServerUpdatedAtRef.current = normalized.updatedAt;
          dispatch({ type: "init", payload: normalized });
          applyingRemoteRef.current = false;
        }

        syncReadyRef.current = true;
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  // SSE subscribe
  useEffect(() => {
    const disconnect = connectSharedState((serverState) => {
      const normalized = normalizeSharedState(serverState);

      applyingRemoteRef.current = true;
      lastServerUpdatedAtRef.current = normalized.updatedAt;
      dispatch({ type: "init", payload: normalized });
      applyingRemoteRef.current = false;

      saveState(normalized);
    });

    return disconnect;
  }, []);

  // PUSH changes to server
  useEffect(() => {
    // локальный кэш
    saveState(state);
  }, [state]);

  // timer tick
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const bedtimeValid = isBedtimeValid(state.bedtime);
  const bedtimeMinutes = bedtimeValid ? parseTimeToMinutes(state.bedtime) : null;

  const sums = useMemo(() => {
    let plannedNotDone = 0;
    let actualDone = 0;

    for (const t of state.tasks) {
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
  }, [state.tasks]);

  const timeUntilBedMs = useMemo(() => {
    if (!bedtimeValid || bedtimeMinutes === null) return null;
    const bedDate = dateAtTodayMinutes(bedtimeMinutes);
    return bedDate.getTime() - nowMs;
  }, [bedtimeValid, bedtimeMinutes, nowMs]);

  const bufferMs = useMemo(() => {
    if (timeUntilBedMs === null) return null;
    return timeUntilBedMs - sums.totalWorkMin * 60_000;
  }, [timeUntilBedMs, sums.totalWorkMin]);

  const completionAtMs = useMemo(() => {
    // если начать сейчас и сделать всё
    return nowMs + sums.totalWorkMin * 60_000;
  }, [nowMs, sums.totalWorkMin]);

  const bedtimeDateMs = useMemo(() => {
    if (!bedtimeValid || bedtimeMinutes === null) return null;
    return dateAtTodayMinutes(bedtimeMinutes).getTime();
  }, [bedtimeValid, bedtimeMinutes]);

  const progress = useMemo(() => {
    // занятость = work / timeUntilBed
    if (timeUntilBedMs === null) return null;

    const denom = Math.max(1, timeUntilBedMs);
    const busy = (sums.totalWorkMin * 60_000) / denom;
    const pct = Math.round(Math.max(0, Math.min(1.5, busy)) * 100); // cap для визуала
    return pct;
  }, [timeUntilBedMs, sums.totalWorkMin]);

  function openCreate() {
    setDialogMode("create");
    setEditingTask(null);
    setDialogOpen(true);
  }

  function openEdit(task) {
    setDialogMode("edit");
    setEditingTask(task);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function submitTask(task) {
    if (dialogMode === "edit") {
      dispatch({ type: "updateTask", task });
    } else {
      dispatch({ type: "createTask", task });
    }
    setDialogOpen(false);
  }

  function deleteTask(id) {
    dispatch({ type: "deleteTask", id });
  }

  function toggleDone(id, done) {
    dispatch({ type: "toggleDone", id, done, nowMs });
  }

  function startTimer(id) {
    dispatch({ type: "startTimer", id, nowMs });
  }

  function stopTimer(id) {
    dispatch({ type: "stopTimer", id, nowMs });
  }

  function hardReset() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
    dispatch({ type: "resetAll" });
  }

  const isDirty = useMemo(() => {
    if (!syncReadyRef.current) return false;
    if (typeof state.updatedAt !== "number" || !Number.isFinite(state.updatedAt) || state.updatedAt <= 0) return false;
    return state.updatedAt !== lastServerUpdatedAtRef.current;
  }, [state.updatedAt]);

  useEffect(() => {
    if (isDirty && saveStatus !== "saving") {
      setSaveStatus("idle");
      setSaveError("");
    }
  }, [isDirty, saveStatus]);

  async function saveToServer() {
    if (!syncReadyRef.current) return;
    if (saveStatus === "saving") return;

    setSaveStatus("saving");
    setSaveError("");

    const prevServerUpdatedAt = lastServerUpdatedAtRef.current;
    lastServerUpdatedAtRef.current = state.updatedAt;

    try {
      const saved = await saveSharedState(state);
      const normalized = normalizeSharedState(saved);
      lastServerUpdatedAtRef.current = normalized.updatedAt;
      saveState(normalized);
      setLastSavedAt(Date.now());
      setSaveStatus("saved");
    } catch (err) {
      if (err instanceof SaveConflictError) {
        const current = err.currentState;
        if (current && typeof current === "object") {
          const normalized = normalizeSharedState(current);

          applyingRemoteRef.current = true;
          lastServerUpdatedAtRef.current = normalized.updatedAt;
          dispatch({ type: "init", payload: normalized });
          applyingRemoteRef.current = false;

          saveState(normalized);
          setSaveError("Конфликт сохранения: загрузили актуальную версию с сервера.");
          setSaveStatus("error");
          return;
        }
      }

      lastServerUpdatedAtRef.current = prevServerUpdatedAt;
      setSaveError(err instanceof Error ? err.message : "Не удалось сохранить задачи.");
      setSaveStatus("error");
    }
  }

  const warningActualMissingDone = useMemo(() => {
    return state.tasks.some((t) => t.done && (t.actualMin === null || t.actualMin === undefined));
  }, [state.tasks]);

  const themeTooltip =
    themeMode === "system"
      ? `Тема: системная (${resolvedMode === "dark" ? "тёмная" : "светлая"}). Нажми: → тёмная`
      : themeMode === "dark"
        ? "Тема: тёмная. Нажми: → светлая"
        : "Тема: светлая. Нажми: → системная";

  const themeIcon =
    themeMode === "system" ? (
      <SettingsBrightnessIcon />
    ) : resolvedMode === "dark" ? (
      <Brightness4Icon />
    ) : (
      <Brightness7Icon />
    );

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <BedtimeIcon />

          <Typography variant="h6" sx={{ fontWeight: 700 }}>
            Day time planner
          </Typography>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={themeTooltip}>
            <IconButton onClick={cycleThemeMode} aria-label="Переключить тему">
              {themeIcon}
            </IconButton>
          </Tooltip>

          <Tooltip title="Сбросить всё (сон + задачи)">
            <IconButton onClick={hardReset}>
              <RestartAltIcon />
            </IconButton>
          </Tooltip>

          <Button
            variant="outlined"
            startIcon={<SaveIcon />}
            onClick={saveToServer}
            disabled={!isDirty || saveStatus === "saving"}
          >
            {saveStatus === "saving" ? "Сохраняю..." : "Сохранить"}
          </Button>

          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
            sx={{
              lineHeight: 1.05,
              py: 0.9,

              // центрируем иконку вертикально
              "& .MuiButton-startIcon": {
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "center",
                mt: 0,
              },

              // чуть уменьшим сам плюс (опционально, чтобы выглядел аккуратнее)
              "& .MuiButton-startIcon > *:nth-of-type(1)": { fontSize: 18 },
            }}
          >
            Добавить задачу
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        <Stack spacing={2} sx={{ maxWidth: 1100, mx: "auto" }}>
          {saveStatus === "error" ? (
            <Alert severity="error">{saveError || "Не удалось сохранить задачи."}</Alert>
          ) : null}

          {saveStatus === "saved" && lastSavedAt ? (
            <Alert severity="success">
              Сохранено {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </Alert>
          ) : null}

          <Paper sx={{ p: 2 }}>
            <Stack sx={{ flex: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center">
                <AccessTimeIcon />

                <Typography sx={{ fontWeight: 640 }}>Завершаю в:</Typography>

                <TextField
                  type="time"
                  size="small"
                  value={state.bedtime}
                  onChange={(e) => dispatch({ type: "setBedtime", bedtime: e.target.value })}
                  sx={{ width: 140 }}
                  error={!bedtimeValid}
                  helperText={null}
                  FormHelperTextProps={{ sx: { display: "none" } }}
                />
              </Stack>

              {!bedtimeValid ? (
                <Typography variant="caption" sx={{ mt: 0.5, color: "error.main", textAlign: "left" }}>
                  Строго больше 14:00 и строго меньше 23:59
                </Typography>
              ) : (
                // чтобы высота блока не “прыгала”, оставим пустую строку
                <Box sx={{ height: 1 }} />
              )}
            </Stack>

            {warningActualMissingDone ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Есть выполненные задачи без фактического времени — расчёт может быть неточным.
              </Alert>
            ) : null}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography sx={{ fontWeight: 640 }}>Таймер (по формуле)</Typography>

              {!bedtimeValid ? (
                <Alert severity="error">Укажи корректное время “Завершаю в:” иначе таймер не считается.</Alert>
              ) : (
                <>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ xs: "stretch", md: "center" }}>
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ opacity: 0.8, fontSize: 13 }}>Остаток буфера до завершения:</Typography>

                      <Typography
                        sx={{
                          fontWeight: 1000,
                          fontSize: { xs: 36, sm: 44 },
                          letterSpacing: 1,
                        }}
                      >
                        {bufferMs === null ? "--:--:--" : formatDurationMs(bufferMs)}
                      </Typography>

                      <Typography sx={{ opacity: 0.75, fontSize: 13 }}>
                        Формула: (дедлайн − сейчас) − Σ(план незавершённых) − Σ(факт завершённых)
                      </Typography>
                    </Box>

                    <Stack spacing={1} sx={{ minWidth: { md: 340 } }}>
                      <Chip
                        label={
                          timeUntilBedMs === null ? "До завершения: —" : `До завершения: ${formatDurationMs(timeUntilBedMs)}`
                        }
                      />

                      <Chip label={`Минут работы (всего): ${sums.totalWorkMin}`} />

                      <Chip
                        color={bedtimeDateMs !== null && completionAtMs > bedtimeDateMs ? "error" : "success"}
                        label={
                          bedtimeDateMs === null
                            ? "Финиш: —"
                            : `Финиш если начать сейчас: ${new Date(completionAtMs).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                        }
                      />
                    </Stack>
                  </Stack>

                  <Box sx={{ mt: 1 }}>
                    <Typography sx={{ opacity: 0.8, fontSize: 13, mb: 0.5 }}>
                      Занятость до сна (work / timeUntilBed)
                    </Typography>

                    <LinearProgress
                      variant="determinate"
                      value={Math.min(100, progress ?? 0)}
                      sx={{ height: 10, borderRadius: 999 }}
                    />

                    <Typography sx={{ opacity: 0.7, fontSize: 12, mt: 0.5 }}>
                      {progress === null
                        ? ""
                        : progress <= 100
                          ? `План укладывается: ${progress}% времени до сна занято задачами`
                          : `Переплан: задач больше, чем времени до сна (${progress}%+)`}
                    </Typography>
                  </Box>
                </>
              )}
            </Stack>
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography sx={{ fontWeight: 640 }}>Список задач</Typography>

              <Button variant="outlined" onClick={openCreate} startIcon={<AddIcon />}>
                Добавить
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {state.tasks.length === 0 ? (
              <Alert severity="info">Пока задач нет. Добавь задачу — и таймер начнёт учитывать план/факт.</Alert>
            ) : (
              <TableContainer sx={{ width: "100%", overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell width={60}>Готово</TableCell>
                      <TableCell>Название</TableCell>
                      <TableCell width={140}>План (мин)</TableCell>
                      <TableCell width={160}>Факт (мин)</TableCell>
                      <TableCell width={160} align="center">
                        Таймер
                      </TableCell>
                      <TableCell width={120} align="right">
                        Действия
                      </TableCell>
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {state.tasks.map((t) => {
                      const factMissing = t.done && (t.actualMin === null || t.actualMin === undefined);
                      const liveMs = taskTimerMs(t, nowMs);
                      const liveText = formatDurationMs(liveMs);

                      return (
                        <TableRow key={t.id} hover>
                          <TableCell>
                            <Checkbox checked={t.done} onChange={(e) => toggleDone(t.id, e.target.checked)} />
                          </TableCell>

                          <TableCell>
                            <Typography sx={{ fontWeight: 640 }}>{t.title}</Typography>
                          </TableCell>

                          <TableCell>{t.plannedMin}</TableCell>

                          <TableCell>
                            {t.actualMin === null || t.actualMin === undefined ? (
                              <Typography sx={{ opacity: 0.6 }}>{t.done ? "— (будет = план)" : "—"}</Typography>
                            ) : (
                              t.actualMin
                            )}

                            {factMissing ? <Typography sx={{ color: "warning.main", fontSize: 12 }}>факта нет</Typography> : null}
                          </TableCell>

                          <TableCell align="left">
                            <Stack direction="row" alignItems="center" spacing={1} sx={{ whiteSpace: "nowrap" }}>
                              {t.timerRunning ? (
                                <Tooltip title="Остановить таймер">
                                  <IconButton
                                    size="small"
                                    color="warning"
                                    onClick={() => stopTimer(t.id)}
                                    sx={{ flex: "0 0 auto" }}
                                  >
                                    <StopIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              ) : (
                                <Tooltip title={t.done ? "Задача уже выполнена" : "Делаю сейчас (запустить таймер)"}>
                                  <span>
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      disabled={t.done}
                                      onClick={() => startTimer(t.id)}
                                      sx={{ flex: "0 0 auto" }}
                                    >
                                      <PlayArrowIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              )}

                              <Typography component="span" sx={{ fontFamily: "monospace", fontWeight: 640, flex: "0 0 auto" }}>
                                {liveText}
                              </Typography>

                              <Typography component="span" sx={{ opacity: 0.7, fontSize: 12, flex: "0 0 auto" }}>
                                {msToMinutesCeil(liveMs)} мин
                              </Typography>
                            </Stack>
                          </TableCell>

                          <TableCell align="right">
                            <Tooltip title="Редактировать">
                              <IconButton onClick={() => openEdit(t)}>
                                <EditOutlinedIcon />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Удалить">
                              <IconButton color="error" onClick={() => deleteTask(t.id)}>
                                <DeleteOutlineIcon />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Paper>
        </Stack>
      </Box>

      <TaskDialog open={dialogOpen} mode={dialogMode} initialTask={editingTask} onCancel={closeDialog} onSubmit={submitTask} />
    </ThemeProvider>
  );
}
