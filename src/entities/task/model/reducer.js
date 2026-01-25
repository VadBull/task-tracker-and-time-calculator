import { stopTimerFields } from "./logic";
import { domainToViewModel } from "./mappers";

/**
 * @typedef {import("./types").PlannerState} PlannerState
 * @typedef {import("./types").Task} Task
 */

/** @type {PlannerState} */
export const DEFAULT_STATE = {
  bedtime: "22:30",
  tasks: [],
  updatedAt: 0,
};

/**
 * @param {PlannerState} state
 * @param {Object} action
 * @returns {PlannerState}
 */
export function taskReducer(state, action) {
  switch (action.type) {
    case "init":
      return domainToViewModel(action.payload);

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
