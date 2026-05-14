# Guest Attempt Claim Design

**Date:** 2026-04-14

**Problem**

Guest players can complete the daily challenge and see a result, but if they sign up right after that run, the result stays browser-only. The app currently redirects back to `/play` after auth, yet nothing claims the just-finished guest run for the new account.

**Decision**

Automatically claim only the just-finished challenge after auth, with no extra confirmation step.

**Why this approach**

- It matches the current product prompt after guest completion.
- It avoids adding a new server-side guest-attempt table.
- It reuses the existing `/api/attempt/submit` scoring and save path instead of creating a second persistence flow.

**Flow**

1. When a guest submits answers, the client continues storing the rendered guest result in local storage.
2. The client also stores a small pending-claim payload for that same challenge date containing the submitted answers needed to replay the save request.
3. After signup or sign-in returns the player to `/play`, the client detects auth state plus a pending claim for the current challenge date.
4. The client silently submits that pending claim through `/api/attempt/submit`.
5. If the save succeeds, or the server reports that the attempt already exists, the UI replaces the guest result with the saved account result and clears the pending claim.
6. If the claim fails for another reason, the guest result remains visible, the pending claim stays in storage, and the UI shows a non-blocking message.

**Guardrails**

- Claim only the current just-finished challenge.
- Do not claim older guest attempts.
- Do not overwrite an existing saved attempt.
- Keep guest result visibility even if the auto-claim fails.
- Preserve the existing leaderboard/display-name flow once the claim succeeds.

**Testing**

- Guest submit writes the pending-claim payload.
- Authenticated return auto-claims the pending attempt.
- Duplicate attempt responses are treated as success for UI recovery.
- Failed claim keeps the guest result available and preserves the pending payload.
