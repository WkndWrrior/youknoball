# Password-First Auth Design

**Date:** 2026-04-14

## Goal

Make account creation and sign-in feel like a real production product:

- every player account has an email and password
- new accounts must verify email before they are treated as active
- password sign-in is the primary path
- magic-link sign-in remains available as a fallback
- forgot-password is available
- players can stay signed in on multiple devices
- the existing guest-attempt auto-claim still works after auth

## Product Rules

1. New account creation requires `email + password`.
2. Email verification is mandatory for new accounts.
3. Password sign-in is the primary sign-in method.
4. Magic links remain available as a fallback sign-in option for existing accounts.
5. Password reset is supported through a standard recovery flow.
6. Multi-device sign-in remains allowed.
7. Guest runs are still auto-claimed only for the just-finished challenge once the player returns authenticated to `/play`.

## UX

### `/login`

The login page becomes a unified auth page with three user intents:

- `Sign in`
- `Create account`
- `Use a magic link instead`

The primary form is email/password based.

**Sign in mode**
- fields: email, password
- actions:
  - primary: `Sign in`
  - secondary text action: `Send me a magic link instead`
  - tertiary text action: `Forgot password?`

**Create account mode**
- fields: email, password, confirm password
- actions:
  - primary: `Create account`
- success state:
  - do not act like the user is fully signed in yet
  - show a clear message that verification email was sent and they must verify before continuing

**Magic link fallback**
- available on the same page
- used only as a fallback sign-in path, not as the primary signup path
- copy should make that explicit

### Verification email

Verification is link-based and branded as YouKnowBall.

The message should make the value explicit:

- verify your email
- unlock saved scores
- keep your average
- appear on the leaderboard

After verification, the player lands on `/auth/callback` and is redirected to `/play`.

### Password reset

Players can request a password reset email from the auth page.

The recovery link should return them to a dedicated reset-password page where they can set a new password, then continue into the normal signed-in experience.

## Technical Design

### Auth provider behavior

Use Supabase Auth for:

- `signUp({ email, password })`
- `signInWithPassword({ email, password })`
- `signInWithOtp({ email })` as fallback sign-in
- `resetPasswordForEmail(email)` for password recovery

Email confirmation remains enabled.

Expected hosted-project behavior:

- signup returns a user but not a durable session until the email is confirmed
- after the email link is clicked, the callback route exchanges the code and writes auth cookies

### Callback route

The existing callback route already handles PKCE and OTP verification. It should be extended so it can distinguish:

- normal signin/signup confirmation -> redirect `/play`
- password recovery -> redirect `/reset-password`

That keeps one callback entry point and lets the same auth cookie logic stay centralized.

### Guest-attempt auto-claim

The current pending guest-attempt claim behavior remains unchanged.

Important consequence:

- a player can finish as a guest
- create an account
- verify email
- return authenticated to `/play`
- the just-finished challenge is auto-claimed to the account

### Supabase dashboard and email setup

This feature is not complete without configuration work in Supabase.

Required settings:

- set `SITE_URL` to `https://youknoball.com`
- add redirect URLs for:
  - `https://youknoball.com/auth/callback`
  - local development callback URLs
- configure custom SMTP
- use a production sender such as `no-reply@youknoball.com`
- customize templates for:
  - confirm signup
  - magic link
  - password recovery

The templates should be branded as YouKnowBall instead of generic Supabase mail.

## Multi-Device Policy

Multiple signed-in devices are allowed.

There is no product reason to restrict sessions right now, and allowing normal multi-device login matches user expectations for a trivia product. Supabase supports this by default unless session limits are turned on later.

## Error Handling

- invalid email: inline validation
- weak/mismatched password: inline validation before submit
- existing account on signup: clear error with sign-in guidance
- unverified account: tell the player to check email and resend if needed
- failed magic-link send: inline error
- failed password-reset send: inline error
- expired recovery/verification link: redirect back to `/login` with a useful error

## Testing

### Automated

- auth form behavior for signup, password sign-in, and magic-link fallback
- callback route behavior for signup confirmation vs recovery redirect
- password reset flow helpers
- guest-attempt auto-claim still works after verified auth

### Manual

1. Create a new account with email/password.
2. Receive branded verification email from `@youknoball.com`.
3. Verify and land back in the app signed in.
4. Sign out, then sign in with password.
5. Sign out, then sign in with magic-link fallback.
6. Request password reset and set a new password.
7. Sign in on a second device or browser.
8. Confirm the same account works on both devices.
