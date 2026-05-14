# Timed Leaderboard Design

## Goal

Make the public leaderboard harder to game by counting only signed-in daily attempts that begin with a server-side timer and finish inside a short competitive window.

## Product Rules

- The daily challenge remains playable by guests and signed-in players.
- Guest runs are casual: they can be saved in the browser, shared, and later claimed, but they do not count toward the public leaderboard.
- Signed-in players get a timed run when they load the daily challenge.
- The leaderboard window is 2 minutes for 5 questions.
- A signed-in attempt submitted after the window still saves and can still be shared, but it is not leaderboard eligible.
- Existing historical attempts remain eligible so the current board is not wiped by the migration.

## Architecture

Add a `daily_attempt_starts` table with one server-created start row per user/day. `/api/challenge/today` creates or reuses that start row only for signed-in players. `/api/attempt/submit` ignores any client-submitted time and computes duration from the stored server timestamp.

Store `duration_ms` and `leaderboard_eligible` on `daily_attempts`. The public `daily_leaderboard` view filters to `leaderboard_eligible = true` and exposes `average_duration_ms` for speed-based ranking.

## Ranking

Sort the public leaderboard by:

1. Average score, highest first.
2. Average completion time, fastest first.
3. Total plays, highest first.
4. Last played date, newest first.

Rows with no duration, such as migrated historical attempts, sort behind timed rows when score ties.

## UI

On `/play`, show a compact timer card:

- Signed-in timed run: remaining time in `MM:SS`.
- Expired: timed leaderboard window closed, but the player can still save and share.
- Guest/no timer: casual run messaging.

On the result card:

- Eligible with display name: show leaderboard eligible.
- Eligible but no display name: show the display-name form.
- Timed out or casual: show that the result is saved/shareable but will not rank.

## Non-goals

This does not try to block tab switching, clipboard use, search engines, multiple devices, or screenshots. It is a low-friction deterrent, not proctoring.
