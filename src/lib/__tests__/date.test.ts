import { afterEach, describe, expect, it, vi } from "vitest";

import { getTodayIsoDate } from "@/lib/date";

describe("getTodayIsoDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps the previous challenge active until 12:01 AM America/Chicago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T05:00:30.000Z"));

    expect(getTodayIsoDate()).toBe("2026-04-12");
  });

  it("switches to the new challenge date at 12:01 AM America/Chicago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T05:01:00.000Z"));

    expect(getTodayIsoDate()).toBe("2026-04-13");
  });
});
