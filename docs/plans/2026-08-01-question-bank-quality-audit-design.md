# Question Bank Quality Audit Design

## Goal

Improve the full ready-question bank using the established You Kno Ball trivia voice while preserving factual accuracy, answer fairness, mobile readability, and intended difficulty.

## Scope

- Apply the eight user-approved question updates.
- Review all 194 currently ready questions across NBA, CBB, NFL, CFB, MLB, and NHL.
- Automatically apply clear improvements and document every rewrite, difficulty change, and retirement.
- Update the personal `trivia-question-writing` skill with reusable lessons from this review.
- Leave questions unchanged when they already provide a specific, lively, fair clue.

## Audit Rules

Each ready question is checked for:

1. A true, sourceable fact and one unambiguous answer.
2. Enough sport, league, event, season, round, or game context to stand alone.
3. One interesting detail such as a record, streak, margin, seed, era, or stakes when it adds personality without revealing the answer.
4. Precise language, including standard sports usage, quoted nicknames, and geography that is more specific than a broad region.
5. Difficulty that still matches the knowledge required after the rewrite.
6. Mobile-friendly length and answer choices that remain plausible.
7. No duplicate or near-duplicate ready question testing the same fact in substantially the same way.

Clear fixes are applied automatically. A question is retired only when it is duplicated, factually unstable, or cannot be made fair through rewriting.

## Approved Batch

- Preserve the Michael Jordan/Craig Ehlo question unchanged.
- Add NCAA men's basketball context, UCLA's seven-title run, and double overtime to the 1974 NC State question.
- Keep `broadcast` as the standard past tense and add the 1921 rivalry context to the first college-football radio broadcast question.
- Describe Mike Bibby as a freshman phenom and add Arizona's three No. 1-seed victories.
- Leave the retired UConn duplicate retired and update its active canonical replacement with UConn's 31-8 record and six double-digit tournament wins.
- Quote `Coach K`.
- Add college-football context and the 1953-57 span to Oklahoma's 47-game streak question, moving it from easy to medium.
- Add Pete Maravich's 3,667 points, three varsity seasons, and no-shot-clock/no-3-point-line context, moving it from easy to medium.
- Replace the broad `West Coast player` framing with Terry Baker's precise Portland, Oregon, high-school context while preserving the hard difficulty.

## Data Changes

Question changes are delivered through new, versioned Supabase migrations. Each update must:

- Match the deployed UUID when present.
- Fall back to the sport slug and exact prior question text so fresh databases with generated seed UUIDs still migrate correctly.
- Assert the expected row count and fail rather than silently skipping or changing multiple rows.
- Update `source_notes`, `reviewed_at`, and `updated_at` when factual context changes.

The original seed migrations remain unchanged because they have already run in production.

## Skill Update

The existing `trivia-question-writing` skill remains concise. Its guidance will be expanded only with reusable judgment rules demonstrated by this audit:

- Make every question understandable outside its category page.
- Prefer precise geography over broad regional labels.
- Use standard idiomatic sports language rather than colloquial grammatical substitutions.
- Quote nicknames and common monikers.
- Add records and stakes only when they do not leak the answer.
- Reassess difficulty after every rewrite.
- Update the active canonical question when a referenced duplicate is already retired.

The skill change follows a baseline and forward-test cycle before it is considered complete.

## Verification

- Migration contract tests fail before each migration and pass afterward.
- Every changed factual detail is verified against an authoritative source.
- A review artifact lists old text, new text, sport, difficulty changes, retirements, and source links.
- The skill is validated and forward-tested on unseen question rewrites.
- Full application tests, lint, production build, and `git diff --check` pass.
- The live Supabase migration is applied only after final review and branch integration approval.
