# Magic-Link Sign-In Design

## Goal

Make YouKnoBall's password-first account model clear by presenting magic links as a secondary sign-in convenience for existing players, not as a separate account type or signup method.

## Authentication Model

- New players create accounts with email, password, and password confirmation.
- New accounts continue to require email confirmation.
- Existing players sign in with email and password by default.
- Existing players may request a one-time magic link instead of entering their password.
- Magic-link requests must set `shouldCreateUser: false` so they cannot create passwordless accounts.
- Forgot-password remains a separate recovery flow that lets an existing player choose a new password.

## Login Interface

The login card has two primary tabs only:

- `Sign in`
- `Create account`

The `Sign in` view contains:

- email field
- password field
- primary `Sign in` button
- `Forgot password?` action
- a quiet `or` divider
- secondary `Email me a sign-in link` action

The secondary action uses the email already entered. It does not require a password and does not switch the page into a third auth mode.

The `Create account` view retains email, password, password confirmation, and the existing verification-required success state. It does not show magic-link or forgot-password actions.

## Privacy And Errors

Magic-link requests show a generic check-your-inbox success message whether or not the email belongs to an account. This preserves Supabase's account-enumeration protection.

Missing or invalid email input produces the same inline validation used by the other auth actions. Delivery failures use the existing inline error area without exposing credentials or account existence.

## Scope

This change modifies only the login form and its focused tests. It does not change signup verification, password recovery, callback handling, sessions, guest-attempt claiming, scoring, or gameplay.

## Testing

- The auth mode contract supports only `signin` and `signup` as primary modes.
- The login form renders two tabs and no standalone magic-link tab.
- The secondary action uses the current email without requiring a password.
- The Supabase call includes `shouldCreateUser: false` and the existing callback redirect.
- Signup, password sign-in, forgot-password, and success/error states continue to work.
- Full tests, lint, and production build pass.
