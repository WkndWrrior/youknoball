import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("categories chooser page", () => {
  it("lets players choose a sport before starting a quiz", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/app/categories/page.tsx"),
      "utf8",
    );

    expect(source).toContain('import { SportCategoryGrid } from "@/components/SportCategoryGrid"');
    expect(source).toContain("Choose your category");
    expect(source).toContain("SportCategoryGrid");
    expect(source).not.toContain("SportCategoryCards");
    expect(source).not.toContain("SportQuiz");
    expect(source).not.toContain("/categories/nba");
  });
});
