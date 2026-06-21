import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("LeaderboardTable", () => {
  it("uses stable right-aligned stat columns", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/components/LeaderboardTable.tsx"),
      "utf8",
    );

    expect(source).toContain(
      "grid-cols-[3.25rem_minmax(0,1fr)_4.5rem_4.5rem_4.5rem]",
    );
    expect(source).toContain("overflow-x-auto");
    expect(source).toContain("min-w-[32rem]");
    expect(source).toContain("text-right");
    expect(source).toContain("justify-self-end");
    expect(source).toContain("tabular-nums");
  });
});
