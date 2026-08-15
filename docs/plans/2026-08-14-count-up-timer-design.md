# Count-Up Daily Challenge Timer Design

## Goal

Change the signed-in Daily 5 timer from a two-minute countdown to an elapsed
timer that starts at `0:00`, stops visually at `1:30`, and keeps late
submissions on the leaderboard with a recorded duration of exactly 90 seconds.

## Behavior

- Signed-in Daily 5 attempts display elapsed time from `0:00` to `1:30`.
- The display freezes at `1:30`; the quiz remains playable and submittable.
- The server remains authoritative and clamps recorded duration to 90,000 ms.
- Attempts submitted after 90 seconds remain leaderboard-eligible and contribute
  `1:30` to average time.
- The existing five-second minimum and timer-unavailable protections remain.
- Guest attempts remain casual, sport-specific quizzes remain untimed, and
  previously stored attempts are unchanged.

## Implementation

Update the shared timer limit to 90 seconds and add a shared capped-elapsed
calculation. The play page will format capped elapsed time instead of remaining
time and will replace countdown-specific status copy. The submit route will use
the same server-side capped calculation before evaluating eligibility and saving
the attempt.

No database migration is required because durations continue to use the existing
`duration_ms` column.

## Testing

- Unit-test elapsed time below and above the 90-second cap.
- Test the play page at start, during play, and after the cap.
- Test that the submit route stores 90,000 ms and remains leaderboard-eligible
  for attempts submitted after the cap.
- Preserve coverage for the minimum duration and unavailable timer cases.
