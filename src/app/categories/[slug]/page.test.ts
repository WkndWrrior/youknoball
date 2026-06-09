import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("category quiz page", () => {
  it("keeps the sport identity and launches the reusable side game", async () => {
    const source = await readFile(
      path.join(process.cwd(), "src/app/categories/[slug]/page.tsx"),
      "utf8",
    );

    expect(source).toContain('import { SportQuiz } from "@/components/SportQuiz"');
    expect(source).toContain("{category.eyebrow}");
    expect(source).toContain("{category.title}");
    expect(source).toContain("{category.description}");
    expect(source).toContain("<SportQuiz slug={category.slug} title={category.title} />");
    expect(source).not.toContain("polished preview");
    expect(source).not.toContain("daily all-sports challenge stays center stage");
    expect(source).not.toContain("Play today&apos;s challenge");
  });
});
