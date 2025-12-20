import React, { useEffect, useMemo, useReducer, useState } from "react";
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
  Checkbox,
  Tooltip,
  LinearProgress,
  Alert,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import AddIcon from "@mui/icons-material/Add";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import FactCheckIcon from "@mui/icons-material/FactCheck";

const STORAGE_KEY = "sleep_tasks_v1";

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

  // строго > 19:00 (1140), и строго < 23:59 (1439)
  return mins > 19 * 60 && mins < (23 * 60 + 59);
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
        plannedMin: clampInt(t.plannedMin, { min: 0, max: 10_000 }),
        actualMin:
          t.actualMin === null || t.actualMin === undefined
            ? null
            : clampInt(t.actualMin, { min: 0, max: 10_000 }),
        done: Boolean(t.done),
        createdAt: typeof t.createdAt === "string" ? t.createdAt : new Date().toISOString(),
        updatedAt: typeof t.updatedAt === "string" ? t.updatedAt : new Date().toISOString(),
      }))
      .filter((t) => t.title.trim().length > 0);

    return { bedtime, tasks: normalizedTasks };
  } catch {
    return null;
  }
}

function saveState({ bedtime, tasks }) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ bedtime, tasks }));
}

function reducer(state, action) {
  switch (action.type) {
    case "init":
      return action.payload;

    case "setBedtime":
      return { ...state, bedtime: action.bedtime };

    case "createTask": {
      const next = [action.task, ...state.tasks];
      return { ...state, tasks: next };
    }

    case "updateTask": {
      const next = state.tasks.map((t) => (t.id === action.task.id ? action.task : t));
      return { ...state, tasks: next };
    }

    case "deleteTask": {
      const next = state.tasks.filter((t) => t.id !== action.id);
      return { ...state, tasks: next };
    }

    case "toggleDone": {
      const next = state.tasks.map((t) => {
        if (t.id !== action.id) return t;

        const nextDone = action.done;
        // если отмечаем "готово" и факта нет — подставим план как дефолт
        const nextActual = nextDone
          ? (t.actualMin === null || t.actualMin === undefined ? t.plannedMin : t.actualMin)
          : t.actualMin;

        return {
          ...t,
          done: nextDone,
          actualMin: nextActual,
          updatedAt: new Date().toISOString(),
        };
      });
      return { ...state, tasks: next };
    }

    case "resetAll": {
      return { bedtime: "22:30", tasks: [] };
    }

    default:
      return state;
  }
}

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
    setActualMin(
      t?.actualMin === null || t?.actualMin === undefined ? "" : String(t.actualMin)
    );

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
      });

    const finalActual =
      done ? (actualParsed === null ? plannedMin : actualParsed) : actualParsed;

    onSubmit({
      ...base,
      title: title.trim(),
      plannedMin: clampInt(plannedMin, { min: 0, max: 10_000 }),
      done: Boolean(done),
      actualMin: finalActual,
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
            helperText={
              done
                ? "Если оставить пустым — возьмём план как факт"
                : "Факт можно заполнить позже при завершении"
            }
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

export default function App() {
  const theme = useMemo(
    () =>
      createTheme({
        palette: {
          mode: "dark",
          primary: { main: "#4c7dff" },
          background: {
            default: "#0b1020",
            paper: "#121a33",
          },
        },
        shape: { borderRadius: 14 },
        typography: {
          fontFamily:
            'system-ui, -apple-system, Segoe UI, Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif',
        },
      }),
    []
  );

  const [state, dispatch] = useReducer(reducer, {
    bedtime: "22:30",
    tasks: [],
  });

  const [nowMs, setNowMs] = useState(Date.now());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState("create"); // create | edit
  const [editingTask, setEditingTask] = useState(null);

  // init from localStorage
  useEffect(() => {
    const saved = loadState();
    if (saved) dispatch({ type: "init", payload: saved });
  }, []);

  // persist
  useEffect(() => {
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
    // прогресс от "сейчас до сна", относительно "сейчас + работы".
    // если буфер >= 0: работа помещается, можно показать загрузку "занятости"
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
    dispatch({ type: "toggleDone", id, done });
  }

  const warningActualMissingDone = useMemo(() => {
    // done=true и actualMin пустой/undefined — в нашем reducer такое почти не останется,
    // но на всякий случай подсветим.
    return state.tasks.some((t) => t.done && (t.actualMin === null || t.actualMin === undefined));
  }, [state.tasks]);

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />

      <AppBar position="sticky" elevation={0} sx={{ bgcolor: "background.paper" }}>
        <Toolbar sx={{ gap: 1.5 }}>
          <BedtimeIcon />

          <Typography variant="h6" sx={{ fontWeight: 900 }}>
            Tasks + Sleep Timer
          </Typography>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Сбросить всё (сон + задачи)">
            <IconButton onClick={() => dispatch({ type: "resetAll" })}>
              <RestartAltIcon />
            </IconButton>
          </Tooltip>

          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Добавить задачу
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: 2 }}>
        <Stack spacing={2} sx={{ maxWidth: 1100, mx: "auto" }}>
          <Paper sx={{ p: 2 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
              <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: 1 }}>
                <AccessTimeIcon />

                <Typography sx={{ fontWeight: 900 }}>Ложусь спать</Typography>

                <TextField
                  type="time"
                  size="small"
                  value={state.bedtime}
                  onChange={(e) => dispatch({ type: "setBedtime", bedtime: e.target.value })}
                  sx={{ width: 140 }}
                  error={!bedtimeValid}
                  helperText={
                    bedtimeValid
                      ? " "
                      : "Строго больше 19:00 и строго меньше 23:59"
                  }
                />
              </Stack>

              <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                <Chip
                  icon={<FactCheckIcon />}
                  label={`Готово (факт): ${sums.actualDoneMin} мин`}
                />

                <Chip label={`Осталось (план): ${sums.plannedNotDoneMin} мин`} />

                <Chip label={`Всего работ: ${sums.totalWorkMin} мин`} />
              </Stack>
            </Stack>

            {warningActualMissingDone ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Есть выполненные задачи без фактического времени — расчёт может быть неточным.
              </Alert>
            ) : null}
          </Paper>

          <Paper sx={{ p: 2 }}>
            <Stack spacing={1}>
              <Typography sx={{ fontWeight: 900 }}>Таймер (по формуле)</Typography>

              {!bedtimeValid ? (
                <Alert severity="error">
                  Укажи корректное время “Ложусь спать”, иначе таймер не считается.
                </Alert>
              ) : (
                <>
                  <Stack
                    direction={{ xs: "column", md: "row" }}
                    spacing={2}
                    alignItems={{ xs: "stretch", md: "center" }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ opacity: 0.8, fontSize: 13 }}>
                        Остаток буфера до сна:
                      </Typography>

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
                        Формула: (сон − сейчас) − Σ(план незавершённых) − Σ(факт завершённых)
                      </Typography>
                    </Box>

                    <Stack spacing={1} sx={{ minWidth: { md: 340 } }}>
                      <Chip
                        label={
                          timeUntilBedMs === null
                            ? "До сна: —"
                            : `До сна: ${formatDurationMs(timeUntilBedMs)}`
                        }
                      />

                      <Chip label={`Минут работы (всего): ${sums.totalWorkMin}`} />

                      <Chip
                        color={
                          bedtimeDateMs !== null && completionAtMs > bedtimeDateMs
                            ? "error"
                            : "success"
                        }
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
              <Typography sx={{ fontWeight: 900 }}>Список задач</Typography>

              <Button variant="outlined" onClick={openCreate} startIcon={<AddIcon />}>
                Добавить
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            {state.tasks.length === 0 ? (
              <Alert severity="info">
                Пока задач нет. Добавь задачу — и таймер начнёт учитывать план/факт.
              </Alert>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell width={60}>Готово</TableCell>
                    <TableCell>Название</TableCell>
                    <TableCell width={140}>План (мин)</TableCell>
                    <TableCell width={160}>Факт (мин)</TableCell>
                    <TableCell width={160}>Используется</TableCell>
                    <TableCell width={120} align="right">
                      Действия
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {state.tasks.map((t) => {
                    const usedMin = t.done
                      ? (t.actualMin === null || t.actualMin === undefined ? 0 : t.actualMin)
                      : t.plannedMin;

                    const usedLabel = t.done ? `факт: ${usedMin}` : `план: ${usedMin}`;

                    const factMissing = t.done && (t.actualMin === null || t.actualMin === undefined);

                    return (
                      <TableRow key={t.id} hover>
                        <TableCell>
                          <Checkbox
                            checked={t.done}
                            onChange={(e) => toggleDone(t.id, e.target.checked)}
                          />
                        </TableCell>

                        <TableCell>
                          <Typography sx={{ fontWeight: 800 }}>{t.title}</Typography>

                          <Typography sx={{ opacity: 0.6, fontSize: 12 }}>
                            Обновлено:{" "}
                            {new Date(t.updatedAt || t.createdAt).toLocaleString()}
                          </Typography>
                        </TableCell>

                        <TableCell>{t.plannedMin}</TableCell>

                        <TableCell>
                          {t.actualMin === null || t.actualMin === undefined ? (
                            <Typography sx={{ opacity: 0.6 }}>
                              {t.done ? "— (будет = план)" : "—"}
                            </Typography>
                          ) : (
                            t.actualMin
                          )}

                          {factMissing ? (
                            <Typography sx={{ color: "warning.main", fontSize: 12 }}>
                              факта нет
                            </Typography>
                          ) : null}
                        </TableCell>

                        <TableCell>
                          <Chip
                            size="small"
                            label={usedLabel}
                            color={t.done ? "success" : "default"}
                          />
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
            )}
          </Paper>
        </Stack>
      </Box>

      <TaskDialog
        open={dialogOpen}
        mode={dialogMode}
        initialTask={editingTask}
        onCancel={closeDialog}
        onSubmit={submitTask}
      />
    </ThemeProvider>
  );
}
