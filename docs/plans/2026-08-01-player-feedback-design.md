# Player Feedback Design

## Goal

Give every player a discreet way to send general feedback, report a product bug, or suggest an idea from any page. Preserve every valid submission privately in Supabase and notify the site owner by email without making email delivery a requirement for successful submission.

## User Experience

A small, muted `Feedback` link appears in the global footer beneath every page. It is part of the normal document flow and never floats over quiz controls or mobile content.

The link opens `/feedback` and includes the pathname where the player clicked it. The dedicated feedback page contains:

- A compact selector for `General`, `Bug`, or `Idea`.
- A required feedback message capped at 2,000 characters.
- An optional contact email capped at the standard 320-character maximum.
- Clear submitting, success, and error states.

Guests and signed-in players can submit feedback. Signed-in submissions automatically include the player's user ID. A successful submission clears the form and displays a simple thank-you message. A failed submission preserves the player's input.

## Data Model

Create a private `public.feedback_submissions` table with:

- Submission ID.
- Optional reporter user ID referencing `auth.users`.
- Feedback type: `general`, `bug`, or `idea`.
- Message.
- Optional contact email.
- Optional originating pathname.
- Review status: `new`, `reviewing`, `resolved`, or `dismissed`.
- Optional reviewer notes and review timestamp.
- Creation timestamp.

Enable row-level security and revoke direct access from anonymous and authenticated clients. Only trusted server code writes submissions.

Create a private `internal.feedback_review` view that joins the submission to the reporter profile when available. The view exposes the information needed to review and manage submissions in the Supabase dashboard while remaining inaccessible to application users.

## Server Flow

The feedback page posts JSON to a server-only API route. The route:

1. Parses and validates the feedback type, message, optional email, originating pathname, and hidden spam-trap field.
2. Reads the current Supabase session and attaches the user ID when available.
3. Inserts the valid submission through the service-role Supabase client.
4. Attempts to send an email notification through Resend.
5. Returns success after persistence even if the notification email fails.

The notification reuses `RESEND_API_KEY`, `QUESTION_REPORT_EMAIL_TO`, and `QUESTION_REPORT_EMAIL_FROM`, since question reports and general feedback go to the same owner. The email includes the type, message, contact email, reporter user ID, originating page, submission ID, and a Supabase review query.

## Abuse Protection

The public form includes a hidden honeypot field. The server rejects payloads that fill it and strictly caps every accepted field. The originating page stores only a same-site pathname, never an arbitrary URL or query string.

This is lightweight protection appropriate for the current product stage. If spam becomes material, a managed challenge or persistent rate limiter can be added later without changing the stored feedback model.

## Error Handling

Malformed or bot-like submissions receive a generic validation response. Database failures return a retryable error and do not claim the feedback was received. Notification failures are swallowed after a successful insert so Resend availability cannot lose feedback.

The client disables duplicate submission while a request is in flight, preserves form contents after errors, and provides accessible status and error announcements.

## Testing

Test-first coverage will include:

- Payload validation for accepted types, required and trimmed messages, message length, email validity, pathname safety, and the honeypot.
- Repository insertion shape.
- API behavior for guests and signed-in users.
- Successful persistence when email delivery fails.
- Email payload and unconfigured-email behavior.
- The global footer link on every route through the root layout.
- Feedback page controls, limits, and submission states.

Run the focused tests during each red-green cycle, then run the full test suite, lint, and production build before completion.
