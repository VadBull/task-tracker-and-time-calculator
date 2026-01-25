import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../logic", async () => {
  const actual = await vi.importActual("../logic");
  return {
    ...actual,
    safeRandomId: vi.fn(() => "safe-id"),
  };
});

import { dtoToDomain } from "./index";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2024-02-01T10:00:00.000Z"));
});

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

    expect(mapped).toEqual({
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

    expect(mapped.bedtime).toBe("22:30");
    expect(mapped.updatedAt).toBe(Date.now());
    expect(mapped.tasks).toHaveLength(1);
    expect(mapped.tasks[0]).toEqual({
      id: "safe-id",
      title: "Valid",
      plannedMin: 1,
      actualMin: 12,
      done: true,
      createdAt: "2024-02-01T10:00:00.000Z",
      updatedAt: "2024-02-01T10:00:00.000Z",
      timerRunning: true,
      timerStartedAtMs: null,
      timerAccumulatedMs: 0,
    });
  });
});
