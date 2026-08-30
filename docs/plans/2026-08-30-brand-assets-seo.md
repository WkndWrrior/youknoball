# YouKnoBall Brand Assets And SEO Polish Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace generic site assets with an approved YouKnoBall wordmark and icon system, add one shared social preview image and web app manifest, and apply three restrained visible-copy improvements.

**Architecture:** Centralize visual brand constants and social metadata helpers in the existing SEO layer. Use Next.js App Router metadata image routes and `ImageResponse` for deterministic social and app imagery, then apply the shared social contract to every indexable public route. Keep page structure unchanged and limit visible copy edits to the three approved substitutions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, `next/og` ImageResponse, Vitest, Testing Library

---

### Task 1: Add The Brand Contract And Wordmark

**Files:**
- Create: `src/components/BrandWordmark.tsx`
- Create: `src/components/__tests__/BrandWordmark.test.tsx`
- Modify: `src/lib/seo.ts`
- Modify: `src/lib/__tests__/seo.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/layout.test.tsx`

**Step 1: Write failing brand tests**

Assert that the SEO contract exports `visualWordmark === "YOUKNOBALL"`, `compactMark === "YKB"`, `brandOrange === "#ff7a18"`, and `brandBackground === "#050505"`.

Render `BrandWordmark` and assert it exposes the accessible name `YouKnoBall`, renders `YOUKNOBALL`, and uses the brand-orange class without introducing secondary logo colors. Update the layout test to expect the visual header wordmark while retaining the canonical accessible product name.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/seo.test.ts src/components/__tests__/BrandWordmark.test.tsx src/app/layout.test.tsx
```

Expected: FAIL because the brand constants and component do not exist and the header still renders mixed-case text.

**Step 3: Implement the minimal brand system**

Add the four constants to `src/lib/seo.ts`. Create a small `BrandWordmark` component that renders the visual all-caps wordmark in the existing condensed display type and orange color, with `aria-label="YouKnoBall"`.

Replace only the header's current brand span with the component. Keep metadata and prose spelling as `YouKnoBall`.

**Step 4: Run focused tests**

Run the command from Step 2. Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/BrandWordmark.tsx src/components/__tests__/BrandWordmark.test.tsx src/lib/seo.ts src/lib/__tests__/seo.test.ts src/app/layout.tsx src/app/layout.test.tsx
git commit -m "feat: establish YouKnoBall visual identity"
```

### Task 2: Apply The Approved Visible Copy

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/app/play/page.test.ts`
- Modify: `src/app/categories/page.tsx`
- Modify: `src/app/categories/page.test.ts`
- Modify: `src/lib/categories.ts`
- Modify: the existing category-copy test returned by `rg -l "sportsCategories" src --glob "*.test.*"`
- Modify: `src/app/page.test.ts`

**Step 1: Write failing exact-copy tests**

Assert these approved strings:

```text
Five sports trivia questions, one score, and a result worth sharing.
Pick a sports trivia quiz and run five fresh questions.
NBA trivia for League Pass addicts and playoff overreactors.
```

Also assert that the old strings are absent and that no new homepage SEO section marker was added.

**Step 2: Run tests to verify they fail**

Run the focused play, categories, category-copy, and homepage tests. Expected: FAIL on the three old strings.

**Step 3: Make only the approved substitutions**

Edit the existing sentences in place. Do not add sections, cards, paragraphs, keywords, or layout wrappers.

**Step 4: Run focused tests**

Run the tests from Step 2. Expected: PASS.

**Step 5: Commit**

```bash
git add src/app/play/page.tsx src/app/play/page.test.ts src/app/categories/page.tsx src/app/categories/page.test.ts src/lib/categories.ts src/app/page.test.ts
git add "$(rg -l 'sportsCategories' src --glob '*.test.*' | head -n 1)"
git commit -m "copy: refine public sports trivia wording"
```

### Task 3: Add Shared Social Metadata And Image

**Files:**
- Create: `src/app/opengraph-image.tsx`
- Create: `src/app/twitter-image.tsx`
- Create: `src/app/metadata-images.test.tsx`
- Create: `src/components/BrandSocialImage.tsx`
- Modify: `src/lib/seo.ts`
- Modify: `src/lib/__tests__/seo.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/play/layout.tsx`
- Modify: `src/app/categories/page.tsx`
- Modify: `src/app/categories/[slug]/page.tsx`
- Modify: `src/app/leaderboard/page.tsx`
- Modify: `src/app/seo.test.ts`

**Step 1: Write failing social metadata tests**

Add a `buildSocialMetadata` contract test that verifies page-specific Open Graph and Twitter/X titles and descriptions, a `website` Open Graph type, canonical page URL, `summary_large_image`, and the one shared image URL.

Add metadata-image tests asserting:

```ts
size === { width: 1200, height: 630 }
contentType === "image/png"
alt === "YouKnoBall"
```

Verify both image routes return successful PNG responses and contain no runtime dependency on user data or external services. Extend public route metadata tests so every indexable route exposes page-specific social titles while using the same image.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/lib/__tests__/seo.test.ts src/app/seo.test.ts src/app/metadata-images.test.tsx
```

