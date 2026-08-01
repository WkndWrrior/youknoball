# Question Bank Quality Audit Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the approved question rewrites, audit all 194 ready questions, and strengthen the reusable trivia-writing skill.

**Architecture:** Versioned Supabase migrations update canonical question rows with UUID-plus-text fallback matching and row-count safeguards. Focused Vitest contract tests lock the exact rewrites and difficulty changes. A review artifact records the broader audit, while the personal trivia skill is updated through baseline and forward testing.

**Tech Stack:** PostgreSQL/Supabase migrations, TypeScript, Vitest, Codex personal skills, authoritative sports sources.

---

### Task 1: Lock the approved batch with a failing migration contract

**Files:**
- Create: `src/lib/__tests__/questionReviewAugust2026Migration.test.ts`
- Create later: `supabase/migrations/202608010002_question_review_updates.sql`

**Step 1: Write the failing test**

Read `202608010002_question_review_updates.sql` and assert that it contains all eight canonical target UUIDs, all approved final question texts, the two medium difficulty updates, the active UConn UUID, UUID-plus-old-text fallback matching, source-note updates, and row-count exceptions.

**Step 2: Run the test to verify RED**

Run: `npm test -- src/lib/__tests__/questionReviewAugust2026Migration.test.ts`

Expected: FAIL because the migration does not exist.

**Step 3: Commit the failing contract**

```bash
git add src/lib/__tests__/questionReviewAugust2026Migration.test.ts
git commit -m "test: define approved question review updates"
```

### Task 2: Implement the approved question migration

**Files:**
- Create: `supabase/migrations/202608010002_question_review_updates.sql`
- Test: `src/lib/__tests__/questionReviewAugust2026Migration.test.ts`

**Step 1: Add guarded updates**

For each canonical question, use `update public.questions q ... from public.sports s` with:

```sql
q.sport_id = s.id
and s.slug = '<sport>'
and (
  q.id = '<deployed-uuid>'::uuid
  or q.question_text = '<exact prior text>'
)
```

After each update, use `get diagnostics updated_count = row_count` and require exactly one row. Update `question_text`, requested `difficulty`, authoritative `source_notes`, `reviewed_at`, and `updated_at`.

Target the active UConn row `664e8135-bf10-4642-94fd-b4209a302c51`; do not reactivate or rewrite retired UUID `14e2c0ff-1cc2-4b0d-9b32-801acfa77883`.

**Step 2: Run focused tests**

Run: `npm test -- src/lib/__tests__/questionReviewAugust2026Migration.test.ts`

Expected: PASS.

**Step 3: Run migration-related tests**

Run: `npm test -- src/lib/__tests__/*Migration.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add supabase/migrations/202608010002_question_review_updates.sql src/lib/__tests__/questionReviewAugust2026Migration.test.ts
git commit -m "feat: apply approved question review updates"
```

### Task 3: Baseline-test and update the trivia-writing skill

**Files:**
- Modify outside repository: `/Users/teddy/.codex/skills/trivia-question-writing/SKILL.md`
- Create: `docs/plans/2026-08-01-trivia-skill-evaluation.md`

**Step 1: Run baseline scenarios without the skill**

Use fresh subagents on unseen sample questions that test: missing sport context, broad geography, misuse of `broadcasted`, unquoted nicknames, non-answer-leaking records, difficulty reassessment, and a retired duplicate with an active canonical replacement.

Record the prompts, relevant outputs, and concrete misses in the evaluation document.

**Step 2: Verify RED**

Expected: At least one baseline output misses a target judgment rule. If all scenarios pass naturally, do not add redundant skill guidance; design a harder unseen scenario before editing.

**Step 3: Apply the minimal skill update**

Add concise rules and checklist items covering only the observed baseline gaps. Keep the existing frontmatter and examples unless a new example materially replaces a weaker one.

**Step 4: Validate and forward-test**

Run the skill validator from the `skill-creator` package, then run the same and at least one unseen scenario with the updated skill. Record results.

**Step 5: Commit the repository evaluation artifact**

```bash
git add docs/plans/2026-08-01-trivia-skill-evaluation.md
git commit -m "docs: validate trivia writing guidance"
```

