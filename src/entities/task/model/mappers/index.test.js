import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dtoToDomain } from "./index.js";

describe("dtoToDomain", () => {
  it("maps valid DTO data", () => {
    const incoming = {
      bedtime: "21:15",
      updatedAt: 123,
      tasks: [
        {
          id: "task-1",
          title: "Plan",
          plannedMin: 45,
          actualMin: 30,
          done: true,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          timerRunning: true,
          timerStartedAtMs: 1000,
          timerAccumulatedMs: 2000,
        },
      ],
    };

    const mapped = dtoToDomain(incoming);

    assert.deepEqual(mapped, {
      bedtime: "21:15",
      updatedAt: 123,
      tasks: [
        {
          id: "task-1",
          title: "Plan",
          plannedMin: 45,
          actualMin: 30,
          done: true,
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
          timerRunning: true,
          timerStartedAtMs: 1000,
          timerAccumulatedMs: 2000,
        },
      ],
    });
  });

  it("falls back to defaults for broken data", () => {
    const incoming = {
      bedtime: 101,
      updatedAt: "not-a-number",
      tasks: [
        {
          title: "   ",
          plannedMin: "not-a-number",
          actualMin: undefined,
        },
        {
          id: 55,
          title: "Valid",
          plannedMin: "0",
          actualMin: "12",
          done: "yes",
          createdAt: 123,
          updatedAt: null,
          timerRunning: "yes",
          timerStartedAtMs: "bad",
          timerAccumulatedMs: "bad",
        },
      ],
    };

    const mapped = dtoToDomain(incoming);

    assert.equal(mapped.bedtime, "22:30");
    assert.equal(typeof mapped.updatedAt, "number");
    assert.equal(mapped.tasks.length, 1);

    const task = mapped.tasks[0];
    assert.equal(typeof task.id, "string");
    assert.equal(task.title, "Valid");
    assert.equal(task.plannedMin, 1);
    assert.equal(task.actualMin, 12);
    assert.equal(task.done, true);
    assert.equal(typeof task.createdAt, "string");
    assert.equal(typeof task.updatedAt, "string");
    assert.equal(task.timerRunning, true);
    assert.equal(task.timerStartedAtMs, null);
    assert.equal(task.timerAccumulatedMs, 0);
  });
});
