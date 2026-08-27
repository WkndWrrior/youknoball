# Question Bank Expansion Workbook Design

## Goal

Create a review-only Excel workbook containing 150 new sports trivia questions without changing Supabase or application behavior.

## Scope

- Categories: NBA, CBB, NFL, CFB, NHL, and MLB.
- Questions per category: 25.
- Difficulty per category: 8 easy, 9 medium, and 8 hard.
- Each question includes four answer choices, the correct choice, a difficulty label, a concise fact note, and an authoritative source URL.

## Content Standards

- Apply the YouKnoBall trivia-writing skill: every question must stand alone, have one unambiguous answer, avoid answer leakage, and use concise mobile-friendly wording.
- Add personality through fair context such as stakes, era, venue, streak, title run, or signature moment.
- Prefer stable historical facts. Use authoritative league, team, school, governing-body, Hall of Fame, or reputable statistical sources.
- Compare draft topics and wording against the current question bank and against the other new drafts to prevent duplicates.
- Format Super Bowl Roman numerals with the number in parentheses.

## Workbook Structure

- `Summary`: category counts, difficulty counts, instructions, and review-status totals.
- One tab for each category: `NBA`, `CBB`, `NFL`, `CFB`, `NHL`, and `MLB`.
- Sport-tab columns: ID, Question, Choice A, Choice B, Choice C, Choice D, Correct Choice, Correct Answer, Difficulty, Fact Note, Source URL, and Review Status.
- Review Status defaults to `Pending` so questions remain explicitly unapproved.

## Verification

- Confirm exactly 25 questions per sport and 150 overall.
- Confirm each sport has the 8/9/8 difficulty split.
- Confirm every correct-choice letter resolves to the displayed correct answer.
- Confirm every row includes a fact note and source URL.
- Scan both the existing bank and new workbook for duplicate or substantially overlapping topics.
- Render every sheet and correct clipped, unreadable, or poorly wrapped content before export.

## Delivery

Save one `.xlsx` workbook as a review artifact. Do not create migrations, insert database rows, or otherwise implement the questions until the owner reviews and approves them.
