#!/usr/bin/env node
/**
 * build-growth-pages.js
 * GrowthETFs.com programmatic page generator.
 *
 * Outputs:
 *   /etf/TICKER-growth-etf.html   one static page per ETF
 *   /all-growth-etfs.html         hub page linking every generated page
 *   /sitemap.xml                  regenerated from static pages + generated pages
 *
 * Run:  node scripts/build-growth-pages.js
 * Node 18+ (uses global fetch).
 */

const fs = require('fs');
const path = require('path');

// ─── CONFIG ────────────────────────────────────────────────
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgB3eBiOxZ6CoBjVvi9Rm3PmJDssWCsHWuVG4YgCPnXLG02u0tQxoR055J-e21MYbXJES1UpPTy7h9/pub?gid=0&single=true&output=csv';

const SITE     = 'https://growthetfs.com';
const ROOT     = process.cwd();
const ETF_DIR  = path.join(ROOT, 'etf');
const GA_ID    = 'G-YP7X02DW6C';
const ADSENSE  = 'ca-pub-9929351005136304';
const OG_IMAGE = SITE + '/growth1.png';

// Hand-maintained pages. Edit this list when you add or remove a real page.
// Verify each one resolves before adding it — a 404 in the sitemap is worse
// than an omission.
const STATIC_PAGES = [
  { loc: SITE + '/',                                    priority: true },
  { loc: SITE + '/all-growth-etfs.html' },
  { loc: SITE + '/swipe.html' },
  { loc: SITE + '/growth-etfs-watchlist-builder.html' },
  { loc: SITE + '/advertise.html' },
  { loc: SITE + '/privacy-policy.html' },
  { loc: SITE + '/terms.html' }
];

const TODAY = new Date().toISOString().slice(0, 10);

// ─── HELPERS ───────────────────────────────────────────────
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// XML needs ampersands escaped or the parse dies at the first one.
function escXml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function parseNum(str) {
  if (str === undefined || str === null) return null;
  const s = String(str).trim();
  if (!s || s === '-' || s === '\u2014' || s.toUpperCase() === 'N/A') return null;
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? null : n;
}

// "$1.2B" -> 1200 (millions).  "$450M" -> 450.  "1,250" -> 1250.
function parseAUM(str) {
  if (!str) return null;
  const s = String(str).trim().toUpperCase();
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  if (isNaN(n)) return null;
  if (s.includes('B')) return n * 1000;
  if (s.includes('K')) return n / 1000;
  return n; // assume millions
}

function slug(sym) {
  return String(sym).trim().toUpperCase().replace(/[^A-Z0-9]/g, '').toLowerCase();
}

// Quote-aware CSV parser. Handles commas inside fund names and "" escapes.
function parseCSV(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').map(line => {
    const out = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++; continue; }
        inQ = !inQ; continue;
      }
      if (ch === ',' && !inQ) { out.push(cur.trim()); cur = ''; continue; }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  });
}

function getColIndex(headers, keywords) {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (keywords.some(k => h.includes(k))) return i;
  }
  return -1;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── SHARED CHROME ─────────────────────────────────────────
const HEAD_COMMON = `
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Lato:wght@400;700;900&family=Merriweather:wght@700;900&display=swap" rel="stylesheet">
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', '${GA_ID}');
</script>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE}" crossorigin="anonymous"></script>`;

