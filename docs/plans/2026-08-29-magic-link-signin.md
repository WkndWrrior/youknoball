# Magic-Link Sign-In Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Present magic links as a secondary existing-account sign-in action and prevent them from creating passwordless accounts.

**Architecture:** Reduce the primary auth-mode contract to `signin | signup`. Keep password sign-in and signup submission in the form submit handler, and add a separate button handler for magic-link delivery that reuses the current email and callback URL while setting `shouldCreateUser: false`.

**Tech Stack:** React 19, Next.js 16, Supabase Auth, TypeScript, Vitest, Testing Library

---

### Task 1: Restrict The Primary Auth Modes

**Files:**
- Modify: `src/lib/authFlow.ts`
- Modify: `src/lib/__tests__/authFlow.test.ts`

**Step 1: Write the failing test**

Update the auth-mode test to assert that only `signin` and `signup` normalize as supported primary modes, while `magic-link` falls back to `signin`.

**Step 2: Run the test to verify it fails**

Run: `npm test -- src/lib/__tests__/authFlow.test.ts`

Expected: FAIL because `magic-link` is still a supported `AuthMode`.

**Step 3: Implement the minimal contract change**

Change:

```ts
export type AuthMode = "signin" | "signup";
const authModes: AuthMode[] = ["signin", "signup"];
```

Leave redirect, email, password, verification, and recovery helpers unchanged.

**Step 4: Run the test to verify it passes**

Run: `npm test -- src/lib/__tests__/authFlow.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/lib/authFlow.ts src/lib/__tests__/authFlow.test.ts
git commit -m "refactor: limit primary authentication modes"
```

### Task 2: Move Magic Link Under Sign-In

**Files:**
- Create: `src/components/__tests__/LoginForm.test.tsx`
- Modify: `src/components/LoginForm.tsx`

**Step 1: Write the failing component tests**

Mock `next/navigation` and `supabaseBrowser`, then assert:

- exactly two mode tabs render: `Sign in` and `Create account`
- no `Magic link` tab or standalone magic-link heading renders
- sign-in includes `Forgot password?`, an `or` divider, and `Email me a sign-in link`
- create-account mode hides forgot-password and magic-link actions
- clicking `Email me a sign-in link` with an entered email calls:

```ts
signInWithOtp({
  email: "fan@example.com",
  options: {
    emailRedirectTo: "https://youknoball.com/auth/callback?next=%2Fplay",
    shouldCreateUser: false,
  },
})
```

- magic-link delivery does not call password sign-in or signup
- the success message is generic and does not claim that an account exists
- a missing email produces inline validation without calling Supabase
- password sign-in, signup, and forgot-password calls remain unchanged

**Step 2: Run the tests to verify they fail**

Run: `npm test -- src/components/__tests__/LoginForm.test.tsx`

Expected: FAIL because the third tab still exists and the OTP request allows user creation.

**Step 3: Implement the approved interface**

- Remove magic-link entries from `authModeDetails` and the tab list.
- Keep password fields present in both primary modes.
- Add a dedicated `onMagicLink` button handler.
- Normalize and validate the current email.
- Call `signInWithOtp` with the existing callback redirect and `shouldCreateUser: false`.
- Show a generic success message such as `If an account exists for that email, check your inbox for a sign-in link.`
- Render the secondary action only in sign-in mode, below a restrained `or` divider.
- Keep forgot-password visible only in sign-in mode.
- Preserve signup, password recovery, callback redirects, and router behavior.

**Step 4: Run focused tests**

Run: `npm test -- src/components/__tests__/LoginForm.test.tsx src/lib/__tests__/authFlow.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/LoginForm.tsx src/components/__tests__/LoginForm.test.tsx
git commit -m "feat: nest magic link under sign-in"
```

### Task 3: Verify And Integrate

**Files:**
- Verify all changed files

**Step 1: Run the complete test suite**

Run: `npm test`

Expected: all tests pass.

**Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

**Step 3: Run the production build**

Run from the worktree with the root `.env.local` loaded: `npm run build -- --webpack`

Expected: compilation, TypeScript, prerendering, and route generation pass.

**Step 4: Review the final diff**

Run: `git diff --check main...HEAD && git status --short`

Expected: no whitespace errors and no uncommitted files.

**Step 5: Merge locally**

After final review, fast-forward local `main`, rerun tests on the merged result, and remove the temporary worktree and branch. Do not push unless the user requests it.
