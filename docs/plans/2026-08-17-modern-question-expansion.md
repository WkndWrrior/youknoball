# Modern Question Expansion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Produce a source-verified, review-only text file containing 110 modern sports trivia questions without duplicating the live question bank.

**Architecture:** Draft questions in structured temporary JSON, validate them against a local export of the current Supabase question bank, and render the accepted rows into one plain-text review file. No application code or database records change.

**Tech Stack:** Node.js validation scripts, plain text output, authoritative sports sources.

---

### Task 1: Establish the Current-Bank Exclusion Set

**Files:**
- Read: `/tmp/youknoball-question-expansion/live-question-bank.json`
- Read: `/tmp/youknoball-question-expansion/draft-questions.json`

1. Combine the preexisting live export with the recently inserted 142-question batch.
2. Group all active and retired question text by sport.
3. Use the combined set to reject exact and fact-level duplicates.

### Task 2: Research and Draft NHL and MLB

**Files:**
- Create temporarily: `/tmp/youknoball-modern-expansion/nhl.json`
- Create temporarily: `/tmp/youknoball-modern-expansion/mlb.json`

1. Draft 25 modern NHL questions with a 5/8/12 difficulty split.
2. Draft 25 modern MLB questions with a 12/7/6 difficulty split.
3. Verify every answer against NHL, MLB, Hall of Fame, or another authoritative primary source.
4. Reject duplicate facts and answer-revealing clues.

### Task 3: Research and Draft the Other Sports

**Files:**
- Create temporarily: `/tmp/youknoball-modern-expansion/nba.json`
- Create temporarily: `/tmp/youknoball-modern-expansion/cbb.json`
- Create temporarily: `/tmp/youknoball-modern-expansion/nfl.json`
- Create temporarily: `/tmp/youknoball-modern-expansion/cfb.json`

1. Draft 15 questions per sport with five questions at each difficulty.
2. Verify answers with league, NCAA, Hall of Fame, school, or award-body sources.
3. Reject duplicate facts and wording that changes the intended difficulty.

### Task 4: Validate and Render the Review File

**Files:**
- Create: `outputs/question-bank-expansion/you-kno-ball-modern-question-drafts.txt`

1. Validate 110 unique IDs and the approved category/difficulty distributions.
2. Validate four nonempty choices, one valid answer key, and one HTTPS source per question.
3. Run exact and semantic duplicate checks against the current bank and within the new batch.
4. Render each item with ID, difficulty, question, choices, correct answer, and source.
5. Run `git diff --check` and inspect the final category counts.