const STYLES = `
:root{--brand:#002D22;--brand-dark:#001a14;--brand-mid:#003d2e;--gold:#c9a94e;--gold2:#e8c96a;
--green-pos:#2ecc8f;--green-deep:#1a8c52;--red:#e74c3c;--bg:#f2f4f0;--text:#222;--muted:#666;--line:#e8e8e0}
*{margin:0;padding:0;box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{font-family:'Lato',Arial,sans-serif;background:var(--bg);color:var(--text);line-height:1.6}
a{color:var(--brand)}
.site-header{background:var(--brand);display:flex;align-items:center;justify-content:space-between;gap:10px;
padding:12px 16px;position:sticky;top:0;z-index:200;border-bottom:3px solid var(--gold);box-shadow:0 4px 12px rgba(0,0,0,.3)}
.header-logo{color:var(--gold);font-family:'Merriweather',Georgia,serif;font-weight:900;
font-size:clamp(15px,4.6vw,22px);text-decoration:none;letter-spacing:-.5px;white-space:nowrap}
.header-cta{background:rgba(201,169,78,.18);color:var(--gold);border:2px solid var(--gold);padding:8px 14px;
border-radius:999px;font-weight:700;font-size:13px;text-decoration:none;white-space:nowrap}
.site-network-bar{background:#fff;border-bottom:1px solid #ddd;padding:6px 0}
.site-network-track{max-width:1400px;margin:0 auto;padding:0 12px;display:flex;align-items:center;gap:6px;
overflow-x:auto;white-space:nowrap;scrollbar-width:none}
.site-network-track::-webkit-scrollbar{display:none}
.site-network-label{font-size:9px;text-transform:uppercase;letter-spacing:.5px;color:#999;font-weight:900;flex-shrink:0}
.site-pill{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;border-radius:999px;border:1px solid var(--brand);
background:#fff;color:var(--brand);font-size:11px;font-weight:700;text-decoration:none;flex-shrink:0}
.site-pill.current{background:var(--brand);color:var(--gold2)}
.wrap{max-width:900px;margin:0 auto;padding:0 18px}
.crumbs{font-size:12.5px;color:var(--muted);padding:14px 0 0}
.crumbs a{color:var(--muted)}
.hero{background:linear-gradient(135deg,var(--brand) 0%,var(--brand-mid) 100%);color:#fff;
border-radius:20px;border:3px solid var(--brand);padding:26px 22px;margin:14px 0 22px}
.hero .ticker{font-family:'Merriweather',Georgia,serif;font-weight:900;color:var(--gold);
font-size:clamp(38px,11vw,60px);line-height:1;letter-spacing:-2px}
.hero h1{font-size:clamp(17px,4.4vw,22px);font-weight:700;margin-top:8px;line-height:1.35}
.focus-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:18px 0}
.focus-box{background:#fff;border:2px solid var(--brand);border-radius:14px;padding:16px 10px;text-align:center}
.focus-box.growth{border-color:var(--green-pos);background:#f0fdf4}
.focus-val{font-family:'Merriweather',Georgia,serif;font-weight:900;font-size:clamp(22px,6.4vw,32px);
color:var(--brand);line-height:1.05;overflow-wrap:anywhere}
.focus-box.growth .focus-val{color:var(--green-deep)}
.focus-val.negative{color:var(--red)}
.focus-label{font-size:10px;font-weight:900;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-top:7px}
h2{font-family:'Merriweather',Georgia,serif;font-size:clamp(19px,5.2vw,25px);color:var(--brand);margin:30px 0 12px}
h3{font-size:clamp(15px,4.2vw,18px);color:var(--brand);margin:22px 0 8px;font-weight:900}
p{margin-bottom:14px;color:#3a3a3a}
table{width:100%;border-collapse:collapse;background:#fff;border:3px solid var(--brand);
border-radius:8px;overflow:hidden;margin:14px 0 22px;font-size:14px}
th{background:var(--brand);color:var(--gold2);text-align:left;padding:11px 12px;font-size:12px;
text-transform:uppercase;letter-spacing:.5px}
td{padding:11px 12px;border-bottom:1px solid var(--line)}
tbody tr:nth-child(even){background:#f7f9f6}
tbody tr:hover{background:#eaf3ec}
td.pos{color:var(--green-deep);font-weight:800}
td.neg{color:var(--red);font-weight:800}
td a{font-weight:800;text-decoration:none}
.cta-row{display:flex;flex-wrap:wrap;gap:10px;margin:22px 0}
.cta{display:inline-flex;align-items:center;justify-content:center;padding:13px 20px;border-radius:999px;
font-weight:900;font-size:14px;text-decoration:none;min-height:46px}
.cta-gold{background:var(--gold);color:var(--brand)}
.cta-outline{background:#fff;color:var(--brand);border:2px solid var(--brand)}
.related{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin:14px 0 22px}
.related a{display:block;background:#fff;border:2px solid var(--brand);border-radius:12px;padding:12px;
text-decoration:none;text-align:center}
.related .r-sym{font-family:'Merriweather',Georgia,serif;font-weight:900;font-size:18px;color:var(--brand)}
.related .r-ret{font-size:13px;font-weight:800;color:var(--green-deep);margin-top:3px}
.faq-q{font-weight:900;color:var(--brand);margin-top:18px}
.fine{font-size:13px;color:#777;line-height:1.7;margin-top:26px;border-top:1px solid #ddd;padding-top:18px}
footer{text-align:center;padding:30px 18px 40px;color:var(--muted);font-size:12.5px;line-height:1.8;
border-top:1px solid #ddd;margin-top:26px}
footer a{color:var(--brand);text-decoration:none;font-weight:700}
@media(max-width:520px){
  table{font-size:13px}
  th,td{padding:9px 8px}
}`;

