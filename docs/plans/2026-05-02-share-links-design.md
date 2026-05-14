# Share Links Design

## Goal

Let players share a completed YouKnowBall daily result through the phone share sheet, direct X/Facebook links, and the existing copy fallback.

## Scope

Build the first sharing pass on the existing `/play` result card:

- Primary native Share button using the Web Share API when available.
- Copy result fallback that includes the public play URL.
- X/Twitter intent link with prefilled result text and URL.
- Facebook share link for the public play URL.
- Keep Instagram, Snapchat, Messages, and other apps reachable through the native share sheet for now.

Generated result images and platform-specific Instagram/Snapchat integrations are out of scope for this pass.

## Architecture

Create a small client-safe sharing helper module that builds canonical share payloads and outbound URLs from the existing `shareText`. The result card will consume those helpers and keep all platform behavior as links or browser-native APIs. The backend can continue returning plain result text; the browser adds the public URL because it knows the configured site origin.

## Platform Notes

The Web Share API is the broadest path for Messages, Instagram, Snapchat, Facebook, and other installed apps on mobile devices. X has a stable web intent URL for prefilled posts. Facebook web sharing is URL-centered, so YouKnowBall should rely on the shared page metadata instead of trying to prefill arbitrary result text.

## UX

The result card keeps the score text preview. Under it, show:

- `Share` for native share where supported.
- `Copy result` for universal fallback.
- Compact `X` and `Facebook` links.

If native sharing is unavailable, the Share button can fall back to copying the result. User feedback should reuse the existing status message area.

## Testing

Add helper tests for:

- Appending the public play URL to share text.
- Building native share data.
- Building X intent URLs.
- Building Facebook share URLs.

Add a focused `/play` page source test to catch the expected result-card controls without introducing a browser testing dependency.
