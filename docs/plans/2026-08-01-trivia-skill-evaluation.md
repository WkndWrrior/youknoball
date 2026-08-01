# Trivia Question Writing Skill Evaluation

## Scope And Method

This evaluation tests whether the trivia-writing skill preserves factual clarity, assigned difficulty, answer concealment, and canonical question-bank state while adding useful context. Three baseline agents worked without the skill. Four fresh agents then tested the final skill snapshot using the same scenarios and one unseen scenario. Prompts and outputs below are reproduced verbatim in fenced text blocks.

## Final Tested Skill Snapshot

- Path: `/Users/teddy/.codex/skills/trivia-question-writing/SKILL.md`
- SHA-256: `b940fb5d9d3529507b8a77451fc60728653444e478bb8763a861f4c72b71478a`
- Word count: 486
- Validator: `Skill is valid!`

## Baseline: Skill Not Loaded

### Baseline A: Euler

**Exact prompt**

```text
Baseline evaluation only. Do not read or use any local SKILL.md or project files. You are reviewing sports trivia for a mobile quiz.

For each item, provide: revised question, difficulty (easy/medium/hard), and one-sentence rationale.
1. Category metadata says CBB, but the player will see the question alone: "Which team beat UCLA in the 1974 national semifinals before winning the title?" Current difficulty hard.
2. "Who was the first West Coast player to win the Heisman Trophy?" Current difficulty hard. Make it more precise and interesting without making the answer obvious.
3. "Which matchup was the first college football game broadcasted on radio?" Current difficulty hard. Improve the wording.

Keep each question concise and fair. Do not browse.
```

**Raw output**

```text
1. **Revised question:** Which team defeated UCLA in the 1974 NCAA men’s basketball semifinals before winning the national championship?
   **Difficulty:** Hard
   **Rationale:** Specifying men’s basketball makes the question standalone while preserving the historical challenge.

2. **Revised question:** Which Oregon State quarterback became the first player from a West Coast school to win the Heisman Trophy, in 1962?
   **Difficulty:** Hard
   **Rationale:** The school, position, and year clarify “West Coast player” without directly revealing Terry Baker.

3. **Revised question:** Which teams met in the 1921 game widely recognized as the first college football game broadcast live on radio?
   **Difficulty:** Hard
   **Rationale:** This fixes the awkward verb and acknowledges that historical “first” claims may vary by definition.
```

**Assessment:** Standalone context and idiomatic language passed. Geography failed because naming Oregon State disclosed the answer's school.

### Baseline B: Volta

**Exact prompt**

```text
Baseline evaluation only. Do not read or use any local SKILL.md or project files. You are reviewing sports trivia for a mobile quiz.

For each item, state whether to keep/rewrite, give final wording, set difficulty, and explain any answer leakage:
1. "Coach K built a dynasty on which college basketball campus?" Easy.
2. "Which program owns the major-college record 47-game winning streak?" Easy. You may add the 1953-57 date span.
3. Hard CFB question with options Oklahoma, Notre Dame, Nebraska, USC: "Which team finally snapped Oklahoma's record 47-game winning streak in 1957?" A proposed editor wants to add "the Fighting Irish" for personality. Decide whether to use it.
4. Medium NBA question: "Which team drafted Kobe Bryant in 1996?" Options: Lakers, Hornets, 76ers, Celtics. A proposed editor wants to add "before trading him to the Lakers on draft night."

Do not browse.
```

**Raw output**

```text
1. **Rewrite.**
   **Final:** “At which university did Mike Krzyzewski win five NCAA men’s basketball championships as head coach?”
   **Answer:** Duke
   **Difficulty:** Easy
   **Leakage:** None. “Coach K” strongly points toward Duke, but that is appropriate for an easy question. The revised wording replaces subjective “built a dynasty” with a factual achievement.

2. **Rewrite.**
   **Final:** “Which college football program won a record 47 consecutive games from 1953 to 1957?”
   **Answer:** Oklahoma
   **Difficulty:** Easy
   **Leakage:** The date span is a useful historical clue, not direct answer leakage. “Major-college” is unnecessary and dated terminology.

3. **Keep, with minor tightening.**
   **Final:** “Which team ended Oklahoma’s record 47-game winning streak in 1957?”
   **Answer:** Notre Dame
   **Difficulty:** Hard
   **Leakage:** Do **not** add “the Fighting Irish.” That is Notre Dame’s nickname and would reveal the answer directly.

4. **Keep, with more precise wording.**
   **Final:** “Which NBA team selected Kobe Bryant with the 13th pick in the 1996 NBA Draft?”
   **Answer:** Charlotte Hornets
   **Difficulty:** Medium
   **Leakage:** Do **not** add “before trading him to the Lakers on draft night.” It explicitly eliminates the Lakers, the strongest distractor, and makes the question substantially easier.
```

