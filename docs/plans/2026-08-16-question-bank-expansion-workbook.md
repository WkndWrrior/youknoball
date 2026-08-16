# Question Bank Expansion Workbook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a review-only Excel workbook with 25 sourced, non-duplicate questions for each of You Kno Ball's six sports categories.

**Architecture:** Treat the current Supabase question bank as the duplicate baseline, prepare a structured 150-row draft dataset, validate content and difficulty constraints, then generate and render-check a workbook with one summary sheet and six sport sheets. The workbook is an offline review artifact and does not write questions back to Supabase.

**Tech Stack:** Supabase read-only query, authoritative web sources, You Kno Ball trivia-question-writing skill, JavaScript, `@oai/artifact-tool`, Excel `.xlsx`.

---

### Task 1: Capture the Current Question Baseline

**Files:**
- Create: `/tmp/youknoball-question-expansion/current-question-bank.json`

**Step 1: Read the six configured categories**

Inspect `src/lib/categories.ts` and confirm NBA, CBB, NFL, CFB, NHL, and MLB are the only workbook categories.

**Step 2: Export current questions read-only**

Query Supabase for question IDs, sport slugs, question text, answers, difficulty, and status. Save the result outside the repository in the temporary working directory.

**Step 3: Build duplicate keys**

Normalize question wording and extract the central fact/topic for each active and retired question. Retired questions remain part of the duplicate baseline.

**Step 4: Verify the baseline**

Confirm all exported rows have a sport and question text, and record counts by sport and status.

### Task 2: Draft and Verify the Questions

**Files:**
- Create: `/tmp/youknoball-question-expansion/draft-questions.json`

**Step 1: Draft each sport independently**

Apply the `trivia-question-writing` skill to produce 25 questions per category with exactly 8 easy, 9 medium, and 8 hard questions.

**Step 2: Build complete answer sets**

Give every question four plausible, mutually exclusive choices. Confirm the wording and choices leave exactly one correct answer without leaking it.

**Step 3: Source every answer**

Attach an authoritative source URL and concise fact note to every row. Prefer official league, school, governing-body, Hall of Fame, or established statistical reference pages.

**Step 4: Check duplicates and overlap**

Compare every draft against the current bank and all other drafts. Replace repeated facts, paraphrases of existing questions, and questions whose clues collapse to the same answerable fact.

**Step 5: Validate content rules**

Confirm standalone sport context, mobile-friendly length, stable wording, fair difficulty, Super Bowl numeral formatting, and factual consistency between the question, choices, correct option, note, and source.

### Task 3: Generate the Review Workbook

**Files:**
- Create: `/tmp/youknoball-question-expansion/build-workbook.mjs`
- Create: `outputs/question-bank-expansion/you-kno-ball-question-drafts.xlsx`

**Step 1: Load the spreadsheet runtime**

Use `load_workspace_dependencies`, create the required temporary `node_modules` link, and use only `@oai/artifact-tool` for workbook authoring.

**Step 2: Build the summary sheet**

Add instructions, total counts, category counts, difficulty counts, and review-status counts. Use formulas where summary values derive from sport sheets.

**Step 3: Build the six sport sheets**

Create NBA, CBB, NFL, CFB, NHL, and MLB sheets with columns for Draft ID, Question, choices A-D, Correct Choice, Correct Answer, Difficulty, Fact Note, Source URL, and Review Status.

**Step 4: Apply review-friendly formatting**

Freeze headers, enable filters, wrap long text, constrain column widths, style difficulty and review-status cells, and default Review Status to `Pending`.

**Step 5: Export the workbook**

Save one `.xlsx` file to `outputs/question-bank-expansion/`.

### Task 4: Verify the Artifact

**Files:**
- Inspect: `outputs/question-bank-expansion/you-kno-ball-question-drafts.xlsx`

**Step 1: Inspect workbook values and formulas**

Confirm 150 total rows, 25 per category, and an 8/9/8 difficulty split on every sport sheet. Check that correct-choice letters map to the listed correct answers.

**Step 2: Scan required fields and formula errors**

Confirm there are no blank questions, choices, answers, notes, sources, difficulties, or statuses. Scan for Excel formula errors.

**Step 3: Re-run duplicate checks**

Compare the final workbook content with the current question baseline and within the 150-row draft set. Resolve every exact or substantial duplicate before delivery.

**Step 4: Render every sheet**

Render the Summary and all six sport sheets. Review every render for clipping, unreadable wrapping, hidden headers, and excessive row or column sizing.

**Step 5: Correct and re-export**

Patch only observed workbook issues, then repeat the compact value and render checks.

**Step 6: Confirm repository isolation**

Run `git status --short` and confirm no migrations, application files, or Supabase data were changed by workbook creation.
