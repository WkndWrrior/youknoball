# SEO Foundation Design

## Goal

Establish a consistent, crawlable SEO foundation for YouKnoBall without changing gameplay or page layouts.

## Branding

- Use `YouKnoBall` for every user-facing and operational reference to the product.
- Replace `YouKnowBall` and `You Kno Ball` in application copy, emails, tests, and current documentation.
- Keep technical identifiers unchanged where spelling is structural, including `youknoball.com`, package names, URLs, and file paths.
- The externally configured email sender display name should also use `YouKnoBall`.

## Page Metadata

Each indexable page receives a unique title, description, and self-referencing canonical URL.

| Route | Title | Description |
| --- | --- | --- |
| `/` | `YouKnoBall \| Daily Sports Trivia` | `Play YouKnoBall, a free daily five-question sports trivia challenge covering the NBA, NFL, college football, college basketball, NHL, and MLB.` |
| `/play` | `Daily Sports Trivia Challenge \| YouKnoBall` | `Play today’s free five-question sports trivia challenge, test your all-sports knowledge, and compete on the YouKnoBall leaderboard.` |
| `/categories` | `Sports Trivia Quizzes \| YouKnoBall` | `Choose an NBA, NFL, college football, college basketball, NHL, or MLB trivia quiz on YouKnoBall and play five fresh questions whenever.` |
| `/categories/nba` | `NBA Trivia Quiz \| YouKnoBall` | `Test your NBA knowledge with a free five-question trivia quiz covering players, teams, iconic moments, records, and championships.` |
| `/categories/nfl` | `NFL Trivia Quiz \| YouKnoBall` | `Test your NFL knowledge with a free five-question trivia quiz covering players, teams, iconic moments, records, and Super Bowls.` |
| `/categories/cfb` | `College Football Trivia Quiz \| YouKnoBall` | `Test your college football knowledge with five trivia questions covering players, programs, rivalries, bowls, and national championships.` |
| `/categories/cbb` | `College Basketball Trivia Quiz \| YouKnoBall` | `Test your college basketball knowledge with five trivia questions covering players, programs, March Madness, and championship moments.` |
| `/categories/nhl` | `NHL Trivia Quiz \| YouKnoBall` | `Test your NHL knowledge with a free five-question trivia quiz covering players, teams, records, awards, and Stanley Cup moments.` |
| `/categories/mlb` | `MLB Trivia Quiz \| YouKnoBall` | `Test your MLB knowledge with a free five-question trivia quiz covering players, teams, records, pennant races, and World Series moments.` |
| `/leaderboard` | `Sports Trivia Leaderboard \| YouKnoBall` | `See how you rank against other YouKnoBall players by average Daily Challenge score, completion time, total plays, and recent results.` |

The root metadata uses `https://youknoball.com` as `metadataBase`. Canonicals use route-relative values so Next.js emits absolute production URLs.

## Crawling And Indexing

Create `robots.txt` through Next.js metadata routing. It allows normal public crawling, disallows `/api/`, `/admin/`, and `/auth/`, and declares the production sitemap and host.

Create `sitemap.xml` containing only these public pages:

- `/`
- `/play`
- `/categories`
- `/categories/nba`
- `/categories/nfl`
- `/categories/cfb`
- `/categories/cbb`
- `/categories/nhl`
- `/categories/mlb`
- `/leaderboard`

Do not publish invented `lastModified`, `changeFrequency`, or `priority` values.

Set `noindex, nofollow` metadata on utility, account, group, invitation, and admin pages. This includes `/login`, `/reset-password`, `/feedback`, `/groups` and its descendants, and `/admin` and its descendants. These pages remain usable; `noindex` only tells search engines not to list them. Login, reset-password, feedback, and group routes should not be blocked in `robots.txt`, because crawlers need to read their `noindex` directive.

## Structured Data

Add one static `WebSite` JSON-LD block to the homepage:

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "YouKnoBall",
  "url": "https://youknoball.com/"
}
```

The block is machine-readable and does not change the visible page.

## Testing

- Assert exact metadata, canonical URLs, and noindex directives.
- Assert `robots.txt` and `sitemap.xml` output.
- Assert homepage structured data.
- Scan active product code and documentation for outdated brand spellings.
- Run focused tests, then the full test suite, lint, and production build.

## Deferred Work

Open Graph and social images, a web app manifest, Search Console/Bing registration, and content expansion are separate follow-up packages.