function header(currentLabel) {
  return `<header class="site-header">
  <a href="${SITE}" class="header-logo">GrowthETFs.com</a>
  <a href="${SITE}/swipe.html" class="header-cta">\u{1F4C8} Swipe ETFs</a>
</header>
<div class="site-network-bar">
  <div class="site-network-track">
    <span class="site-network-label">Our Sites:</span>
    <a href="https://topdividendetfs.com/" class="site-pill">\u{1F4B5} TopDividendETFs.com</a>
    <a href="https://weeklyetfs.com/" class="site-pill">\u{1F4C5} WeeklyETFs.com</a>
    <a href="https://monthlyetfs.com/" class="site-pill">\u{1F5D3}\uFE0F MonthlyETFs.com</a>
    <span class="site-pill current">\u{1F4C8} GrowthETFs.com</span>
    <a href="https://topspaceetfs.com/" class="site-pill">\u{1F680} TopSpaceETFs.com</a>
    <a href="https://etftotalreturns.com/" class="site-pill">\u{1F4CA} ETFTotalReturns.com</a>
    <a href="https://topdividendtools.com/" class="site-pill">\u{1F6E0}\uFE0F TopDividendTools.com</a>
  </div>
</div>`;
}

const FOOTER = `<footer>
  <a href="${SITE}">GrowthETFs.com</a> &bull;
  <a href="${SITE}/all-growth-etfs.html">All Growth ETFs</a> &bull;
  <a href="${SITE}/swipe.html">Swipe Tool</a> &bull;
  <a href="${SITE}/terms.html">Terms</a> &bull;
  <a href="${SITE}/privacy-policy.html">Privacy</a><br><br>
  Data sourced from public information &bull; Updated regularly &bull; <strong>Not financial advice</strong><br>
  GrowthETFs.com is for entertainment &amp; educational purposes ONLY.
</footer>`;

const DISCLAIMER = `<p class="fine"><strong>Disclaimer:</strong> GrowthETFs.com is for informational and educational
purposes only. Nothing on this page constitutes investment advice or a recommendation to buy or sell any security.
ETF data may be inaccurate or outdated and is sourced from public information. Investing carries risk, including
loss of principal. We are not financial advisors. Always consult a licensed financial advisor before making
investment decisions. <strong>This site is for entertainment purposes ONLY.</strong></p>`;