The personal skill file is verified separately because it is outside this repository.

### Task 4: Audit NBA and CBB ready questions

**Files:**
- Create: `docs/plans/2026-08-01-question-bank-audit.md`
- Create: `src/lib/__tests__/questionBankPolishMigration.test.ts`
- Create later: `supabase/migrations/202608010003_question_bank_polish.sql`

**Step 1: Review every NBA and CBB ready row**

For each question, check the seven audit rules in the design. Record only questions requiring a rewrite, difficulty change, or retirement. Preserve already strong questions.

**Step 2: Verify factual additions**

Use primary league, school, Hall of Fame, or NCAA sources where available. Record source links beside every proposed change.

**Step 3: Add the audit entries**

For every change, document UUID, sport, old text, new text, old/new difficulty, action, reason, and source.

**Step 4: Write failing migration assertions**

Add exact assertions for the NBA/CBB changes to `questionBankPolishMigration.test.ts` before creating the migration.

**Step 5: Run the test to verify RED**

Run: `npm test -- src/lib/__tests__/questionBankPolishMigration.test.ts`

Expected: FAIL because `202608010003_question_bank_polish.sql` does not exist.

### Task 5: Audit NFL and CFB ready questions

**Files:**
- Modify: `docs/plans/2026-08-01-question-bank-audit.md`
- Modify: `src/lib/__tests__/questionBankPolishMigration.test.ts`

Repeat Task 4 for every ready NFL and CFB row. Enforce Roman numeral plus Arabic number formatting for every Super Bowl reference. Add assertions before migration implementation.

### Task 6: Audit MLB and NHL ready questions

**Files:**
- Modify: `docs/plans/2026-08-01-question-bank-audit.md`
- Modify: `src/lib/__tests__/questionBankPolishMigration.test.ts`

Repeat Task 4 for every ready MLB and NHL row. Treat current career-leader wording as temporally unstable unless the fact is framed with a verified as-of date or is sufficiently durable for the product.

### Task 7: Implement the broader bank-polish migration

**Files:**
- Create: `supabase/migrations/202608010003_question_bank_polish.sql`
- Test: `src/lib/__tests__/questionBankPolishMigration.test.ts`

**Step 1: Confirm RED covers every audit action**

Run: `npm test -- src/lib/__tests__/questionBankPolishMigration.test.ts`

Expected: FAIL because the migration is absent.

**Step 2: Implement guarded updates and retirements**

Use UUID-plus-sport-and-prior-text fallback matching. For retirements set `status = 'retired'`, both eligibility flags false, and review timestamps. Assert exactly one affected row for every action.

**Step 3: Run focused tests**

Run: `npm test -- src/lib/__tests__/questionBankPolishMigration.test.ts`

Expected: PASS.

**Step 4: Review migration against audit artifact**

Confirm every documented action appears exactly once in SQL and every SQL action appears in the audit.

**Step 5: Commit**

```bash
git add docs/plans/2026-08-01-question-bank-audit.md src/lib/__tests__/questionBankPolishMigration.test.ts supabase/migrations/202608010003_question_bank_polish.sql
git commit -m "feat: polish ready question bank"
```

### Task 8: Verify, review, integrate, and deploy

**Step 1: Run full verification**

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: 0 failures, 0 lint errors, successful production build, and no whitespace errors.

**Step 2: Inspect branch scope**

Run: `git status --short` and `git diff --stat main...HEAD`.

Expected: only design/plan docs, skill evaluation, audit artifact, migration tests, and the two new migrations are changed.

**Step 3: Request final content and code review**

Review factual sourcing, difficulty, answer leakage, mobile length, migration portability, and exact audit-to-SQL correspondence. Resolve every material finding and rerun verification.

**Step 4: Merge using the selected integration workflow**

Use `superpowers:finishing-a-development-branch`. After local merge, rerun tests, lint, and build on `main`.

**Step 5: Deploy after approval**

Run `npx supabase migration list`, `npx supabase db push`, and a final migration-list check. Query changed rows read-only to confirm texts, difficulties, statuses, and eligibility flags.
