import React, { useEffect, useMemo, useReducer, useState, useRef } from "react";
import "./App.css";
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
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import SaveIcon from "@mui/icons-material/Save";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";

// ===== BACKEND API =====
// По умолчанию ходим в локальный backend, но даём переопределить через Vite env.
const DEFAULT_HOST =
  typeof window !== "undefined" && window.location?.hostname ? window.location.hostname : "localhost";
const API_BASE = import.meta.env.VITE_API_BASE || `http://${DEFAULT_HOST}:3001`;
const WS_BASE = import.meta.env.VITE_WS_BASE || API_BASE.replace(/^http/, "ws");

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

async function saveSharedState(state) {
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

function connectSharedState(onState) {
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

// ===== LOCAL CACHE (fallback) =====
const STORAGE_KEY = "sleep_tasks_v1";
const THEME_MODE_KEY = "ui_theme_mode_v2";

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
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_MODE_KEY);
      return saved === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(THEME_MODE_KEY, themeMode);
    } catch {
      // ignore
    }
    document.body.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  function toggleThemeMode() {
    setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
  }

  // ===== THEME (light / warm dark) =====
  const theme = useMemo(() => {
    const isDark = themeMode === "dark";

    return createTheme({
      palette: {
        mode: isDark ? "dark" : "light",
        primary: { main: isDark ? "#DAC95D" : "#F4D06F" },
        secondary: { main: isDark ? "#6D8EEA" : "#7AA2F7" },
        success: { main: isDark ? "#00BF8E" : "#7ED7B5" },
        warning: { main: isDark ? "#D08C5E" : "#E09F6B" },
        background: {
          default: isDark ? "#222428" : "#F6F2E8",
          paper: isDark ? "#4A4C54" : "#FFFFFF",
        },
        text: {
          primary: isDark ? "#F4F1E8" : "#121212",
          secondary: isDark ? "#B8B3A8" : "#4B4B4B",
        },
      },
      shape: { borderRadius: 14 },
      typography: {
        fontFamily: '"Inter", "Manrope", system-ui, -apple-system, Segoe UI, sans-serif',
        h1: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 800,
          fontSize: "clamp(2.75rem, 4vw, 3.75rem)",
          lineHeight: 1.05,
        },
        h2: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 800,
          fontSize: "clamp(2rem, 3vw, 2.6rem)",
          lineHeight: 1.1,
        },
        h3: {
          fontFamily: '"Space Grotesk", "Unbounded", sans-serif',
          fontWeight: 700,
          fontSize: "clamp(1.4rem, 2.2vw, 1.75rem)",
          lineHeight: 1.2,
        },
        subtitle1: { fontWeight: 600 },
        body1: { fontSize: 16 },
        body2: { fontSize: 14 },
      },
      components: {
        MuiAppBar: {
          styleOverrides: {
            root: {
              backgroundImage: "none",
              borderBottom: "3px solid var(--border-color)",
            },
          },
        },
        MuiPaper: {
          styleOverrides: {
            root: {
              border: "3px solid var(--border-color)",
              boxShadow: "var(--shadow-strong)",
            },
          },
        },
        MuiButton: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              border: "3px solid var(--border-color)",
              boxShadow: "var(--shadow-strong)",
              textTransform: "none",
              fontWeight: 700,
              transition: "all 180ms ease",
              "&:hover": {
                boxShadow: "var(--shadow-hover)",
                transform: "translate(-1px, -1px)",
              },
              "&:active": {
                boxShadow: "var(--shadow-active)",
                transform: "translate(2px, 2px)",
              },
            },
            outlined: {
              backgroundColor: "var(--surface)",
            },
            contained: {
              color: "#121212",
            },
          },
        },
        MuiChip: {
          styleOverrides: {
            root: {
              border: "2px solid var(--border-color)",
              fontWeight: 700,
            },
          },
        },
        MuiOutlinedInput: {
          styleOverrides: {
            root: {
              borderRadius: 12,
              backgroundColor: "var(--surface)",
              "& .MuiOutlinedInput-notchedOutline": {
                border: "3px solid var(--border-color)",
              },
              "&:hover .MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-color)",
              },
              "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
                borderColor: "var(--border-color)",
              },
              "&.Mui-focused": {
                boxShadow: isDark ? "0 0 0 3px rgba(231, 197, 90, 0.3)" : "0 0 0 3px rgba(122, 162, 247, 0.3)",
              },
            },
            input: {
              padding: "12px 14px",
            },
          },
        },
        MuiTableCell: {
          styleOverrides: {
            head: {
              fontWeight: 700,
            },
          },
        },
      },
    });
  }, [themeMode]);

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
      await saveSharedState(state);
      const fresh = await loadSharedState();
      const normalized = normalizeSharedState(fresh);
      lastServerUpdatedAtRef.current = normalized.updatedAt;
      saveState(normalized);
      setLastSavedAt(Date.now());
      setSaveStatus("saved");
    } catch (err) {
      lastServerUpdatedAtRef.current = prevServerUpdatedAt;
      setSaveError(err instanceof Error ? err.message : "Не удалось сохранить задачи.");
      setSaveStatus("error");
    }
  }

  const warningActualMissingDone = useMemo(() => {
    return state.tasks.some((t) => t.done && (t.actualMin === null || t.actualMin === undefined));
  }, [state.tasks]);

  const navLinks = [
    { label: "Обзор", href: "#overview" },
    { label: "Функции", href: "#features" },
    { label: "Планер", href: "#planner" },
    { label: "Тарифы", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  const featureCards = [
    {
      title: "Собери план",
      body: "Разложи задачи по минутам и сразу увидишь реальную загрузку.",
      badge: "Planning",
      color: "var(--accent-a1)",
    },
    {
      title: "Держи фокус",
      body: "Запускай таймеры по задачам и сравнивай план с фактом.",
      badge: "Focus",
      color: "var(--accent-a2)",
    },
    {
      title: "Синхронизация",
      body: "Сохраняй состояние и делись прогрессом с командой.",
      badge: "Sync",
      color: "var(--accent-a3)",
    },
  ];

  const showcaseCards = [
    { title: "Утренний блок", tag: "3 задачи" },
    { title: "Клиентские правки", tag: "45 минут" },
    { title: "Созвон", tag: "14:30" },
    { title: "Глубокая работа", tag: "90 минут" },
    { title: "Перерыв", tag: "15 минут" },
    { title: "Рефлексия дня", tag: "итоги" },
  ];

  const pricingPlans = [
    {
      title: "Solo",
      price: "Бесплатно",
      description: "Личный планер с таймерами и базовой статистикой.",
    },
    {
      title: "Team",
      price: "₽490/мес",
      description: "Общий план, синхронизация и статус выполнения.",
    },
    {
      title: "Studio",
      price: "₽990/мес",
      description: "Расширенная аналитика и совместные рабочие блоки.",
    },
  ];

  const faqItems = [
    {
      question: "Это просто список задач или полноценный тайм-менеджмент?",
      answer: "Это планер с расчётом реальной загрузки до дедлайна. Он показывает буфер времени и помогает держать ритм.",
    },
    {
      question: "Можно ли вести фактическое время?",
      answer: "Да, таймер фиксирует факт, а при завершении можно вручную уточнить минуты.",
    },
    {
      question: "Что будет, если данных с сервера нет?",
      answer: "Приложение держит локальный кэш и подтянет данные, как только появится соединение.",
    },
  ];

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "background.default" }}>
        <Toolbar className="container" sx={{ gap: 2, py: 1.5 }}>
          <Box className="logo-pill">
            <BedtimeIcon fontSize="small" />
            <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
              Day time planner
            </Typography>
          </Box>

          <Stack direction="row" spacing={2} sx={{ ml: 2, display: { xs: "none", md: "flex" } }}>
            {navLinks.map((link) => (
              <Box key={link.href} component="a" href={link.href} className="nav-link">
                {link.label}
              </Box>
            ))}
          </Stack>

          <Box sx={{ flex: 1 }} />

          <Tooltip title={themeMode === "dark" ? "Светлая тема" : "Тёмная тема"}>
            <IconButton onClick={toggleThemeMode} className="icon-button">
              {themeMode === "dark" ? <Brightness7Icon /> : <Brightness4Icon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="Сбросить всё (сон + задачи)">
            <IconButton onClick={hardReset} className="icon-button">
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
              "& .MuiButton-startIcon": {
                display: "inline-flex",
                alignItems: "center",
                alignSelf: "center",
                mt: 0,
              },
              "& .MuiButton-startIcon > *:nth-of-type(1)": { fontSize: 18 },
            }}
          >
            Get started
          </Button>
        </Toolbar>
      </AppBar>

      <Box component="main">
        <Box className="section" id="overview">
          <Box className="container">
            <Stack direction={{ xs: "column", md: "row" }} spacing={4} alignItems="stretch">
              <Box sx={{ flex: 1 }}>
                <Typography variant="h1">Планируй день смело, без перегруза.</Typography>
                <Typography sx={{ mt: 2, color: "text.secondary", fontSize: 18 }}>
                  Bold-планер показывает буфер времени до сна и помогает держать фокус на главном.
                </Typography>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mt: 3 }}>
                  <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
                    Добавить задачу
                  </Button>
                  <Button variant="outlined" startIcon={<SaveIcon />} onClick={saveToServer} disabled={!isDirty}>
                    Сохранить прогресс
                  </Button>
                </Stack>
                <Stack direction="row" spacing={1} sx={{ mt: 3, flexWrap: "wrap" }}>
                  <Chip label={`Всего задач: ${state.tasks.length}`} sx={{ bgcolor: "var(--accent-a1)", color: "#121212" }} />
                  <Chip label={`План минут: ${sums.totalWorkMin}`} sx={{ bgcolor: "var(--accent-a3)", color: "#121212" }} />
                  <Chip
                    label={`Буфер: ${bufferMs === null ? "--:--:--" : formatDurationMs(bufferMs)}`}
                    sx={{ bgcolor: "var(--accent-a5)", color: "#121212" }}
                  />
                </Stack>
              </Box>

              <Paper className="hero-card" sx={{ flex: 1, p: 3, backgroundColor: "background.paper" }}>
                <Stack spacing={2}>
                  <Typography variant="h3">Сегодняшний фокус</Typography>
                  <Typography color="text.secondary">
                    Проверяй, сколько времени осталось до финиша и насколько плотный график.
                  </Typography>
                  <Stack spacing={1}>
                    <Chip
                      label={timeUntilBedMs === null ? "До завершения: —" : `До завершения: ${formatDurationMs(timeUntilBedMs)}`}
                      sx={{ bgcolor: "var(--accent-a1)", color: "#121212" }}
                    />
                    <Chip label={`Минут работы (всего): ${sums.totalWorkMin}`} sx={{ bgcolor: "var(--accent-a2)", color: "#121212" }} />
                    <Chip
                      label={
                        bedtimeDateMs === null
                          ? "Финиш: —"
                          : `Финиш если начать сейчас: ${new Date(completionAtMs).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}`
                      }
                      sx={{ bgcolor: "var(--accent-a3)", color: "#121212" }}
                    />
                  </Stack>
                  <Box className="hero-metric">
                    <Typography variant="subtitle1" sx={{ opacity: 0.8 }}>
                      Остаток буфера
                    </Typography>
                    <Typography className="hero-metric-value">
                      {bufferMs === null ? "--:--:--" : formatDurationMs(bufferMs)}
                    </Typography>
                  </Box>
                </Stack>
              </Paper>
            </Stack>
          </Box>
        </Box>

        <Box className="section" id="features">
          <Box className="container">
            <Stack spacing={2}>
              <Typography variant="h2">Функции, которые держат ритм.</Typography>
              <Box className="grid-3">
                {featureCards.map((card) => (
                  <Paper key={card.title} sx={{ p: 3, bgcolor: "background.paper" }}>
                    <Chip label={card.badge} sx={{ bgcolor: card.color, color: "#121212" }} />
                    <Typography variant="h3" sx={{ mt: 2 }}>
                      {card.title}
                    </Typography>
                    <Typography sx={{ mt: 1, color: "text.secondary" }}>{card.body}</Typography>
                  </Paper>
                ))}
              </Box>
            </Stack>
          </Box>
        </Box>

        <Box className="section statement-section">
          <Box className="container">
            <Typography variant="h2" sx={{ maxWidth: 820 }}>
              Большой план не должен быть тревожным — оставь место для жизни и отдыха.
            </Typography>
          </Box>
        </Box>

        <Box className="section" id="planner">
          <Box className="container">
            <Stack spacing={3}>
              <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" alignItems={{ sm: "center" }}>
                <Box>
                  <Typography variant="h2">Планер на сегодня</Typography>
                  <Typography sx={{ color: "text.secondary" }}>Вводи задачи, следи за буфером, завершай вовремя.</Typography>
                </Box>
                <Button variant="outlined" startIcon={<AddIcon />} onClick={openCreate}>
                  Добавить задачу
                </Button>
              </Stack>

              {saveStatus === "error" ? (
                <Alert severity="error">{saveError || "Не удалось сохранить задачи."}</Alert>
              ) : null}

              {saveStatus === "saved" && lastSavedAt ? (
                <Alert severity="success">
                  Сохранено {new Date(lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Alert>
              ) : null}

              <Paper sx={{ p: 3 }}>
                <Stack sx={{ flex: 1 }} spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <AccessTimeIcon />
                    <Typography sx={{ fontWeight: 700 }}>Завершаю в:</Typography>
                    <TextField
                      type="time"
                      size="small"
                      value={state.bedtime}
                      onChange={(e) => dispatch({ type: "setBedtime", bedtime: e.target.value })}
                      sx={{ width: 160 }}
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
                    <Box sx={{ height: 1 }} />
                  )}
                </Stack>

                {warningActualMissingDone ? (
                  <Alert severity="warning" sx={{ mt: 2 }}>
                    Есть выполненные задачи без фактического времени — расчёт может быть неточным.
                  </Alert>
                ) : null}
              </Paper>

              <Paper sx={{ p: 3 }}>
                <Stack spacing={2}>
                  <Typography variant="h3">Таймер (по формуле)</Typography>

                  {!bedtimeValid ? (
                    <Alert severity="error">Укажи корректное время “Завершаю в:” иначе таймер не считается.</Alert>
                  ) : (
                    <>
                      <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
                        <Box sx={{ flex: 1 }}>
                          <Typography sx={{ opacity: 0.8, fontSize: 14 }}>Остаток буфера до завершения:</Typography>
                          <Typography className="hero-metric-value">
                            {bufferMs === null ? "--:--:--" : formatDurationMs(bufferMs)}
                          </Typography>
                          <Typography sx={{ opacity: 0.7, fontSize: 13 }}>
                            Формула: (дедлайн − сейчас) − Σ(план незавершённых) − Σ(факт завершённых)
                          </Typography>
                        </Box>

                        <Stack spacing={1} sx={{ minWidth: { md: 320 } }}>
                          <Chip
                            label={
                              timeUntilBedMs === null ? "До завершения: —" : `До завершения: ${formatDurationMs(timeUntilBedMs)}`
                            }
                            sx={{ bgcolor: "var(--accent-a1)", color: "#121212" }}
                          />
                          <Chip label={`Минут работы (всего): ${sums.totalWorkMin}`} sx={{ bgcolor: "var(--accent-a2)", color: "#121212" }} />
                          <Chip
                            label={
                              bedtimeDateMs === null
                                ? "Финиш: —"
                                : `Финиш если начать сейчас: ${new Date(completionAtMs).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}`
                            }
                            sx={{
                              bgcolor: completionAtMs > (bedtimeDateMs ?? 0) ? "var(--accent-a4)" : "var(--accent-a3)",
                              color: "#121212",
                            }}
                          />
                        </Stack>
                      </Stack>

                      <Box>
                        <Typography sx={{ opacity: 0.8, fontSize: 13, mb: 0.5 }}>
                          Занятость до сна (work / timeUntilBed)
                        </Typography>
                        <LinearProgress
                          variant="determinate"
                          value={Math.min(100, progress ?? 0)}
                          sx={{
                            height: 12,
                            borderRadius: 999,
                            bgcolor: "var(--surface-2)",
                            border: "2px solid var(--border-color)",
                            boxShadow: "var(--shadow-hover)",
                          }}
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

              <Paper sx={{ p: 3 }}>
                <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between">
                  <Typography variant="h3">Список задач</Typography>
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
                                <Typography sx={{ fontWeight: 700 }}>{t.title}</Typography>
                              </TableCell>

                              <TableCell>{t.plannedMin}</TableCell>

                              <TableCell>
                                {t.actualMin === null || t.actualMin === undefined ? (
                                  <Typography sx={{ opacity: 0.6 }}>{t.done ? "— (будет = план)" : "—"}</Typography>
                                ) : (
                                  t.actualMin
                                )}

                                {factMissing ? (
                                  <Typography sx={{ color: "warning.main", fontSize: 12 }}>факта нет</Typography>
                                ) : null}
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

                                  <Typography component="span" sx={{ fontFamily: "monospace", fontWeight: 700, flex: "0 0 auto" }}>
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
        </Box>

        <Box className="section" id="showcase">
          <Box className="container">
            <Stack spacing={2}>
              <Typography variant="h2">Шоукейс дня</Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                {["Все", "Фокус", "В процессе", "Готово"].map((label) => (
                  <Chip
                    key={label}
                    label={label}
                    sx={{
                      bgcolor: label === "Все" ? "var(--accent-a1)" : "var(--accent-a2)",
                      color: "#121212",
                    }}
                  />
                ))}
              </Stack>
              <Box className="grid-3">
                {showcaseCards.map((card) => (
                  <Paper key={card.title} sx={{ p: 3 }}>
                    <Chip label={card.tag} sx={{ bgcolor: "var(--accent-a3)", color: "#121212" }} />
                    <Typography variant="h3" sx={{ mt: 2 }}>
                      {card.title}
                    </Typography>
                    <Typography sx={{ color: "text.secondary", mt: 1 }}>Собранный блок для спокойного контроля.</Typography>
                  </Paper>
                ))}
              </Box>
            </Stack>
          </Box>
        </Box>

        <Box className="section" id="pricing">
          <Box className="container">
            <Stack spacing={2}>
              <Typography variant="h2">Планы под твой режим</Typography>
              <Box className="grid-3">
                {pricingPlans.map((plan, idx) => (
                  <Paper
                    key={plan.title}
                    sx={{
                      p: 3,
                      bgcolor: "background.paper",
                      transform: idx === 1 ? "translateY(-8px)" : "none",
                    }}
                  >
                    <Typography variant="h3">{plan.title}</Typography>
                    <Typography sx={{ fontSize: 24, fontWeight: 800, mt: 1 }}>{plan.price}</Typography>
                    <Typography sx={{ color: "text.secondary", mt: 1 }}>{plan.description}</Typography>
                    {idx === 1 ? (
                      <Chip label="Популярный" sx={{ mt: 2, bgcolor: "var(--accent-a3)", color: "#121212" }} />
                    ) : null}
                    <Button variant="contained" sx={{ mt: 2, bgcolor: "var(--accent-a1)" }}>
                      Выбрать
                    </Button>
                  </Paper>
                ))}
              </Box>
            </Stack>
          </Box>
        </Box>

        <Box className="section" id="faq">
          <Box className="container">
            <Stack spacing={2}>
              <Typography variant="h2">FAQ</Typography>
              {faqItems.map((item) => (
                <Accordion key={item.question} className="neo-accordion">
                  <AccordionSummary expandIcon={<Box className="faq-icon">+</Box>}>
                    <Typography variant="h3">{item.question}</Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    <Typography color="text.secondary">{item.answer}</Typography>
                  </AccordionDetails>
                </Accordion>
              ))}
            </Stack>
          </Box>
        </Box>

        <Box className="section footer-section">
          <Box className="container">
            <Stack direction={{ xs: "column", md: "row" }} spacing={4} justifyContent="space-between">
              <Box>
                <Typography variant="h3">Day time planner</Typography>
                <Typography sx={{ color: "text.secondary", mt: 1 }}>
                  Смелый планер для спокойных вечеров.
                </Typography>
                <Button variant="contained" sx={{ mt: 2 }} onClick={openCreate}>
                  Начать сегодня
                </Button>
              </Box>
              <Stack direction="row" spacing={4}>
                <Stack spacing={1}>
                  <Typography variant="subtitle1">Продукт</Typography>
                  <Box component="a" href="#features" className="footer-link">
                    Функции
                  </Box>
                  <Box component="a" href="#planner" className="footer-link">
                    Планер
                  </Box>
                  <Box component="a" href="#pricing" className="footer-link">
                    Тарифы
                  </Box>
                </Stack>
                <Stack spacing={1}>
                  <Typography variant="subtitle1">Поддержка</Typography>
                  <Box component="a" href="#faq" className="footer-link">
                    FAQ
                  </Box>
                  <Box component="a" href="#showcase" className="footer-link">
                    Шоукейс
                  </Box>
                  <Box component="a" href="#overview" className="footer-link">
                    Наверх
                  </Box>
                </Stack>
              </Stack>
            </Stack>
            <Divider sx={{ my: 3 }} />
            <Typography variant="caption" sx={{ color: "text.secondary" }}>
              © 2024 Day time planner. Все права защищены.
            </Typography>
          </Box>
        </Box>
      </Box>

      <TaskDialog open={dialogOpen} mode={dialogMode} initialTask={editingTask} onCancel={closeDialog} onSubmit={submitTask} />
    </ThemeProvider>
  );
}
