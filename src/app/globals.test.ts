import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const stylesheet = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

describe("global scrollbar styling", () => {
  it("hides only the root page scrollbar", () => {
    expect(stylesheet).toMatch(/html\s*\{[^}]*scrollbar-width:\s*none;/s);
    expect(stylesheet).toMatch(
      /html::-(?:webkit-)?scrollbar\s*\{[^}]*display:\s*none;/s,
    );
    expect(stylesheet).not.toMatch(/\*::-(?:webkit-)?scrollbar/);
  });
});
