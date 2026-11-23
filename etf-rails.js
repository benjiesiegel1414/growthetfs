/* GrowthETFs.com fund pages: clean URLs + side rails.
   - Drops ".html" from the address bar on /etf/ pages.
   - Desktop: fixed rails either side of the page (breakdowns, outline, nearby funds, top funds, reading, tools).
     Rails never scroll on their own; rows are trimmed until everything fits on screen.
   - Phone / narrow screens: a swipeable breakdown strip under the hero and a "keep exploring" block lower down.
   Loaded with <script src="/etf-rails.js" defer></script> from the fund page template. */
(function () {
  if (window.__etfRails) return; window.__etfRails = 1;
  try { if (/\.html$/.test(location.pathname)) history.replaceState(null, '', location.pathname.replace(/\.html$/, '') + location.search + location.hash); } catch (e) {}

  var parts = location.pathname.replace(/\.html$/, '').replace(/\/$/, '').split('/'), sym = '', metric = '';
  if (parts[1] !== 'etf') return;
  var m = /^([a-z0-9]+)-growth-etf$/.exec(parts[2] || '');
  if (m) sym = m[1]; else if (parts[2] && parts[3]) { sym = parts[2]; metric = parts[3]; } else return;
  var SYM = sym.toUpperCase(), main = document.querySelector('main');
  if (!main) return;

  var CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgB3eBiOxZ6CoBjVvi9Rm3PmJDssWCsHWuVG4YgCPnXLG02u0tQxoR055J-e21MYbXJES1UpPTy7h9/pub?gid=0&single=true&output=csv';
  var METRICS = [['', 'Overview'], ['total-return', 'Total return'], ['growth-of-10k', 'Growth of $10,000'], ['vs-spy', 'vs S&P 500 (SPY)'], ['vs-qqq', 'vs Nasdaq-100 (QQQ)'],
    ['calendar-returns', 'Calendar-year returns'], ['drawdown', 'Max drawdown'], ['risk', 'Volatility and beta'], ['52-week-range', '52-week range'], ['dividends', 'Dividends and yield'], ['rank', 'Rank vs growth ETFs']];
  var TOOLS = [['All growth ETFs ranked', '/'], ['Swipe through growth ETFs', '/swipe.html'], ['Build a watchlist', '/growth-etfs-watchlist-builder.html'], ['Every growth ETF page', '/all-growth-etfs.html'], ['Blog', '/blog.html']];
  function fund(s, k) { s = String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); return k ? '/etf/' + s + '/' + k : '/etf/' + s + '-growth-etf'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function track(what) { try { if (typeof gtag === 'function') gtag('event', 'etf_rail_click', { rail_item: what, ticker: SYM }); } catch (e) {} }

  var W = 222, B = '#002D22', A = '#c9a94e';
  var css = [
    '.gr-r{position:fixed;width:' + W + 'px;overflow:hidden;z-index:30;font-family:Lato,-apple-system,"Segoe UI",sans-serif;display:none}',
    '.gr-b{background:#fff;border:1px solid #e3e8e1;border-radius:14px;padding:14px 14px 10px;margin:0 0 12px;box-shadow:0 1px 2px rgba(0,45,34,.05)}',
    '.gr-b h5{margin:0 0 8px;padding:0 0 8px;border-bottom:1px solid #e9ede7;font-size:10.5px;font-weight:900;letter-spacing:.13em;text-transform:uppercase;color:' + B + ';display:flex;justify-content:space-between;align-items:center;gap:8px}',
    '.gr-b h5 a{font-size:10px;letter-spacing:.06em;color:#8a6d1f;text-decoration:none;font-weight:900}',
    '.gr-b h5 a:hover{text-decoration:underline}',
    '.gr-b a.lnk{display:block;padding:6px 8px;margin:0 -8px;border-radius:7px;font-size:13.5px;line-height:1.3;color:#24352f;text-decoration:none;font-weight:700;border-left:3px solid transparent}',
    '.gr-b a.lnk:hover{background:#f2f5f0;color:' + B + '}',
    '.gr-b a.lnk.on{background:#f4efdf;border-left-color:' + A + ';color:' + B + ';font-weight:900}',
    '.gr-b a.row{display:flex;align-items:center;gap:8px;padding:6px 8px;margin:0 -8px;border-radius:7px;text-decoration:none;color:#24352f}',
    '.gr-b a.row:hover{background:#f2f5f0}',
    '.gr-b a.row .t{flex:none;min-width:50px;text-align:center;background:' + B + ';color:#fff;font-weight:900;font-size:11.5px;border-radius:5px;padding:3px 5px}',
    '.gr-b a.row .n{flex:1;min-width:0;font-size:12px;line-height:1.25;color:#55635d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.gr-b a.row .v{flex:none;font-size:12px;font-weight:900;color:#15803d;font-variant-numeric:tabular-nums}',
    '.gr-b a.row .v.neg{color:#dc2626}',
    '.gr-b a.row .k{flex:none;font-size:10.5px;font-weight:900;color:#8a968f;width:24px}',
    '.gr-b a.art{display:block;padding:7px 8px;margin:0 -8px;border-radius:7px;text-decoration:none;color:' + B + ';font-size:13px;line-height:1.35;font-weight:700}',
    '.gr-b a.art:hover{background:#f2f5f0}',
    '.gr-b a.art span{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}',
    '.gr-b a.art small{display:block;font-size:10.5px;color:#8a968f;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:2px}',
    '.gr-strip{display:none;gap:8px;overflow-x:auto;white-space:nowrap;padding:2px 0 12px;margin:0;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
    '.gr-strip::-webkit-scrollbar{display:none}',
    '.gr-strip a{flex:none;display:inline-block;padding:8px 13px;border-radius:999px;border:1px solid #cfd8cf;background:#fff;color:' + B + ';font:700 13px Lato,sans-serif;text-decoration:none}',
    '.gr-strip a.on{background:' + B + ';border-color:' + B + ';color:#fff}',
    '.gr-in{display:none;margin:0 0 16px}',
    '.gr-in .g{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
    '.gr-in .gr-b{margin:0}',
    '.gr-pn{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:12px;margin:0 0 16px}',
    '.gr-pn a{display:block;background:#fff;border:1px solid #e3e8e1;border-radius:14px;padding:13px 16px;text-decoration:none;color:' + B + ';font-family:Lato,sans-serif;transition:border-color .15s,box-shadow .15s}',
    '.gr-pn a:hover{border-color:' + A + ';box-shadow:0 8px 20px rgba(0,45,34,.1)}',
    '.gr-pn a.nx{text-align:right}',
    '.gr-pn small{display:block;font-size:10.5px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#8a968f;margin-bottom:3px}',
    '.gr-pn b{font-size:1.05rem;font-weight:900}',
    '.gr-pn span{display:block;font-size:12.5px;color:#55635d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '@media(max-width:620px){.gr-in .g{grid-template-columns:minmax(0,1fr)}}',
    '@media print{.gr-r,.gr-strip,.gr-in,.gr-pn{display:none!important}}'
  ].join('');
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);

  /* ----- static pieces (no data needed) ----- */
  function mlinks(cls) { return METRICS.map(function (x) { return '<a class="' + cls + (x[0] === metric ? ' on' : '') + '" href="' + fund(sym, x[0]) + '" data-r="breakdown:' + (x[0] || 'overview') + '">' + esc(x[1]) + '</a>'; }).join(''); }
  var hs = [].slice.call(main.querySelectorAll('h2')).filter(function (h) { return h.offsetParent && !/faq/i.test(h.textContent); });
  hs.forEach(function (h, i) { if (!h.id) h.id = 'sec-' + (i + 1); });
  var outline = hs.length >= 3 ? '<div class="gr-b" data-k="out"><h5>On this page</h5>' + hs.slice(0, 9).map(function (h) { return '<a class="lnk" href="#' + h.id + '" data-r="outline">' + esc(h.textContent.trim().replace(new RegExp('^' + SYM + '\\s+', 'i'), '').replace(/^./, function (c) { return c.toUpperCase(); })) + '</a>'; }).join('') + '</div>' : '';
  var toolsBox = '<div class="gr-b"><h5>Tools</h5>' + TOOLS.map(function (t) { return '<a class="lnk" href="' + t[1] + '" data-r="tool">' + esc(t[0]) + '</a>'; }).join('') + '</div>';

  var L = document.createElement('aside'); L.className = 'gr-r'; L.setAttribute('aria-label', SYM + ' pages');
  L.innerHTML = '<div class="gr-b"><h5>$' + SYM + ' breakdowns</h5>' + mlinks('lnk') + '</div>' + outline;
  var R = document.createElement('aside'); R.className = 'gr-r'; R.setAttribute('aria-label', 'More growth ETFs');
  R.innerHTML = '<div class="gr-b" data-k="near" hidden><h5>Ranked near $' + SYM + ' <a href="' + fund(sym, 'rank') + '">Rank</a></h5><div></div></div>' +
    '<div class="gr-b" data-k="read" hidden><h5>Keep reading <a href="/blog.html">All</a></h5><div></div></div>' +
    '<div class="gr-b" data-k="top" hidden><h5>Top total returns <a href="/">All</a></h5><div></div></div>' + toolsBox;
  document.body.appendChild(L); document.body.appendChild(R);

  var strip = document.createElement('nav'); strip.className = 'gr-strip'; strip.setAttribute('aria-label', SYM + ' breakdowns'); strip.innerHTML = mlinks('');
  var hero = main.querySelector('.gx-hero') || main.querySelector('.crumbs');
  if (hero && hero.parentNode) hero.parentNode.insertBefore(strip, hero.nextSibling);

  var inl = document.createElement('div'); inl.className = 'gr-in';
  inl.innerHTML = '<div class="g"><div class="gr-b" data-k="near" hidden><h5>Ranked near $' + SYM + '</h5><div></div></div><div class="gr-b" data-k="top" hidden><h5>Top total returns <a href="/">All</a></h5><div></div></div><div class="gr-b" data-k="read" hidden><h5>Keep reading <a href="/blog.html">All</a></h5><div></div></div></div>';
  var pn = document.createElement('div'); pn.className = 'gr-pn'; pn.hidden = true;
  var faq = main.querySelector('.card.faq') || main.querySelector('p.note') || main.lastElementChild;
  var mid = main.children[Math.min(main.children.length - 1, 5)];
  if (mid && mid !== faq) main.insertBefore(inl, mid); else main.insertBefore(inl, faq);
  main.insertBefore(pn, faq);

  document.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('.gr-r a,.gr-strip a,.gr-in a,.gr-pn a'); if (a) track(a.getAttribute('data-r') || 'link'); });

  /* ----- placement: fixed rails that never scroll; trim rows until they fit ----- */
  var wide = false;
  function headH() { var t = 0; [].forEach.call(document.querySelectorAll('header,.site-header,#wxs'), function (e) { var p = getComputedStyle(e).position; if (p === 'fixed' || p === 'sticky') t = Math.max(t, e.getBoundingClientRect().bottom); }); return Math.max(0, t); }
  function fit(rail, avail) {
    var boxes = [].slice.call(rail.querySelectorAll('.gr-b'));
    boxes.forEach(function (b) { b.style.display = ''; [].forEach.call(b.querySelectorAll('a.lnk,a.row,a.art'), function (a) { a.style.display = ''; }); });
    var guard = 0;
    while (rail.scrollHeight > avail && guard++ < 90) {
      var vis = boxes.filter(function (b) { return !b.hidden && b.style.display !== 'none'; }); if (!vis.length) break;
      var last = vis[vis.length - 1], rows = [].slice.call(last.querySelectorAll('a.lnk,a.row,a.art')).filter(function (a) { return a.style.display !== 'none' && !a.classList.contains('on'); });
      if (rows.length > 2) rows[rows.length - 1].style.display = 'none'; else if (vis.length > 1) last.style.display = 'none'; else if (rows.length > 1) rows[rows.length - 1].style.display = 'none'; else break;
    }
    rail.style.maxHeight = avail + 'px';
  }
  function layout() {
    var rc = main.getBoundingClientRect(); wide = rc.left >= W + 26 && (window.innerWidth - rc.right) >= W + 26;
    L.style.display = R.style.display = wide ? 'block' : 'none';
    strip.style.display = wide ? 'none' : 'flex'; inl.style.display = wide ? 'none' : 'block';
    if (wide) { L.style.left = Math.max(8, rc.left - W - 22) + 'px'; R.style.left = (rc.right + 22) + 'px'; var av = window.innerHeight - Math.max(headH() + 14, Math.min(260, rc.top + window.pageYOffset + 4)) - 18; fit(L, av); fit(R, av); }
    else { var on = strip.querySelector('.on'); if (on && !strip.__s) { strip.__s = 1; strip.scrollLeft = Math.max(0, on.offsetLeft - 16); } }
    pos();
  }
  function pos() {
    if (!wide) return;
    var rc = main.getBoundingClientRect(), base = headH() + 14;
    [L, R].forEach(function (r) { var top = Math.max(base, rc.top + 4), h = r.offsetHeight; if (rc.bottom - h < top) top = rc.bottom - h; r.style.top = Math.round(top) + 'px'; });
    if (hs.length) { var cur = -1; hs.forEach(function (h, i) { if (h.getBoundingClientRect().top < base + 90) cur = i; }); [].forEach.call(L.querySelectorAll('[data-k="out"] a'), function (a, i) { a.classList.toggle('on', i === cur); }); }
  }
  layout(); window.addEventListener('scroll', pos, { passive: true }); window.addEventListener('resize', layout); window.addEventListener('load', layout);
  function fill(k, html) { if (!html) return; [].forEach.call(document.querySelectorAll('.gr-b[data-k="' + k + '"]'), function (b) { b.lastElementChild.innerHTML = html; b.hidden = false; }); layout(); }

  /* ----- data: live list (ranked by total return) and blog ----- */
  function cg(k) { try { var v = JSON.parse(sessionStorage.getItem(k) || 'null'); return v && Date.now() - v.t < 36e5 ? v.d : null; } catch (e) { return null; } }
  function cs(k, d) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function parseCSV(t) { var rows = [], row = [], f = '', q = false; for (var i = 0; i < t.length; i++) { var c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f.trim()); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f.trim()); f = ''; if (row.length > 1) rows.push(row); row = []; } else f += c; } row.push(f.trim()); if (row.length > 1) rows.push(row); return rows; }
  function row(f, k) { var neg = /^-/.test(f[2]); return '<a class="row" href="' + fund(f[0]) + '" data-r="fund:' + esc(f[0]) + '" title="' + esc(f[1]) + '">' + (k ? '<span class="k">#' + k + '</span>' : '') + '<span class="t">$' + esc(f[0]) + '</span><span class="n">' + esc(f[1]) + '</span>' + (f[2] ? '<span class="v' + (neg ? ' neg' : '') + '">' + esc(f[2]) + '</span>' : '') + '</a>'; }
  function useFunds(F) {
    var ranked = F.filter(function (f) { return isFinite(f[3]); }).sort(function (a, b) { return b[3] - a[3]; }), i = -1;
    ranked.forEach(function (f, n) { if (f[0] === SYM) i = n; });
    fill('top', ranked.filter(function (f) { return f[0] !== SYM; }).slice(0, 4).map(function (f) { return row(f); }).join(''));
    if (i >= 0) {
      var lo = Math.max(0, Math.min(i - 3, ranked.length - 6)), near = [];
      for (var n = lo; n < Math.min(ranked.length, lo + 6); n++) if (n !== i) near.push(row(ranked[n], n + 1));
      fill('near', near.join(''));
      var p = ranked[i - 1], x = ranked[i + 1], h = '';
      h += p ? '<a href="' + fund(p[0]) + '" data-r="prev"><small>&larr; Ranked #' + i + '</small><b>$' + esc(p[0]) + '</b><span>' + esc(p[1]) + '</span></a>' : '<span></span>';
      h += x ? '<a class="nx" href="' + fund(x[0]) + '" data-r="next"><small>Ranked #' + (i + 2) + ' &rarr;</small><b>$' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></a>' : '';
      pn.innerHTML = h; pn.hidden = false;
    }
  }
  var F = cg('grFunds');
  if (F) useFunds(F); else fetch(CSV + '&t=' + Date.now()).then(function (r) { return r.text(); }).then(function (t) {
    var rows = parseCSV(t), hd = rows.shift().map(function (x) { return x.trim().toLowerCase(); }), iS = hd.indexOf('symbol'), iN = hd.indexOf('name'), iR = hd.indexOf('total returns');
    F = rows.filter(function (c) { return /^[A-Z0-9.\-]{1,8}$/i.test(c[iS] || ''); }).map(function (c) { var v = (c[iR] || '').trim(); return [c[iS].toUpperCase(), c[iN] || '', v, parseFloat(v.replace(/[^0-9.\-]/g, ''))]; });
    cs('grFunds', F); useFunds(F);
  }).catch(function () {});

  function useBlog(G) {
    var re = new RegExp('\\b' + SYM + '\\b'), mine = G.filter(function (g) { return re.test(g[0]); }), rest = G.filter(function (g) { return !re.test(g[0]); });
    fill('read', mine.concat(rest).slice(0, 3).map(function (g, n) { return '<a class="art" href="' + esc(g[1]) + '" data-r="article"><small>' + (n < mine.length ? 'About $' + SYM : 'Latest') + '</small><span>' + esc(g[0]) + '</span></a>'; }).join(''));
  }
  var G = cg('grBlog');
  if (G) useBlog(G); else fetch('/blog.html').then(function (r) { return r.text(); }).then(function (t) {
    var doc = new DOMParser().parseFromString(t, 'text/html');
    G = [].map.call(doc.querySelectorAll('a.post-card'), function (a) { var x = a.querySelector('.pc-title'); return [(x ? x.textContent : a.textContent).trim(), (a.getAttribute('href') || '').replace(/^https?:\/\/growthetfs\.com/, '')]; }).filter(function (g) { return g[0] && g[1]; });
    cs('grBlog', G); useBlog(G);
  }).catch(function () {});
})();
