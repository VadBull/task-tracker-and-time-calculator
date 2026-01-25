import React, { useEffect, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { clampInt, safeRandomId } from "../../../entities/task/model/logic";

export default function TaskDialog({ open, mode, initialTask, onCancel, onSubmit }) {
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
