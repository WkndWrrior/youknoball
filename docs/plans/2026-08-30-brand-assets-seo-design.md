# YouKnoBall Brand Assets And SEO Polish Design

## Goal

Complete the deferred public-facing SEO polish without adding unnatural content or changing gameplay. Establish a simple YouKnoBall wordmark, replace the generic favicon, add one shared social preview image, expose install metadata, and make only the approved visible copy refinements.

## Scope

This package includes:

- a reusable all-caps `YOUKNOBALL` wordmark
- a compact `YKB` icon system
- one shared Open Graph and Twitter/X preview image
- browser, Apple touch, and installable-app icons
- a web app manifest
- three approved visible copy substitutions
- metadata and asset tests

Google Search Console and Bing Webmaster Tools registration remain a follow-up because they require account ownership and DNS verification.

## Brand System

The canonical product name remains `YouKnoBall` in metadata, descriptions, email copy, and normal prose. The visual wordmark renders as `YOUKNOBALL` in all caps.

The wordmark uses:

- the existing condensed display typography
- the existing brand orange `#ff7a18` for every letter
- no secondary logo color
- no league, team, or single-sport imagery

The compact mark renders `YKB` in the same orange on a near-black background. It is used where the full wordmark would not remain legible, including browser tabs, mobile home screens, and installed-app surfaces.

## Social Preview Image

Create one shared 1200 by 630 image for all public pages. It contains only the all-orange `YOUKNOBALL` wordmark on a near-black background with restrained site-matching texture or line detail. It does not contain a subtitle, sport equipment, sport-specific variants, or promotional copy.

Open Graph and Twitter/X metadata continue to provide page-specific titles and descriptions. A shared image therefore preserves brand consistency while links such as the NBA category remain identifiable from their accompanying title and description.

The image is generated through the Next.js metadata image convention so dimensions, MIME type, cache behavior, and metadata tags remain part of the application build.

## Icons And Manifest

Remove the generic Vercel favicon and replace it with the compact `YKB` mark.

Provide:

- a browser icon
- an Apple touch icon
- 192 by 192 and 512 by 512 install icons
- maskable-safe spacing for mobile launchers

Add a web app manifest with:

- name `YouKnoBall`
- short name `YouKnoBall`
- description from the existing SEO contract
- start URL `/`
- standalone display mode
- background color `#050505`
- theme color `#ff7a18`
- the generated install icons

The manifest improves installed-home-screen presentation but does not add offline support or a service worker.

## Visible Copy

Do not add new SEO boxes, long explanatory sections, or duplicated keyword paragraphs. Existing public page structure remains unchanged.

Make only these approved substitutions:

1. Daily Challenge introduction:
   - From: `Five all-sports questions, one score, and a shareable result card when you're done.`
   - To: `Five sports trivia questions, one score, and a result worth sharing.`
2. Categories introduction:
   - From: `Pick a sport-specific quiz and run five fresh questions.`
   - To: `Pick a sports trivia quiz and run five fresh questions.`
3. NBA category description:
   - From: `Daily challenge energy, but tuned for league-pass addicts and playoff overreactors.`
   - To: `NBA trivia for League Pass addicts and playoff overreactors.`

The homepage hero, NFL sentence, other sport descriptions, and leaderboard copy remain unchanged. The approved substitutions preserve or reduce mobile copy length.

## Testing And Review

Add focused tests for:

- the exact wordmark and brand colors
- Open Graph and Twitter/X image metadata
- icon dimensions and output types
- manifest contents and icon references
- the three exact copy substitutions
- the absence of unintended new visible SEO sections

Run the full test suite, lint, and production build. Render and inspect the social image and icons at their intended sizes, and check the affected public pages at mobile and desktop widths before integration.

