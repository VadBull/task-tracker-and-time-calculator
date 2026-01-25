import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  AppBar,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  LinearProgress,
  Paper,
  Stack,
  TextField,
  Toolbar,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BedtimeIcon from "@mui/icons-material/Bedtime";
import SaveIcon from "@mui/icons-material/Save";
import Brightness4Icon from "@mui/icons-material/Brightness4";
import Brightness7Icon from "@mui/icons-material/Brightness7";
import TaskDialog from "../../features/task-management/ui/TaskDialog";
import TaskTable from "../../features/task-management/ui/TaskTable";
import FeatureCard from "../../shared/ui/FeatureCard";
import ShowcaseCard from "../../shared/ui/ShowcaseCard";
import PricingCard from "../../shared/ui/PricingCard";
import { DEFAULT_STATE, taskReducer } from "../../entities/task/model/reducer";
import { formatDurationMs, normalizeSharedState } from "../../entities/task/model/logic";
import {
  connectSharedState,
  loadSharedState,
  loadState,
  saveSharedState,
  saveState,
  STORAGE_KEY,
} from "../../shared/api/sharedStateApi";
import {
  getBedtimeDateMs,
  getBedtimeMinutes,
  getBufferMs,
  getCompletionAtMs,
  getProgress,
  getSums,
  getTimeUntilBedMs,
  hasDoneWithoutActual,
} from "../../entities/task/model/selectors";

export default function PlannerPage({ themeMode, onToggleTheme }) {
  const [state, dispatch] = useReducer(taskReducer, DEFAULT_STATE);

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

  const bedtimeMinutes = useMemo(() => getBedtimeMinutes(state.bedtime), [state.bedtime]);
  const bedtimeValid = bedtimeMinutes !== null;

  const sums = useMemo(() => getSums(state.tasks), [state.tasks]);

  const timeUntilBedMs = useMemo(() => getTimeUntilBedMs(bedtimeMinutes, nowMs), [bedtimeMinutes, nowMs]);

  const bufferMs = useMemo(() => getBufferMs(timeUntilBedMs, sums.totalWorkMin), [timeUntilBedMs, sums.totalWorkMin]);

  const completionAtMs = useMemo(() => getCompletionAtMs(nowMs, sums.totalWorkMin), [nowMs, sums.totalWorkMin]);

  const bedtimeDateMs = useMemo(() => getBedtimeDateMs(bedtimeMinutes), [bedtimeMinutes]);

  const progress = useMemo(() => getProgress(timeUntilBedMs, sums.totalWorkMin), [timeUntilBedMs, sums.totalWorkMin]);

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

  const warningActualMissingDone = useMemo(() => hasDoneWithoutActual(state.tasks), [state.tasks]);

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
    <>
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
            <IconButton onClick={onToggleTheme} className="icon-button">
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
                  <FeatureCard key={card.title} badge={card.badge} title={card.title} body={card.body} color={card.color} />
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

              {saveStatus === "error" ? <Alert severity="error">{saveError || "Не удалось сохранить задачи."}</Alert> : null}

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

                <TaskTable
                  tasks={state.tasks}
                  nowMs={nowMs}
                  onToggleDone={toggleDone}
                  onEdit={openEdit}
                  onDelete={deleteTask}
                  onStartTimer={startTimer}
                  onStopTimer={stopTimer}
                />
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
                  <ShowcaseCard
                    key={card.title}
                    tag={card.tag}
                    title={card.title}
                    description="Собранный блок для спокойного контроля."
                  />
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
                  <PricingCard
                    key={plan.title}
                    title={plan.title}
                    price={plan.price}
                    description={plan.description}
                    highlighted={idx === 1}
                  />
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
    </>
  );
}
