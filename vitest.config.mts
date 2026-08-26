import path from "node:path";
import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
      "server-only": path.resolve(rootDir, "src/test/serverOnly.ts"),
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".worktrees/**", "**/.worktrees/**"],
    globals: true,
  },
});
