import { beforeEach, describe, expect, it, vi } from "vitest";
import { taskReducer } from "./reducer";

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

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-02-01T10:00:00.000Z"));
});

describe("taskReducer", () => {
  it("creates, updates, and deletes tasks", () => {
    const initial = baseState({ tasks: [baseTask()] });

    const createdTask = baseTask({ id: "task-2", title: "New" });
    const created = taskReducer(initial, { type: "createTask", task: createdTask });
    expect(created.tasks).toHaveLength(2);
    expect(created.tasks[0]).toEqual(createdTask);
    expect(created.updatedAt).toBe(Date.now());

    const updatedTask = { ...createdTask, title: "Updated" };
    const updated = taskReducer(created, { type: "updateTask", task: updatedTask });
    expect(updated.tasks.find((task) => task.id === "task-2").title).toBe("Updated");

    const deleted = taskReducer(updated, { type: "deleteTask", id: "task-2" });
    expect(deleted.tasks.some((task) => task.id === "task-2")).toBe(false);
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
    expect(stopped.timerRunning).toBe(false);
    expect(stopped.timerStartedAtMs).toBeNull();
    expect(stopped.timerAccumulatedMs).toBe(4_000);
    expect(stopped.actualMin).toBe(1);

    const started = result.tasks.find((task) => task.id === "task-2");
    expect(started.timerRunning).toBe(true);
    expect(started.timerStartedAtMs).toBe(5_000);
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

    expect(updated.timerRunning).toBe(false);
    expect(updated.timerStartedAtMs).toBeNull();
    expect(updated.timerAccumulatedMs).toBe(8_000);
    expect(updated.actualMin).toBe(1);
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
    expect(task.done).toBe(true);
    expect(task.actualMin).toBe(25);
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
    expect(task.timerRunning).toBe(false);
    expect(task.timerStartedAtMs).toBeNull();
    expect(task.actualMin).toBe(1);
  });
});
