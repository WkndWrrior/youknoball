# Password-First Auth Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current magic-link-only account flow with password-first auth, required email verification, password recovery, and a retained magic-link fallback while preserving guest-attempt auto-claim.

**Architecture:** Keep Supabase Auth as the source of truth and extend the existing auth surface instead of adding a second system. The login page becomes a unified auth form with mode switching, the callback route remains the central place that exchanges auth links into cookies, and a dedicated reset-password page handles recovery completion. Supabase dashboard configuration covers branded SMTP, redirect URLs, and email templates.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase Auth, Vitest

---

### Task 1: Add failing shared auth tests for password flow inputs and copy

**Files:**
- Create: `src/lib/__tests__/authFlow.test.ts`
- Modify: `src/components/LoginForm.tsx`

**Step 1: Write the failing test**
- Add tests for any new shared auth helpers you introduce, such as:
  - mode normalization for `signin | signup | magic-link`
  - password confirmation validation
  - messaging for verification-required signup responses

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/__tests__/authFlow.test.ts
```

Expected: FAIL because the helpers do not exist yet.

### Task 2: Add failing callback-route tests for verification and recovery redirects

**Files:**
- Create: `src/app/auth/callback/route.test.ts`
- Modify: `src/app/auth/callback/route.ts`

**Step 1: Write the failing test**
- Cover:
  - signup/email confirmation redirects to `/play`
  - recovery links redirect to `/reset-password`
  - invalid links redirect back to `/login` with a useful error

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/app/auth/callback/route.test.ts
```

Expected: FAIL because the callback route currently always redirects to `/play`.

### Task 3: Add failing tests for password recovery completion

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Create: `src/lib/__tests__/passwordReset.test.ts`

**Step 1: Write the failing test**
- Add helper-level tests for:
  - password confirmation validation
  - success messaging after a password update

**Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/lib/__tests__/passwordReset.test.ts
```

Expected: FAIL because recovery helpers and page do not exist yet.

### Task 4: Implement shared auth helpers

**Files:**
- Create: `src/lib/authFlow.ts`
- Modify: `src/lib/__tests__/authFlow.test.ts`
- Modify: `src/lib/__tests__/passwordReset.test.ts`

**Step 1: Write minimal implementation**
- Add small pure helpers for:
  - auth mode handling
  - password confirmation validation
  - human-readable verification and recovery messages

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/__tests__/authFlow.test.ts src/lib/__tests__/passwordReset.test.ts
```

Expected: PASS.

### Task 5: Rebuild the login form around password-first auth

**Files:**
- Modify: `src/components/LoginForm.tsx`
- Modify: `src/app/login/page.tsx`

**Step 1: Write minimal implementation**
- Add auth modes for:
  - sign in
  - create account
  - magic-link fallback
- In signup mode:
  - collect email, password, confirm password
  - call `supabaseBrowser().auth.signUp`
  - show verification-required success copy
- In sign-in mode:
  - call `supabaseBrowser().auth.signInWithPassword`
- In fallback mode:
  - keep `signInWithOtp`
- Add a `Forgot password?` action that sends a recovery email

**Step 2: Run targeted verification**

Run:

```bash
npm run lint -- src/components/LoginForm.tsx
```

Expected: PASS.

### Task 6: Extend the callback route for recovery handling

**Files:**
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/auth/callback/route.test.ts`

**Step 1: Write minimal implementation**
- Continue to upsert `profiles` when a user arrives authenticated.
- Redirect normal verified auth flows to `/play`.
- Redirect recovery flows to `/reset-password`.
- Preserve useful error redirects back to `/login`.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/app/auth/callback/route.test.ts
```

Expected: PASS.

### Task 7: Add the reset-password page

**Files:**
- Create: `src/app/reset-password/page.tsx`
- Modify: `src/lib/__tests__/passwordReset.test.ts`

**Step 1: Write minimal implementation**
- Require the recovery session created by the callback.
- Collect `new password` and `confirm password`.
- Call the Supabase browser client to update the password.
- Redirect the player back to `/play` or `/login` with a clear success message.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/__tests__/passwordReset.test.ts
```

Expected: PASS.

### Task 8: Verify guest-attempt auto-claim still works after auth changes

**Files:**
- Modify: `src/app/play/page.tsx`
- Modify: `src/lib/dailyChallenge.ts`
- Modify: existing related tests if needed

**Step 1: Check integration**
- Ensure password sign-in and verified signup both return to the same authenticated play flow.
- Confirm nothing in the guest-claim logic assumes magic-link-only auth.

**Step 2: Run targeted tests**

Run:

```bash
npm test -- src/lib/__tests__/dailyChallenge.test.ts src/app/api/attempt/submit/route.test.ts
```

Expected: PASS.

### Task 9: Configure Supabase Auth and branded email delivery

**Files:**
- Modify: `.env.local` if needed for `NEXT_PUBLIC_SITE_URL`
- No repo file for dashboard settings

**Step 1: Apply hosted-project settings in Supabase**
- Enable password auth.
- Keep confirm-email enabled.
- Set `SITE_URL` to `https://youknoball.com`.
- Add redirect URLs:
  - `https://youknoball.com/auth/callback`
  - local dev callback URL(s)
- Configure custom SMTP with a production sender such as `no-reply@youknoball.com`.
- Customize templates for:
  - signup confirmation
  - magic link
  - password recovery

**Step 2: Verify manually**
- Send one test verification email.
- Send one magic-link fallback email.
- Send one recovery email.

Expected: all messages come from the branded sender and use YouKnowBall copy.

### Task 10: Run full verification

**Files:**
- No new files

**Step 1: Run automated verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: PASS.

**Step 2: Manual end-to-end checks**
- Create a new account with email/password.
- Verify email and confirm redirect to `/play`.
- Sign out and sign in with password.
- Sign out and use the magic-link fallback.
- Trigger forgot-password, set a new password, and sign in again.
- Complete a guest run, then create an account and confirm the just-finished challenge is auto-claimed.
- Sign in on a second browser or device and confirm the account still works there.
