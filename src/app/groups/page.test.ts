import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("groups pages", () => {
  it("wires the groups dashboard, detail, and join pages", async () => {
    const groupsPage = await readFile(
      path.join(process.cwd(), "src/app/groups/page.tsx"),
      "utf8",
    );
    const detailPage = await readFile(
      path.join(process.cwd(), "src/app/groups/[code]/page.tsx"),
      "utf8",
    );
    const joinPage = await readFile(
      path.join(process.cwd(), "src/app/groups/join/[code]/page.tsx"),
      "utf8",
    );

    expect(groupsPage).toContain("GroupsDashboard");
    expect(detailPage).toContain("GroupLeaderboardView");
    expect(joinPage).toContain("JoinGroupView");
  });
});
