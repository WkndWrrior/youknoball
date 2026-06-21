# Sport Question Banks Design

**Goal:** Give every sport category a reliable side-quiz question bank using the existing generic category quiz template.

## Scope

Add dedicated seed banks for:

- NBA
- CBB
- NFL
- NHL

Each bank gets 30 ready questions:

- 10 easy
- 10 medium
- 10 hard

All rows are marked `eligible_for_daily = true` and `eligible_for_sport_quiz = true`, matching CFB and MLB.

## Supplied Prompts

Include the user-supplied prompts that verify cleanly:

- Wisconsin ending Kentucky's 38-0 run in the 2015 Final Four
- UCLA freshman Lew Alcindor/Kareem Abdul-Jabbar beating the UCLA varsity
- Devin Hester returning the opening kickoff in Super Bowl XLI (41)
- LeBron James being from Akron
- Klay Thompson's 37-point quarter
- Alexander Ovechkin as NHL regular-season goals leader
- Mariano Rivera allowing 11 earned runs in his postseason career

Do not seed the Sam Darnold Super Bowl prompt as written. It does not verify as true.

## NFL Super Bowl Formatting

When an NFL question references a Roman-numeral Super Bowl, include the numeric value in parentheses. Example: `Super Bowl XLI (41)`.

## Data Model

Use the existing `public.sports` and `public.questions` tables. Each migration should upsert its sport row and insert missing questions by `(sport_id, question_text)` so repeated local or remote application remains idempotent.

## Testing

Add migration tests covering:

- 30 questions per bank
- 10 easy, 10 medium, 10 hard
- sport slug/name
- daily and sport-quiz eligibility
- key supplied prompts
- source-note URLs
- idempotent `where not exists` insertion

Run focused tests first, then the full suite, lint, build, and migration status.
