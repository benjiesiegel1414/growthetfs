# GrowthETFs.com — sitemap & indexing fixes

## Where each file goes

| File | Destination in repo |
|---|---|
| `build-growth-pages.js` | `scripts/build-growth-pages.js` |
| `build-growth-pages.yml` | `.github/workflows/build-growth-pages.yml` |
| `swipe.html` | `swipe.html` (repo root — overwrite existing) |
| `sitemap.xml` | `sitemap.xml` (repo root — overwrite existing) |

## Order of operations

1. Drop in `swipe.html` and `sitemap.xml`. Commit and push.
2. Add `scripts/build-growth-pages.js` and the workflow file.
3. Run locally once: `node scripts/build-growth-pages.js`
   - It prints the CSV column headers it detected. **Read that line.** If it
     matched the wrong column for return or expense, adjust the keyword arrays
     in the `main()` function before committing the output.
   - It writes `/etf/*.html`, `all-growth-etfs.html`, and overwrites `sitemap.xml`.
4. Spot-check ten random `/etf/` pages. If they read thin, fix that before
   submitting to GSC — not after.
5. Commit the generated files and push.
6. In GSC, re-submit `https://growthetfs.com/sitemap.xml`. The discovered count
   should jump from 1 to (7 + number of tickers).

## What changed in swipe.html

- **Canonical and og:url now point to `/swipe.html`** instead of `/swipe`.
  The old value pointed at a URL that may not resolve, which tells Google the
  real page is a 404 and gets `swipe.html` dropped from the index.
  *If `/swipe` does resolve on your Pages setup and you prefer the clean URL,
  change it back — but then use that same form in the sitemap too. Pick one.*
- **Added links to `/all-growth-etfs.html`** in the CTA row, the SEO section,
  and the footer, so the hub is not orphaned.
- **Detail modal now links to the ticker's own generated page.** This is how
  the swipe tool starts feeding crawl equity into the programmatic pages.
- **`trackView()` still fires a virtual `page_view` per swipe** — unchanged
  behaviour, one pageview per ETF shown. The symbol stays in the query string
  rather than the path, so swipes aggregate under `/swipe.html` in the Pages and
  Screens report instead of fragmenting into dozens of rows. An `etf_swipe`
  event now fires alongside it, carrying `etf_symbol` and `swipe_count`, so you
  can also report on swipe depth per session.

## Still on your side

- **Homepage links to `growth-etfs-watchlist-builder` (no `.html`); swipe.html
  links to `growth-etfs-watchlist-builder.html`.** Two URLs for one page.
  Pick one form, use it in both files, and set the canonical on that page to match.
- **Add `/all-growth-etfs.html` to the homepage nav or CTA row.** I don't have
  your `index.html`, so I couldn't patch it.
- **Verify every URL in `sitemap.xml` returns 200** before re-submitting.
  I listed `advertise.html`, `privacy-policy.html`, and `terms.html` based on
  your homepage footer links — confirm they resolve.
