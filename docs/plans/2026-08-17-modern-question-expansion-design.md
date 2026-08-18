# Modern Question Expansion Design

## Scope

Create one review-only text file with 110 new questions:

- NHL: 25 questions, split 5 easy / 8 medium / 12 hard.
- MLB: 25 questions, split 12 easy / 7 medium / 6 hard.
- NBA, CBB, NFL, and CFB: 15 questions each, split 5 easy / 5 medium / 5 hard.

## Content Rules

- Default to events from 1980 onward.
- Favor memorable players, coaches, games, postseason moments, and generational events.
- Keep every question understandable outside its category and concise enough for mobile.
- Use four plausible choices with one unambiguous answer.
- Cite a reputable source that directly supports each answer.
- Do not include answer explanations or insert anything into Supabase.

## Validation

- Compare every draft with the current ready and retired question bank.
- Reject duplicate facts, not only exact wording matches.
- Verify category counts, difficulty counts, four-choice structure, answer keys, unique IDs, and source URLs.
- Deliver one plain-text review artifact grouped by category.