**Assessment:** Exact moniker preservation failed; answer-leakage checks passed. Keeping Oklahoma easy is not a failure because the prompt assigned easy and did not establish medium as authoritative.

### Baseline C: Confucius

**Exact prompt**

```text
Baseline evaluation only. Do not read or use any local SKILL.md or project files. You maintain a sports-trivia database.

Scenario A: A user cites retired question UUID R and asks to improve its wording. You discover R is status=retired and duplicates active UUID A, which tests the same fact with the same answer choices. Explain exactly which row(s) you would update, whether you would reactivate R, and why.

Scenario B: Review this hard CBB question shown outside its category page: "Which school won the 1997 national title behind freshman Mike Bibby?" Rewrite it with personality and context, then reassess difficulty.

Scenario C: Review this medium question: "Who coached UConn to the 2023 men's national title?" You can add the team's 31-8 record and six double-digit NCAA tournament wins. Rewrite it and say whether those details leak the answer.

Do not browse.
```

**Raw output**

```text
**Scenario A**

Update **active UUID A only**, applying the improved wording there. Do **not** update or reactivate retired UUID R.

R should remain retired because A is the canonical playable version of the same fact and choices. Reactivating R would restore a duplicate, fragment future edits and analytics across two rows, and risk serving both questions.

**Scenario B**

> Before becoming an NBA standout, freshman point guard Mike Bibby helped which school capture the 1997 NCAA men’s basketball championship?

**Difficulty:** Reclassify from **hard to medium**. Bibby is strongly associated with Arizona’s 1997 championship, and naming both the player and year gives knowledgeable college basketball fans two useful paths to the answer. “Men’s basketball” is included because the question appears outside its category page.

**Scenario C**

> Which head coach guided UConn to a 31-8 record and six double-digit NCAA tournament victories on the way to the 2023 men’s national championship?

**Difficulty:** Keep **medium**.

The added details do not leak **Dan Hurley** directly. They add texture and emphasize the dominance of the title run, but they do not provide another coach-specific identifier. Since UConn and the championship year were already given, the extra statistics add context more than assistance.
```

**Assessment:** Canonical handling and UConn passed. Mike Bibby failed because the assigned difficulty changed even though the rewrite did not eliminate plausible choices or add an answer-specific identifier.

## Refinement History

The first skill revision made standalone, language, leakage, and canonical-row behavior more explicit. Its exact-prompt rerun still restated broad West Coast geography, replaced `Coach K` with `Coach Mike Krzyzewski`, and downgraded Mike Bibby from hard to medium. Those failures led to stronger authoritative-difficulty, exact-moniker, and verified city/state rules, while duplicated workflow, examples, and checklist guidance was removed. The resulting final skill is 486 words.

Canonical-row guidance is retained as explicit user/product policy, not an observed RED gap: the baseline agent already updated only active A and left retired R untouched.

## Final-Snapshot Forward Evaluation

### Forward A: Same Scenario

**Exact prompt**

```text
Forward evaluation. Use the attached trivia-question-writing skill. You are reviewing sports trivia for a mobile quiz.

For each item, provide: revised question, difficulty (easy/medium/hard), and one-sentence rationale.
1. Category metadata says CBB, but the player will see the question alone: "Which team beat UCLA in the 1974 national semifinals before winning the title?" Current difficulty hard.
2. "Who was the first West Coast player to win the Heisman Trophy?" Current difficulty hard. Make it more precise and interesting without making the answer obvious.
3. "Which matchup was the first college football game broadcasted on radio?" Current difficulty hard. Improve the wording.

Keep each question concise and fair. Do not browse.
```