// ─── PER-ETF PAGE ──────────────────────────────────────────
function etfPage(etf, all) {
  const url   = `${SITE}/etf/${etf.slug}-growth-etf.html`;
  const rank  = etf.rank;
  const total = all.length;
  const rc    = etf.returnNum === null ? '' : (etf.returnNum >= 0 ? '' : 'negative');

  // Differentiating context so no two pages read the same.
  const ranked   = all.filter(e => e.returnNum !== null);
  const medianRet = ranked.length
    ? ranked[Math.floor(ranked.length / 2)].returnNum
    : null;

  let placement;
  if (rank === null) {
    placement = `${esc(etf.symbol)} does not currently have a return figure in our data set, so it is not ranked against the rest of the list.`;
  } else {
    const pct = Math.round(((total - rank + 1) / total) * 100);
    placement = `${esc(etf.symbol)} currently sits ${ordinal(rank)} out of ${total} funds on the GrowthETFs list when sorted by return, putting it in roughly the top ${100 - pct + 1}% of the funds we track.`;
    if (medianRet !== null && etf.returnNum !== null) {
      placement += etf.returnNum >= medianRet
        ? ` That places it above the median return across the list.`
        : ` That places it below the median return across the list.`;
    }
  }

  let sizeNote;
  if (etf.aumNum === null) {
    sizeNote = `Assets under management are not listed for ${esc(etf.symbol)} in our current data.`;
  } else if (etf.aumNum >= 10000) {
    sizeNote = `At ${esc(etf.aum)} in assets, ${esc(etf.symbol)} is one of the larger funds on the list, which generally means tighter spreads and deeper daily liquidity.`;
  } else if (etf.aumNum >= 1000) {
    sizeNote = `With ${esc(etf.aum)} in assets, ${esc(etf.symbol)} clears the $1B mark used by the "Big AUM" filter on the main GrowthETFs list.`;
  } else if (etf.aumNum >= 100) {
    sizeNote = `${esc(etf.symbol)} holds ${esc(etf.aum)} in assets, a mid-sized fund by the standards of this list.`;
  } else {
    sizeNote = `${esc(etf.symbol)} holds ${esc(etf.aum)} in assets, which is small relative to most funds on this list. Smaller funds can carry wider bid-ask spreads and higher closure risk.`;
  }

  const expNum = parseNum(etf.expense);
  let expNote;
  if (expNum === null) {
    expNote = `An expense ratio is not listed for ${esc(etf.symbol)} in our current data.`;
  } else if (expNum <= 0.20) {
    expNote = `Its expense ratio of ${esc(etf.expense)} is on the low end, typical of broad index-tracking growth funds.`;
  } else if (expNum <= 0.60) {
    expNote = `Its expense ratio of ${esc(etf.expense)} sits in the middle of the range for growth ETFs.`;
  } else {
    expNote = `Its expense ratio of ${esc(etf.expense)} is on the higher end, which is common for thematic or actively managed growth strategies. Fees compound against you over long holding periods.`;
  }

  // Related = neighbours by rank, so every page links somewhere different.
  const idx = all.indexOf(etf);
  const related = all
    .slice(Math.max(0, idx - 3), idx)
    .concat(all.slice(idx + 1, idx + 4))
    .slice(0, 6);

  const relatedHtml = related.map(r =>
    `<a href="${SITE}/etf/${r.slug}-growth-etf.html">
      <div class="r-sym">${esc(r.symbol)}</div>
      <div class="r-ret">${esc(r.returnVal)}</div>
    </a>`).join('\n      ');

  const faq = [
    {
      q: `What is ${etf.symbol}?`,
      a: `${etf.symbol} is ${etf.name}, listed on the GrowthETFs.com curated growth ETF list. It is tracked here alongside ${total - 1} other growth-focused ETFs.`
    },
    {
      q: `What is the expense ratio of ${etf.symbol}?`,
      a: `Our data lists the expense ratio for ${etf.symbol} as ${etf.expense}. Always confirm the current figure on the issuer's own fund page before investing.`
    },
    {
      q: `How large is ${etf.symbol}?`,
      a: `Our data lists assets under management for ${etf.symbol} as ${etf.aum}. Fund size changes daily with flows and market moves.`
    },
    {
      q: `Is ${etf.symbol} a good investment?`,
      a: `We don't answer that. GrowthETFs.com is an informational and entertainment site and publishes no buy or sell signals. Whether any fund suits you depends on your own goals, time horizon and risk tolerance. Speak with a licensed financial advisor.`
    }
  ];

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  };

  const crumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'GrowthETFs.com', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'All Growth ETFs', item: SITE + '/all-growth-etfs.html' },
      { '@type': 'ListItem', position: 3, name: etf.symbol, item: url }
    ]
  };

  const title = `${etf.symbol} Growth ETF \u2014 Return, AUM & Expense Ratio | GrowthETFs.com`;
  const desc  = `${etf.symbol} (${etf.name}) growth ETF data: return ${etf.returnVal}, AUM ${etf.aum}, expense ratio ${etf.expense}. See how it ranks against ${total} growth ETFs.`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="article">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@TopDividendETFs">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<script type="application/ld+json">${JSON.stringify(crumbSchema)}</script>
