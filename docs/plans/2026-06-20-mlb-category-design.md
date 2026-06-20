# MLB Category Design

**Goal:** Add MLB as a sport category with verified question coverage so it can appear in the daily five-question challenge and support the same sport-specific quiz flow as the other categories.

## Experience

MLB appears as a standard category card after NHL. It uses the same category page and sport-quiz experience as CFB: untimed, five questions, no leaderboard, and Play Again after results.

## Question Bank

Add a seed migration for MLB with 30 ready questions:

- 10 easy
- 10 medium
- 10 hard

Each question is marked `eligible_for_daily = true` and `eligible_for_sport_quiz = true`. Questions should use stable baseball facts from primary or durable references such as MLB, Baseball Hall of Fame, Baseball Reference, and Retrosheet where appropriate.

## Daily Challenge Priority

MLB can be included in the daily five-question challenge, but it should not become a priority sport. The current daily generator prioritizes NBA and NFL coverage only; MLB should remain outside that target set. It can still be selected when it improves sport variety, freshness, or fills the required difficulty mix.

## Testing

Use TDD to cover:

- MLB category metadata and default ordering
- MLB question-bank migration shape and flags
- daily generator behavior proving MLB can be selected as a non-target sport
- daily generator behavior proving MLB does not displace NBA/NFL priority when those target sports are available

Before completion, run the focused tests, full Vitest suite, lint, production build, and Supabase migration checks.