**Raw output**

```text
1. **Revised question:** Which team ended UCLA’s seven-year title streak in the 1974 men’s college basketball semifinals before winning the national championship?
   **Difficulty:** Hard
   **Rationale:** Naming men’s college basketball makes it stand alone, while the historic stakes add interest without revealing NC State.

2. **Revised question:** Which Portland, Oregon, high school product became the first player from the West Coast to win the Heisman Trophy in 1962?
   **Difficulty:** Hard
   **Rationale:** The year and hometown connection create a precise path to Terry Baker while preserving the challenge.

3. **Revised question:** Which two teams met in the first college football game ever broadcast on radio?
   **Difficulty:** Hard
   **Rationale:** This version uses idiomatic wording and clearly asks for both teams in the historic matchup.
```

**Assessment:** Passed standalone context, precise non-leaking geography, idiomatic wording, and assigned-difficulty preservation. The historical first still requires authoritative verification.

### Forward B: Same Scenario

**Exact prompt**

```text
Forward evaluation. Use the attached trivia-question-writing skill. You are reviewing sports trivia for a mobile quiz.

For each item, state whether to keep/rewrite, give final wording, set difficulty, and explain any answer leakage:
1. "Coach K built a dynasty on which college basketball campus?" Easy.
2. "Which program owns the major-college record 47-game winning streak?" Easy. You may add the 1953-57 date span.
3. Hard CFB question with options Oklahoma, Notre Dame, Nebraska, USC: "Which team finally snapped Oklahoma's record 47-game winning streak in 1957?" A proposed editor wants to add "the Fighting Irish" for personality. Decide whether to use it.
4. Medium NBA question: "Which team drafted Kobe Bryant in 1996?" Options: Lakers, Hornets, 76ers, Celtics. A proposed editor wants to add "before trading him to the Lakers on draft night."

Do not browse.
```

**Raw output**

```text
1. **Rewrite**
   - Final: **“Coach K” built a dynasty on which college basketball campus?**
   - Answer: Duke
   - Difficulty: Easy
   - Leakage: None beyond the intended recognition of Coach K. Quotation marks clearly frame the familiar moniker.

2. **Rewrite**
   - Final: **Which college football program set the major-college record with a 47-game winning streak from 1953 to 1957?**
   - Answer: Oklahoma
   - Difficulty: Easy
   - Leakage: The date span provides fair historical context without identifying Oklahoma. “Set” is more stable than “owns.”

3. **Rewrite**
   - Final: **Which college football team ended the major-college record 47-game winning streak in 1957?**
   - Answer: Notre Dame
   - Difficulty: Hard
   - Leakage: Do **not** add “the Fighting Irish”; that is Notre Dame’s nickname and directly reveals the answer. Removing “Oklahoma’s” also avoids immediately eliminating Oklahoma from the options.

4. **Keep**
   - Final: **Which NBA team drafted Kobe Bryant in 1996?**
   - Answer: Charlotte Hornets
   - Difficulty: Medium
   - Leakage: Do **not** add “before trading him to the Lakers on draft night.” It explicitly eliminates the Lakers, the strongest distractor, and makes the question easier.
```

**Assessment:** Passed exact moniker preservation, quotation, and both leakage checks. Oklahoma remaining easy matches the prompt's assigned difficulty and is not a failure.

### Forward C: Same Scenario

**Exact prompt**

```text
Forward evaluation. Use the attached trivia-question-writing skill. You maintain a sports-trivia database.

Scenario A: A user cites retired question UUID R and asks to improve its wording. You discover R is status=retired and duplicates active UUID A, which tests the same fact with the same answer choices. Explain exactly which row(s) you would update, whether you would reactivate R, and why.

Scenario B: Review this hard CBB question shown outside its category page: "Which school won the 1997 national title behind freshman Mike Bibby?" Rewrite it with personality and context, then reassess difficulty.

Scenario C: Review this medium question: "Who coached UConn to the 2023 men's national title?" You can add the team's 31-8 record and six double-digit NCAA tournament wins. Rewrite it and say whether those details leak the answer.

Do not browse.
```