<script type="application/ld+json">${JSON.stringify(faqSchema)}</script>${HEAD_COMMON}
<style>${STYLES}</style>
</head>
<body>
${header()}
<main class="wrap">
  <div class="crumbs"><a href="${SITE}/">Home</a> &rsaquo; <a href="${SITE}/all-growth-etfs.html">All Growth ETFs</a> &rsaquo; ${esc(etf.symbol)}</div>

  <section class="hero">
    <div class="ticker">${esc(etf.symbol)}</div>
    <h1>${esc(etf.name)}</h1>
  </section>

  <div class="focus-grid">
    <div class="focus-box growth">
      <div class="focus-val ${rc}">${esc(etf.returnVal)}</div>
      <div class="focus-label">Return</div>
    </div>
    <div class="focus-box">
      <div class="focus-val">${esc(etf.aum)}</div>
      <div class="focus-label">AUM</div>
    </div>
  </div>

  <h2>${esc(etf.symbol)} at a glance</h2>
  <table>
    <tbody>
      <tr><th scope="row">Ticker</th><td><strong>${esc(etf.symbol)}</strong></td></tr>
      <tr><th scope="row">Fund name</th><td>${esc(etf.name)}</td></tr>
      <tr><th scope="row">Return</th><td class="${etf.returnNum === null ? '' : (etf.returnNum >= 0 ? 'pos' : 'neg')}">${esc(etf.returnVal)}</td></tr>
      <tr><th scope="row">Assets under management</th><td>${esc(etf.aum)}</td></tr>
      <tr><th scope="row">Expense ratio</th><td>${esc(etf.expense)}</td></tr>
      <tr><th scope="row">Rank on this list</th><td>${rank === null ? 'Unranked' : ordinal(rank) + ' of ' + total}</td></tr>
    </tbody>
  </table>

  <h2>How ${esc(etf.symbol)} compares</h2>
  <p>${placement}</p>
  <p>${sizeNote}</p>
  <p>${expNote}</p>

  <h3>Reading these numbers</h3>
  <p>Return figures on this list are backward-looking. A fund near the top has already moved, which tells you about
  the period behind it and nothing about the period ahead. Concentrated growth funds in particular tend to post the
  biggest gains and the biggest drawdowns, often in the same year. Pair the return column with the AUM and expense
  columns rather than reading it alone.</p>

  <div class="cta-row">
    <a class="cta cta-gold" href="${SITE}/">See the full ranked list &rarr;</a>
    <a class="cta cta-outline" href="${SITE}/swipe.html">\u{1F4C8} Swipe growth ETFs</a>
  </div>

  <h2>Similar growth ETFs</h2>
  <div class="related">
      ${relatedHtml}
  </div>

  <h2>${esc(etf.symbol)} FAQ</h2>
  ${faq.map(f => `<p class="faq-q">${esc(f.q)}</p>\n  <p>${esc(f.a)}</p>`).join('\n  ')}

  ${DISCLAIMER}
</main>
${FOOTER}
</body>
</html>`;
}

// ─── HUB PAGE ──────────────────────────────────────────────
function hubPage(all) {
  const url = `${SITE}/all-growth-etfs.html`;
  const title = `All Growth ETFs \u2014 Full List of ${all.length} Funds | GrowthETFs.com`;
  const desc = `Complete list of all ${all.length} growth ETFs tracked on GrowthETFs.com, with return, AUM and expense ratio for each. Free, updated daily.`;

  const rows = all.map(e => `      <tr>
        <td><a href="${SITE}/etf/${e.slug}-growth-etf.html">${esc(e.symbol)}</a></td>
        <td>${esc(e.name)}</td>
        <td class="${e.returnNum === null ? '' : (e.returnNum >= 0 ? 'pos' : 'neg')}">${esc(e.returnVal)}</td>
        <td>${esc(e.aum)}</td>
        <td>${esc(e.expense)}</td>
      </tr>`).join('\n');

  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'All Growth ETFs',
    numberOfItems: all.length,
    itemListElement: all.slice(0, 100).map((e, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: e.symbol,
      url: `${SITE}/etf/${e.slug}-growth-etf.html`
    }))
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${url}">
<meta name="robots" content="index, follow">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:type" content="website">
<meta property="og:image" content="${OG_IMAGE}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@TopDividendETFs">
<script type="application/ld+json">${JSON.stringify(itemList)}</script>${HEAD_COMMON}
<style>${STYLES}</style>
</head>
<body>
${header()}
<main class="wrap">
  <div class="crumbs"><a href="${SITE}/">Home</a> &rsaquo; All Growth ETFs</div>

  <h2 style="margin-top:16px">All ${all.length} growth ETFs we track</h2>
  <p>Every growth ETF on the GrowthETFs.com list, sorted by return. Each ticker links to its own page with full
  data and context. Rebuilt daily from our public data sheet.</p>

  <div class="cta-row">
    <a class="cta cta-gold" href="${SITE}/">Ranked list with filters &amp; voting &rarr;</a>
    <a class="cta cta-outline" href="${SITE}/swipe.html">\u{1F4C8} Swipe growth ETFs</a>
  </div>

  <table>
    <thead>
      <tr><th>Ticker</th><th>Fund name</th><th>Return</th><th>AUM</th><th>Expense</th></tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>

  ${DISCLAIMER}
</main>
${FOOTER}
</body>
</html>`;
}

