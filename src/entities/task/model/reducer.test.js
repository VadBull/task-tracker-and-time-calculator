import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { taskReducer } from "./reducer.js";

const baseTask = (overrides = {}) => ({
  id: "task-1",
  title: "Task",
  plannedMin: 30,
  actualMin: null,
  done: false,
  createdAt: "2024-01-01T00:00:00.000Z",
  updatedAt: "2024-01-01T00:00:00.000Z",
  timerRunning: false,
  timerStartedAtMs: null,
  timerAccumulatedMs: 0,
  ...overrides,
});

const baseState = (overrides = {}) => ({
  bedtime: "22:30",
  tasks: [],
  updatedAt: 0,
  ...overrides,
});

describe("taskReducer", () => {
  it("creates, updates, and deletes tasks", () => {
    const initial = baseState({ tasks: [baseTask()] });

    const createdTask = baseTask({ id: "task-2", title: "New" });
    const created = taskReducer(initial, { type: "createTask", task: createdTask });
    assert.equal(created.tasks.length, 2);
    assert.deepEqual(created.tasks[0], createdTask);
    assert.equal(typeof created.updatedAt, "number");

    const updatedTask = { ...createdTask, title: "Updated" };
    const updated = taskReducer(created, { type: "updateTask", task: updatedTask });
    assert.equal(updated.tasks.find((task) => task.id === "task-2").title, "Updated");

    const deleted = taskReducer(updated, { type: "deleteTask", id: "task-2" });
    assert.equal(deleted.tasks.some((task) => task.id === "task-2"), false);
  });

  it("starts a timer and stops other running timers", () => {
    const runningTask = baseTask({
      id: "task-1",
      timerRunning: true,
      timerStartedAtMs: 1_000,
      timerAccumulatedMs: 0,
    });
    const targetTask = baseTask({ id: "task-2", title: "Target" });
    const initial = baseState({ tasks: [runningTask, targetTask] });

    const result = taskReducer(initial, { type: "startTimer", id: "task-2", nowMs: 5_000 });

    const stopped = result.tasks.find((task) => task.id === "task-1");
    assert.equal(stopped.timerRunning, false);
    assert.equal(stopped.timerStartedAtMs, null);
    assert.equal(stopped.timerAccumulatedMs, 4_000);
    assert.equal(stopped.actualMin, 1);

    const started = result.tasks.find((task) => task.id === "task-2");
    assert.equal(started.timerRunning, true);
    assert.equal(started.timerStartedAtMs, 5_000);
  });

  it("stops a timer and accumulates time", () => {
    const runningTask = baseTask({
      timerRunning: true,
      timerStartedAtMs: 2_000,
      timerAccumulatedMs: 3_000,
    });
    const initial = baseState({ tasks: [runningTask] });

    const result = taskReducer(initial, { type: "stopTimer", id: "task-1", nowMs: 7_000 });
    const updated = result.tasks[0];

    assert.equal(updated.timerRunning, false);
    assert.equal(updated.timerStartedAtMs, null);
    assert.equal(updated.timerAccumulatedMs, 8_000);
    assert.equal(updated.actualMin, 1);
    assert.equal(typeof updated.updatedAt, "string");
  });

  it("toggles done state and sets actual minutes when needed", () => {
    const initial = baseState({
      tasks: [
        baseTask({
          id: "task-1",
          plannedMin: 25,
          actualMin: null,
        }),
      ],
    });

    const toggled = taskReducer(initial, {
      type: "toggleDone",
      id: "task-1",
      done: true,
      nowMs: 5_000,
    });

    const task = toggled.tasks[0];
    assert.equal(task.done, true);
    assert.equal(task.actualMin, 25);
    assert.equal(typeof task.updatedAt, "string");
  });

  it("stops timer when toggling done", () => {
    const initial = baseState({
      tasks: [
        baseTask({
          id: "task-1",
          timerRunning: true,
          timerStartedAtMs: 1_000,
        }),
      ],
    });

    const toggled = taskReducer(initial, {
      type: "toggleDone",
      id: "task-1",
      done: true,
      nowMs: 7_000,
    });

    const task = toggled.tasks[0];
    assert.equal(task.timerRunning, false);
    assert.equal(task.timerStartedAtMs, null);
    assert.equal(task.actualMin, 1);
  });
});