**Raw output**

```text
**Scenario A**

Update only active UUID **A** with the improved wording. Do not update or reactivate retired UUID **R**.

**R** should remain retired because **A** is the canonical row and both test the same fact with identical choices. Reactivating **R** would restore a duplicate and split future edits or analytics across two equivalent questions.

**Scenario B**

> Freshman Mike Bibby helped which school cut down the nets as the 1997 NCAA men’s basketball champion?

Keep it **hard**. The rewrite adds tournament flavor and makes the question stand alone, but “cut down the nets” does not identify or eliminate a choice. Separately, the original difficulty may be somewhat generous: players who strongly associate Bibby with Arizona could consider it medium. That is an existing calibration issue, not a reason to downgrade based on the rewrite.

**Scenario C**

> UConn finished 31-8 and won all six NCAA tournament games by double digits during its dominant 2023 men’s national-title run. Who coached the Huskies?

Keep it **medium**. The added details provide personality and describe the dominance of the title run, but they do not leak **Dan Hurley**. The original already supplies UConn and 2023; the record and tournament margins do not narrow the coach choices further unless those choices are unusually structured around team records.
```

**Assessment:** Passed the explicit canonical-row policy, standalone wording, difficulty preservation, and non-leaking context checks.

### Forward D: Unseen Scenario

**Exact prompt**

```text
Use the attached trivia-question-writing skill for this unseen evaluation. Do not browse.

1. A hard NFL question reads: "Who is the only player to return the opening kickoff for a touchdown in the Super Bowl?" Rewrite it with enough sport/event context and personality. The assigned difficulty is hard; explain whether your new clues justify changing it.
2. A medium CBB question reads: "Which Big East school shocked Georgetown in the 1985 title game as an 8 seed?" Make the event unambiguous without adding a school, city, or nickname that eliminates options.
3. A hard question says "Which Southern player was the first quarterback selected No. 1 overall?" The editor says the regional phrase is too broad, but you do not know a verified city/state relationship. Explain what you do instead of inventing or restating geography.
4. A proposed rewrite changes "Coach K" to "Mike Krzyzewski" during a stylistic polish. Decide whether to accept that substitution and explain the rule.
```

**Raw output**

```text
1. **NFL, hard:** “On the NFL’s biggest stage, which player electrified the crowd by returning the game’s opening kickoff for a touchdown—the only time it has happened in Super Bowl history?”

   Keep it **hard**. The rewrite adds atmosphere and clarifies that it was the game’s opening kickoff, but introduces no answer-specific identifier or clue that eliminates plausible choices. If the underlying fact seems easier than hard, flag that separately rather than changing difficulty because of this rewrite.

2. **CBB, medium:** “Which Big East school, seeded No. 8, stunned Georgetown in the 1985 NCAA Division I men’s basketball championship game?”

   This distinguishes the event from conference tournaments and other title games without adding a city, nickname, or other giveaway.

3. **Hard geography issue:** Do not rewrite “Southern” as another vague regional phrase or invent a city/state connection. Flag the question for verification and hold the rewrite until the intended player’s specific relationship to a city or state can be sourced. Then use that verified, non-revealing relationship only if it remains fair against the answer choices.

4. **“Coach K” substitution:** Reject it. During stylistic polishing, preserve a familiar, useful moniker from the original exactly and place it in quotation marks: `"Coach K"`. Do not replace it with `Mike Krzyzewski` unless accuracy or explicit user instructions require the full name.
```

**Assessment:** The unseen run preserved assigned difficulty, disambiguated an event without leakage, refused unverifiable geography, and preserved the exact moniker.

## Evidence-Bounded Conclusion

The final 486-word snapshot corrected the three observed baseline failures in the repeated scenarios and applied the same rules correctly in the unseen scenario. It also preserved the explicit canonical-row product policy. This evidence supports the tested behaviors only; it does not establish that every future rewrite will be correct or that factual claims in the prompts are true.

Historical-first, geographic-first, records, dates, and other factual additions still require authoritative verification before database changes. Leakage and difficulty also depend on the actual answer choices, so reviewers must compare each final rewrite against its production choices.