Expected: FAIL because the social helper and image routes do not exist.

**Step 3: Implement the shared metadata helper**

In `src/lib/seo.ts`, add a typed helper that receives a page title, description, and canonical path and returns matching `openGraph` and `twitter` metadata. Reference the single root image route and include explicit width, height, MIME type, and alt text.

Apply it to each indexable public route without changing existing titles, descriptions, or canonicals.

**Step 4: Generate the logo-only image**

Use `ImageResponse` to render a deterministic near-black 1200 by 630 image containing only the centered orange `YOUKNOBALL` wordmark and restrained background line detail. Do not add a subtitle, photography, sport imagery, page-specific text, or additional colors.

Share the visual JSX between Open Graph and Twitter/X routes so they cannot drift.

**Step 5: Run focused tests**

Run the command from Step 2. Expected: PASS.

**Step 6: Commit**

```bash
git add src/app/opengraph-image.tsx src/app/twitter-image.tsx src/app/metadata-images.test.tsx src/components/BrandSocialImage.tsx src/lib/seo.ts src/lib/__tests__/seo.test.ts src/app/layout.tsx src/app/page.tsx src/app/play/layout.tsx src/app/categories/page.tsx 'src/app/categories/[slug]/page.tsx' src/app/leaderboard/page.tsx src/app/seo.test.ts
git commit -m "feat: add shared social preview branding"
```

### Task 4: Replace App Icons And Add The Manifest

**Files:**
- Delete: `src/app/favicon.ico`
- Create: `src/app/icon.tsx`
- Create: `src/app/apple-icon.tsx`
- Create: `src/app/app-icon/[size]/route.tsx`
- Create: `src/components/BrandAppIcon.tsx`
- Create: `src/app/manifest.ts`
- Create: `src/app/app-assets.test.tsx`
- Modify: `src/app/layout.tsx`

**Step 1: Write failing app-asset tests**

Assert browser and Apple icon sizes and PNG content types; that the install-icon route accepts only `192` and `512`; that icon responses have the requested dimensions; and that every icon renders `YKB` in `#ff7a18` on `#050505`.

Assert the manifest name and short name are `YouKnoBall`, start URL is `/`, display is `standalone`, background is `#050505`, theme is `#ff7a18`, and icon entries reference the 192 and 512 install routes with `any maskable` purpose.

**Step 2: Run tests to verify they fail**

Run:

```bash
npm test -- src/app/app-assets.test.tsx src/app/layout.test.tsx
```

Expected: FAIL because generated icons and the manifest do not exist.

**Step 3: Implement shared compact-icon rendering**

Create a small server-only `YKB` renderer that keeps content within the central maskable safe area. Reuse it for browser, Apple, 192, and 512 outputs. Return `404` for unsupported install-icon dimensions.

**Step 4: Add the manifest and viewport color**

Create `src/app/manifest.ts` with the approved values and stable icon route references. Export Next.js viewport metadata from the root layout so browser chrome uses the same theme color.

Delete the generic Vercel `favicon.ico` after generated icon tests pass so it cannot override the new mark.

**Step 5: Run focused tests**

Run the command from Step 2. Expected: PASS.

**Step 6: Commit**

```bash
git add src/app/icon.tsx src/app/apple-icon.tsx 'src/app/app-icon/[size]/route.tsx' src/components/BrandAppIcon.tsx src/app/manifest.ts src/app/app-assets.test.tsx src/app/layout.tsx
git rm src/app/favicon.ico
git commit -m "feat: add YouKnoBall app icons and manifest"
```

### Task 5: Verify Rendering And Integrate

**Files:**
- Verify all changed files

**Step 1: Run automated checks**

Run:

```bash
npm test
npm run lint
```

Expected: all tests and lint pass.

**Step 2: Run the production build**

Load the repository root `.env.local` into the worktree shell, then run:

```bash
npm run build -- --webpack
```

Expected: PASS, with generated routes for the social image, app icons, and manifest.

**Step 3: Inspect generated assets in a browser**

Start the production server on an unused port. Use the browser testing skill to capture the homepage header at desktop and mobile widths, `/opengraph-image` at original dimensions, the browser icon enlarged for inspection, the 192 and 512 install-icon routes, and `/manifest.webmanifest`.

Confirm the full wordmark and compact mark are legible, orange is exactly `#ff7a18`, no text is clipped, and no mobile copy or controls shift incoherently.

**Step 4: Review the final diff**

Run:

```bash
git diff main...HEAD --check
git status --short
```

Expected: no whitespace errors and only approved brand, metadata, copy, test, and planning files changed.

**Step 5: Complete code review and integration**

Use `superpowers:requesting-code-review`, address findings, rerun verification, then use `superpowers:finishing-a-development-branch`. Merge locally only after the user selects that option; do not push unless requested.
