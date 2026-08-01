# Trivia Question Writing Skill Evaluation

## Scope

This evaluation tests whether the trivia-writing guidance preserves factual clarity, intended difficulty, answer concealment, and canonical question-bank state while adding useful personality and context.

## Baseline: Skill Not Loaded

Three fresh agents answered the following scenarios without reading the trivia-writing skill.

### Scenario A: Standalone wording, geography, and idiomatic language

**Prompt (condensed):** Rewrite three hard questions so they work outside their category page: a 1974 UCLA national-semifinal question missing the sport, a Terry Baker question using the broad phrase `West Coast player`, and a 1921 college football radio question using `broadcasted`. Preserve difficulty and avoid answer leakage.

**Representative outputs:**

- Added `NCAA men's basketball` to the UCLA question.
- Changed `broadcasted` to the idiomatic `broadcast live on radio`.
- Rewrote the Terry Baker clue as `Which Oregon State quarterback...`.

**Passes:** The agent made the basketball question standalone and corrected the nonstandard verb usage.

**Miss:** Naming Oregon State disclosed the answer's school in a hard question, trading broad geography for an overly revealing clue.

### Scenario B: Monikers, records, and difficulty

**Prompt (condensed):** Review questions about `Coach K`, Oklahoma's 47-game college football winning streak, the team that ended that streak, and Kobe Bryant's draft team. Add factual context where useful, preserve nicknames when appropriate, reassess difficulty, and reject details that reveal an answer.

**Representative outputs:**

- Replaced `Coach K` with `Mike Krzyzewski` instead of preserving and quoting the familiar moniker.
- Added Oklahoma's `1953 to 1957` date span but kept the question easy.
- Correctly rejected `Fighting Irish` and a Lakers trade hint because each would narrow or reveal the answer.

**Passes:** The agent applied the existing answer-leakage principle correctly to the Notre Dame and Charlotte questions.

**Misses:** It removed a useful moniker rather than quoting it, and it did not materially reassess the Oklahoma question after changing the clue burden.

### Scenario C: Canonical rows and rewrite difficulty

**Prompt (condensed):** Given an active question and a retired duplicate about the same UConn fact, choose which row to update. Then rewrite a hard 1997 Mike Bibby title question and a medium 2023 UConn coaching question with standalone context and non-revealing records.

**Representative outputs:**

- Updated only the active canonical UConn row and left the retired duplicate retired.
- Added `NCAA men's basketball` context to the Mike Bibby question but downgraded it from hard to medium.
- Kept the UConn coaching question medium after adding the 31-8 record and six double-digit tournament wins.

**Passes:** The agent handled canonical-row state correctly, made the question standalone, and recognized that UConn's added record did not leak Dan Hurley.

**Miss:** It changed the approved Mike Bibby difficulty even though the rewrite did not reduce the clue burden enough to require reclassification.

## Guidance Assessment

The existing skill already says to preserve intended difficulty, keep answers hidden, add stakes and records as context, check answer choices, and reject duplicates. The baseline agents often followed those principles, especially when rejecting direct nickname and trade hints.

The observed gaps are narrower:

- No explicit requirement makes every question understandable outside its category page.
- No rule distinguishes precise geography from broad regional wording while retaining the answer-leakage check.
- No wording rule covers idiomatic sports usage such as `broadcast` or preserving quoted monikers.
- Difficulty guidance does not explicitly say when a rewrite justifies reclassification.
- Duplicate guidance does not explain how to handle a retired row when an active canonical duplicate exists.

The skill update strengthened the existing difficulty and contextual-detail rules and added only these missing judgments. The results below test whether those changes corrected the baseline misses and generalized to unseen scenarios.

## Forward Test

The updated personal skill passed the `skill-creator` validator with `Skill is valid!`. Fresh agents then used the updated skill on the baseline scenarios and a separate unseen set.

### Same-Scenario Results

- Replaced the broad Terry Baker geography with a precise boundary that did not name Oregon State or otherwise reveal the answer; retained hard difficulty.
- Preserved `"Coach K"` as a quoted moniker; retained easy difficulty.
- Added `NCAA men's basketball` and the three No. 1 seeds to the Mike Bibby question; retained hard difficulty.
- Used `broadcast`, added the 1921 date, retained hard difficulty, and flagged the historical-first claim for verification.

These outputs corrected each material baseline miss: geography became specific without leaking the answer, the moniker was preserved and quoted, and rewrite difficulty remained stable when the clue burden did not materially change.

### Unseen-Scenario Results

- Added MLB and October context to a hard Mariano Rivera question without using team, city, or nickname clues that would reveal the answer.
- Formatted `Super Bowl LVII (57)`, added the 38-35 score and late-field-goal context, and retained medium difficulty.
- Updated only active row A when given an active question and retired duplicate R; left R retired.
- Rejected an answer-revealing college clue in an NBA geography question, substituted precise non-leaking geography, retained hard difficulty, and flagged the historical claim for verification.

### Comparison And Conclusion

Without the skill, agents leaked Terry Baker's school, removed a useful moniker, and changed difficulty without enough change in clue burden. With the minimal update, agents handled those judgments correctly in the repeated scenarios and transferred the same rules to MLB, NFL, NBA, and canonical-row examples they had not seen before.

The update closes the observed guidance gaps without replacing the existing accuracy, answer-leakage, and mobile-length rules. It does not make historical claims self-validating: first-ever broadcasts, geographic firsts, and similar claims still require authoritative source verification before database changes. The forward-tested agents correctly identified that boundary.
