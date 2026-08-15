# Search-First Daily Review Design

## Goal

Make the nightly Daily 5 review reliably verify every answer with a reputable web source, and let an authorized owner correct a flagged answer from the private review page before publication.

## Decisions

### Verification flow

Every primary and replacement verification uses the OpenAI Responses API web-search tool immediately. Searches remain restricted to the existing approved sports domains plus configured additions. The request continues to use strict Structured Outputs, but the structured model payload contains only the verdict, confidence, explanation, and conflicts. Evidence links are built from the web-search source metadata returned by OpenAI, so a model-written URL can no longer invalidate an otherwise useful result.

One malformed or incomplete structured response receives one bounded retry with the same search restrictions. A second malformed response becomes `unable_to_verify`. A completed response with no approved returned source cannot pass and becomes `unable_to_verify`. The existing timeout, response-size, usage accounting, search-call cap, model allowlist, and monthly scheduled-review budget protections remain.

Alternatives considered:

- Keep the saved-evidence-first flow and search only after a valid `unable_to_verify` result. This is slightly cheaper but preserves the failure path seen in the August 15 report.
- Keep the current flow and merely retry malformed output. This treats the parser symptom but still does not guarantee a fresh source for every question.
- Use unrestricted search or deep research. This is unnecessary for five questions and weakens source control or increases cost and latency.

### Owner answer correction

The private daily-review page shows all four choices and the currently expected answer for unresolved flagged questions. The owner can select a different correct option and choose **Verify and apply**.

The server:

1. authenticates the allowlisted Supabase user and validates same-origin JSON;
2. confirms the review item is unresolved and the Daily 5 is still generated but unpublished;
3. builds a proposed snapshot differing only in `correct_option`;
4. runs the same search-first verifier;
5. applies nothing unless the result is `passed` with approved evidence; and
6. atomically updates the canonical question, the unpublished daily challenge snapshot, and the review item, then records the item as kept with correction metadata.

If verification returns `risk` or `unable_to_verify`, the page displays the finding and leaves the stored answer unchanged. Existing **Keep** and **Replace** actions remain. Resolved or published questions stay immutable through this workflow; there is no reopen feature in this scope.

### Data and accounting

A new service-role-only database function performs the answer correction under row locks and rejects stale, resolved, mismatched, or published data. The correction metadata records the previous and new options and the verifier finding. The admin endpoint is limited to one verification attempt at a time and uses the existing model, timeout, output, search, and API-account spending controls. Scheduled run cost accounting remains unchanged; the manual response returns its estimated API cost for owner visibility.

### Interface and errors

The page keeps its current utilitarian admin styling. The correction control uses radio buttons because it selects one answer from four. While verification is running, all item actions are disabled. Success refreshes the server-rendered review. A failed verification shows the verdict, explanation, and approved evidence links without changing the draft.

### Testing

Tests cover:

- search being enabled on the first verification request;
- strict structured output without model-authored evidence fields;
- evidence derived from approved search metadata;
- one malformed-response retry and terminal failure after the retry;
- unchanged usage and search-call accounting limits;
- admin authentication, origin, payload, stale-state, and publication guards;
- no database mutation on `risk` or `unable_to_verify`;
- atomic canonical-question and draft-snapshot correction on `passed`;
- admin page answer controls, disabled states, and displayed verification errors; and
- the complete existing test and lint suites.