// ─── SITEMAP ───────────────────────────────────────────────
function sitemap(all) {
  const entries = [];

  for (const p of STATIC_PAGES) {
    entries.push(`  <url>\n    <loc>${escXml(p.loc)}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </url>`);
  }
  for (const e of all) {
    entries.push(`  <url>\n    <loc>${escXml(SITE + '/etf/' + e.slug + '-growth-etf.html')}</loc>\n    <lastmod>${TODAY}</lastmod>\n  </url>`);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;
}

// ─── MAIN ──────────────────────────────────────────────────
async function main() {
  console.log('Fetching CSV...');
  const res = await fetch(CSV_URL + '&t=' + Date.now());
  if (!res.ok) throw new Error('CSV fetch failed: ' + res.status);
  const rows = parseCSV(await res.text());
  if (rows.length < 2) throw new Error('CSV has no data rows');

  const headers    = rows[0];
  const tickerIdx  = getColIndex(headers, ['ticker', 'symbol']);
  const nameIdx    = getColIndex(headers, ['etf name', 'fund name', 'name']);
  const aumIdx     = getColIndex(headers, ['aum', 'assets']);
  const expenseIdx = getColIndex(headers, ['expense', 'exp']);
  const returnIdx  = getColIndex(headers, ['return', 'ytd', '1 year', 'performance', 'gain']);

  if (tickerIdx < 0) throw new Error('No ticker/symbol column found. Headers: ' + headers.join(' | '));
  console.log('Headers detected:', headers.join(' | '));

  const seen = new Set();
  let all = [];
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i];
    const sym = (tickerIdx >= 0 ? c[tickerIdx] : '').trim().toUpperCase();
    if (!sym || seen.has(sym)) continue;
    seen.add(sym);

    const returnVal = (returnIdx >= 0 && c[returnIdx]) ? c[returnIdx] : '\u2014';
    const aum       = (aumIdx >= 0 && c[aumIdx]) ? c[aumIdx] : '\u2014';

    all.push({
      symbol: sym,
      slug: slug(sym),
      name: (nameIdx >= 0 ? c[nameIdx] : '') || 'Growth ETF',
      aum,
      aumNum: parseAUM(aum),
      expense: (expenseIdx >= 0 && c[expenseIdx]) ? c[expenseIdx] : '\u2014',
      returnVal,
      returnNum: parseNum(returnVal)
    });
  }

  if (!all.length) throw new Error('No valid rows parsed');

  // Sort by return desc; unranked entries fall to the bottom.
  all.sort((a, b) => {
    if (a.returnNum === null && b.returnNum === null) return a.symbol.localeCompare(b.symbol);
    if (a.returnNum === null) return 1;
    if (b.returnNum === null) return -1;
    return b.returnNum - a.returnNum;
  });
  let r = 0;
  all.forEach(e => { e.rank = e.returnNum === null ? null : ++r; });

  fs.mkdirSync(ETF_DIR, { recursive: true });

  let written = 0;
  for (const etf of all) {
    fs.writeFileSync(path.join(ETF_DIR, `${etf.slug}-growth-etf.html`), etfPage(etf, all), 'utf8');
    written++;
  }

  fs.writeFileSync(path.join(ROOT, 'all-growth-etfs.html'), hubPage(all), 'utf8');
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), sitemap(all), 'utf8');

  console.log(`Wrote ${written} ETF pages to /etf/`);
  console.log(`Wrote all-growth-etfs.html`);
  console.log(`Wrote sitemap.xml with ${STATIC_PAGES.length + all.length} URLs`);
}

main().catch(err => {
  console.error('BUILD FAILED:', err.message);
  process.exit(1);
});
