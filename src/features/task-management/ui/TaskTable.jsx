import React from "react";
import {
  Alert,
  Checkbox,
  IconButton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableContainer,
  Tooltip,
  Typography,
} from "@mui/material";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import { formatDurationMs, msToMinutesCeil, taskTimerMs } from "../../../entities/task/model/logic";

export default function TaskTable({ tasks, nowMs, onToggleDone, onEdit, onDelete, onStartTimer, onStopTimer }) {
  if (!tasks.length) {
    return <Alert severity="info">Пока задач нет. Добавь задачу — и таймер начнёт учитывать план/факт.</Alert>;
  }

  return (
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
          {tasks.map((t) => {
            const factMissing = t.done && (t.actualMin === null || t.actualMin === undefined);
            const liveMs = taskTimerMs(t, nowMs);
            const liveText = formatDurationMs(liveMs);

            return (
              <TableRow key={t.id} hover>
                <TableCell>
                  <Checkbox checked={t.done} onChange={(e) => onToggleDone(t.id, e.target.checked)} />
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

                  {factMissing ? <Typography sx={{ color: "warning.main", fontSize: 12 }}>факта нет</Typography> : null}
                </TableCell>

                <TableCell align="left">
                  <Stack direction="row" alignItems="center" spacing={1} sx={{ whiteSpace: "nowrap" }}>
                    {t.timerRunning ? (
                      <Tooltip title="Остановить таймер">
                        <IconButton size="small" color="warning" onClick={() => onStopTimer(t.id)} sx={{ flex: "0 0 auto" }}>
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
                            onClick={() => onStartTimer(t.id)}
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
                    <IconButton onClick={() => onEdit(t)}>
                      <EditOutlinedIcon />
                    </IconButton>
                  </Tooltip>

                  <Tooltip title="Удалить">
                    <IconButton color="error" onClick={() => onDelete(t.id)}>
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
  );
}
