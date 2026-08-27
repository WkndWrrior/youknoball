# SEO Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add consistent YouKnoBall branding, route-specific search metadata and canonicals, crawl controls, a public sitemap, and homepage WebSite structured data without changing gameplay.

**Architecture:** Keep shared site URLs, approved descriptions, and category metadata in `src/lib/seo.ts`. Next.js App Router metadata exports and metadata route files will expose the values, while narrow route layouts apply metadata to client pages and entire private route groups. Focused Vitest coverage will import metadata functions directly and inspect the static homepage schema.

**Tech Stack:** Next.js 16 App Router metadata APIs, React 19, TypeScript, Vitest

---

### Task 1: Shared SEO Contract And Root Branding

**Files:**
- Create: `src/lib/seo.ts`
- Create: `src/lib/__tests__/seo.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/layout.test.tsx`

**Step 1: Write the failing tests**

Add tests that assert:

- `siteName` is exactly `YouKnoBall`.
- `siteUrl` is exactly `https://youknoball.com`.
- The public route list contains exactly the ten approved indexable routes.
- Every supported category has the approved title, description, and canonical route.
- Root metadata uses `YouKnoBall | Daily Sports Trivia` as its default title and `%s | YouKnoBall` as its title template.
- The visible header logo reads `YouKnoBall`.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/__tests__/seo.test.ts src/app/layout.test.tsx`

Expected: FAIL because `src/lib/seo.ts` does not exist and noncanonical brand variants remain.

**Step 3: Implement the shared SEO contract**

Create `src/lib/seo.ts` with typed constants for the production URL, brand name, homepage metadata, approved category metadata, and public sitemap routes. Update root metadata and the visible logo in `src/app/layout.tsx` to use `YouKnoBall`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/__tests__/seo.test.ts src/app/layout.test.tsx`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/seo.ts src/lib/__tests__/seo.test.ts src/app/layout.tsx src/app/layout.test.tsx
git commit -m "feat: establish YouKnoBall SEO metadata"
```

### Task 2: Public Page Metadata And Canonicals

**Files:**
- Create: `src/app/seo.test.ts`
- Create: `src/app/play/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/categories/page.tsx`
- Modify: `src/app/categories/[slug]/page.tsx`
- Modify: `src/app/leaderboard/page.tsx`

**Step 1: Write the failing tests**

Test the exact approved title, description, and canonical for `/`, `/play`, `/categories`, all six category routes, and `/leaderboard`. Test that unknown category metadata returns a noindex directive instead of an indexable canonical.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/seo.test.ts`

Expected: FAIL because route metadata and canonicals are missing.

**Step 3: Implement route metadata**

- Export homepage metadata from `src/app/page.tsx`.
- Add a server layout around the client `/play` page.
- Export static metadata from `/categories` and `/leaderboard`.
- Add `generateMetadata` to `/categories/[slug]` using the approved category map.
- Return `robots: { index: false, follow: false }` for unknown slugs before the page returns `notFound()`.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/seo.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/seo.test.ts src/app/play/layout.tsx src/app/page.tsx src/app/categories/page.tsx src/app/categories/[slug]/page.tsx src/app/leaderboard/page.tsx
git commit -m "feat: add canonical metadata to public pages"
```

### Task 3: Crawl Controls And Sitemap

**Files:**
- Create: `src/app/robots.ts`
- Create: `src/app/sitemap.ts`
- Create: `src/app/login/layout.tsx`
- Create: `src/app/reset-password/layout.tsx`
- Create: `src/app/groups/layout.tsx`
- Create: `src/app/admin/layout.tsx`
- Modify: `src/app/feedback/page.tsx`
- Modify: `src/app/seo.test.ts`

**Step 1: Write the failing tests**

Add assertions that:

- `robots()` allows `/`, disallows `/api/`, `/admin/`, and `/auth/`, and names the production host and sitemap.
- `sitemap()` contains exactly the ten approved canonical URLs and no fabricated freshness fields.
- Login, reset-password, feedback, group descendants, and admin descendants receive `noindex, nofollow` metadata.

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/app/seo.test.ts`

Expected: FAIL because metadata routes and private layouts do not exist.

**Step 3: Implement crawl controls**

Use `MetadataRoute.Robots` and `MetadataRoute.Sitemap` for the public files. Add narrow server layouts for client or nested route areas and extend feedback metadata with the approved robots directive.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/app/seo.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/robots.ts src/app/sitemap.ts src/app/login/layout.tsx src/app/reset-password/layout.tsx src/app/groups/layout.tsx src/app/admin/layout.tsx src/app/feedback/page.tsx src/app/seo.test.ts
git commit -m "feat: add sitemap and indexing controls"
```

### Task 4: Homepage WebSite Structured Data

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.ts`

**Step 1: Write the failing test**

Assert that the homepage includes a single `application/ld+json` script with `@type: WebSite`, name `YouKnoBall`, and URL `https://youknoball.com/`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app/page.test.ts`

Expected: FAIL because the JSON-LD block is absent.

**Step 3: Add the static schema**

Render the approved static schema in the homepage using escaped JSON serialization. Do not add visible UI or dynamic user content to the script.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/app/page.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/page.tsx src/app/page.test.ts
git commit -m "feat: add homepage website schema"
```

### Task 5: Complete Brand Normalization

**Files:**
- Modify: application and test files returned by `rg -l 'You(Know| Kno )Ball' src README.md docs`

**Step 1: Write the failing brand scan**

Run: `rg -n 'You(Know| Kno )Ball' src README.md docs`

Expected: matches in share text, feedback copy, notification emails, tests, README, and historical documentation.

**Step 2: Replace product-name literals**

Replace only noncanonical display-name variants with `YouKnoBall`. Do not change lowercase domain names, package identifiers, paths, or unrelated prose.

**Step 3: Update affected tests**

Change expected share text, API messages, email subjects/bodies, and visible copy to the canonical brand.

**Step 4: Verify the brand scan and tests**

Run: `rg -n 'You(Know| Kno )Ball' src README.md docs`

Expected: no matches.

Run: `npm test`

Expected: all tests pass.

**Step 5: Commit**

```bash
git add src README.md docs
git commit -m "fix: normalize YouKnoBall branding"
```

### Task 6: Full Verification And Integration

**Files:**
- Verify all changed files

**Step 1: Run static checks**

Run: `npm run lint`

Expected: PASS with no errors.

**Step 2: Run the full test suite**

Run: `npm test`

Expected: all tests pass.

**Step 3: Run the production build**

Run: `npm run build`

Expected: PASS; route output includes `/robots.txt` and `/sitemap.xml`.

**Step 4: Inspect the final diff**

Run: `git diff main...HEAD --check && git status --short`

Expected: no whitespace errors and only intended SEO/branding files changed.

**Step 5: Merge locally**

After review, merge `feat/seo-foundation` into local `main` and rerun the focused SEO tests from the main worktree. Do not push unless the user requests it.
