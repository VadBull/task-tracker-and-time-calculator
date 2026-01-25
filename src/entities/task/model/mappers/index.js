import { clampInt, safeRandomId } from "../logic.js";

/**
 * @typedef {import("../types").PlannerState} PlannerState
 * @typedef {import("../types").SharedStateDTO} SharedStateDTO
 * @typedef {import("../types").Task} Task
 */

/**
 * @param {SharedStateDTO} incoming
 * @returns {PlannerState}
 */
export function dtoToDomain(incoming) {
  const base = incoming && typeof incoming === "object" ? incoming : {};

  const bedtime = typeof base.bedtime === "string" ? base.bedtime : "22:30";
  const tasksRaw = Array.isArray(base.tasks) ? base.tasks : [];

  const updatedAt =
    typeof base.updatedAt === "number" && Number.isFinite(base.updatedAt) ? base.updatedAt : Date.now();

  /** @type {Task[]} */
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

/**
 * @param {PlannerState} state
 * @returns {PlannerState}
 */
export function domainToViewModel(state) {
  return {
    ...state,
    tasks: state.tasks.map((task) => ({ ...task })),
  };
}
