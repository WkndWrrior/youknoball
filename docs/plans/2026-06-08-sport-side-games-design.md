# Sport Side Games Design

**Goal:** Turn each sport category page into an untimed, unlimited five-question quiz that reuses the shared question bank and contributes signed-in results to personalized sport-card ordering.

## Experience

Each `/categories/[slug]` page hosts the side game for that sport. A run contains five questions with the same difficulty mix as the daily challenge:

- 2 easy
- 1 medium
- 2 hard

The game is untimed, has no leaderboard, and has no daily play limit. After submitting all five answers, the player sees their score and an answer-by-answer result breakdown. A **Play Again** action immediately starts another run.

The question selector avoids recently seen questions when the available bank allows it. If a sport does not have enough ready, sport-quiz-eligible questions to satisfy the difficulty mix, its category page shows a clean unavailable state instead of a partial quiz.

## Question Selection And Grading

The server loads ready questions for the requested sport where `eligible_for_sport_quiz` is true. A reusable side-game generator selects unique questions using the daily challenge's exported difficulty mix while preferring questions outside the player's recent history.

The start response never includes `correct_option`. The submission endpoint reloads the selected question records, validates that all five belong to the requested sport and satisfy the required difficulty mix, then grades the submitted answers. This keeps correct answers server-side until the run is complete.

For guests, recent question IDs are stored locally and sent when requesting the next run. For signed-in players, server-side attempt history is also used to avoid recent questions.

## Persistence

Side-game data stays separate from competitive daily-challenge data.

`sport_quiz_attempts` stores one row per completed signed-in run:

- user
- sport
- score
- total questions
- creation time

`sport_quiz_attempt_items` stores the five submitted question results:

- attempt
- question
- chosen option
- correctness

Guest attempts are graded but not persisted in Supabase and do not affect personalized card ordering.

## Personalized Sport Cards

Signed-in sport performance combines:

- canonical daily challenge question results
- saved sport-specific side-game results

The existing minimum-answer threshold and ranking rules remain unchanged. Side-game results simply provide more sport-specific evidence for the existing ranking helper.

## API And UI

The reusable API surface is:

- `POST /api/sport-quiz/[slug]` to generate a five-question run
- `POST /api/sport-quiz/[slug]/submit` to grade it and save signed-in attempts

The category page uses a reusable client quiz component with loading, unavailable, playing, submitting, results, and error states. The visual treatment should stay consistent with the existing site and category-card identity while keeping the quiz itself focused and easy to scan on desktop and mobile.

## Failure Handling

- Unknown sport slugs return not found.
- Insufficient question banks return an unavailable response.
- Invalid or incomplete submissions return a validation error without saving an attempt.
- Guests can continue playing if authentication is unavailable.
- Database failures show a retryable error without exposing correct answers.

## Testing

Use TDD for:

- side-game question generation, exact difficulty mix, uniqueness, and recent-question avoidance
- submission validation and grading
- signed-in attempt persistence and guest non-persistence
- combined daily and side-game sport performance
- start and submit API authentication behavior
- category-page and client quiz states
- database migration structure and policies

Before completion, run the full Vitest suite, lint, production build, and Supabase migration checks.
