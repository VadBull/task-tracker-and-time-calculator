/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {number} plannedMin
 * @property {number | null} actualMin
 * @property {boolean} done
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} timerRunning
 * @property {number | null} timerStartedAtMs
 * @property {number} timerAccumulatedMs
 */

/**
 * @typedef {Object} PlannerState
 * @property {string} bedtime
 * @property {Task[]} tasks
 * @property {number} updatedAt
 */

/**
 * @typedef {Object} SharedStateDTO
 * @property {string=} bedtime
 * @property {Array<Object>=} tasks
 * @property {number=} updatedAt
 */

export const Task = null;
export const PlannerState = null;
export const SharedStateDTO = null;
