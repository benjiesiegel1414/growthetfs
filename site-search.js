/* GrowthETFs.com site search
   - Adds one slim search bar under the header on every page and keeps it pinned to the top while scrolling
   - Predictive results: growth ETFs (live sheet), articles (read from /blog.html) and site pages
   Loaded with <script src="/site-search.js" defer></script>. */
(function () {
  if (window.__wxSearch) return; window.__wxSearch = true;
  var CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgB3eBiOxZ6CoBjVvi9Rm3PmJDssWCsHWuVG4YgCPnXLG02u0tQxoR055J-e21MYbXJES1UpPTy7h9/pub?gid=0&single=true&output=csv';
  var PAGES = [
    ['Top Growth ETFs', '/', 'The full ranked list of growth ETFs'],
    ['All Growth ETFs', '/all-growth-etfs.html', 'Every growth ETF with its own page'],
    ['Swipe Growth ETFs', '/swipe.html', 'Swipe through the list and save favorites'],
    ['Watchlist Builder', '/growth-etfs-watchlist-builder.html', 'Build and compare your own watchlist'],
    ['Blog', '/blog.html', 'Growth ETF comparisons and explainers'],
    ['Growth ETF Ticker Images', '/etf-images/', 'Free logo and ticker images'],
    ['Advertise', '/advertise.html', 'Sponsor GrowthETFs.com']
  ];

  var css = [
    'header{position:static!important}',
    '#wxsHold{width:100%}',
    '#wxs,#wxs *{box-sizing:border-box}',
    '#wxs{width:100%;background:#002D22;border-bottom:2px solid #c9a94e;font-family:Lato,"Segoe UI",Roboto,Arial,sans-serif;z-index:2147482000;position:relative}',
    '#wxs.pin{position:fixed;top:0;left:0;right:0;box-shadow:0 4px 14px rgba(0,0,0,.28)}',
    '.wxs-in{max-width:1100px;margin:0 auto;padding:6px 15px;display:flex;align-items:center;gap:12px}',
    '.wxs-home{flex:none;color:#fff!important;text-decoration:none!important;font-weight:900;font-size:14px;letter-spacing:.2px;white-space:nowrap;opacity:0;width:0;overflow:hidden;transition:opacity .2s}',
    '#wxs.pin .wxs-home{opacity:1;width:auto}',
    '.wxs-home i{font-style:normal;color:#c9a94e}',
    '.wxs-box{position:relative;flex:1;min-width:0;max-width:640px;margin:0 auto}',
    '.wxs-box svg{position:absolute;left:11px;top:50%;transform:translateY(-50%);width:15px;height:15px;color:#6b7c8f;pointer-events:none}',
    '#wxsQ{width:100%;height:32px;border:0;border-radius:999px;padding:0 14px 0 33px;font:inherit;font-size:14.5px;color:#002D22;background:#fff;outline:0;-webkit-appearance:none;appearance:none;margin:0}',
    '#wxsQ::placeholder{color:#7a8a99}',
    '#wxsQ:focus{box-shadow:0 0 0 3px rgba(201,169,78,.6)}',
    '.wxs-links{flex:none;display:flex;gap:14px}',
    '.wxs-links a{color:#d7e3dc!important;text-decoration:none!important;font-size:13px;font-weight:700;white-space:nowrap}',
    '.wxs-links a:hover{color:#fff!important}',
    '#wxsR{position:absolute;left:0;right:0;top:calc(100% + 7px);background:#fff;border-radius:12px;box-shadow:0 16px 44px rgba(0,30,22,.35);border:1px solid #d9e1ea;padding:6px;max-height:min(440px,70vh);overflow-y:auto;display:none;text-align:left}',
    '#wxsR.on{display:block}',
    '.wxs-h{font-size:10.5px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:#7a8a99;padding:8px 10px 3px}',
    '.wxs-o{display:flex;align-items:center;gap:10px;padding:7px 10px;border-radius:8px;text-decoration:none!important;color:#002D22!important;cursor:pointer}',
    '.wxs-o.act,.wxs-o:hover{background:#eef3ee}',
    '.wxs-t{flex:none;min-width:58px;text-align:center;background:#002D22;color:#fff;font-weight:900;font-size:12.5px;border-radius:6px;padding:4px 6px}',
    '.wxs-m{flex:1;min-width:0;line-height:1.25}',
    '.wxs-m b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wxs-m small{display:block;font-size:12px;color:#66788a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wxs-m mark{background:#ffe9a8;color:inherit;padding:0;border-radius:2px}',
    '.wxs-y{flex:none;font-size:12px;font-weight:900;color:#1e8449;background:#e8f6ee;border-radius:999px;padding:3px 8px}',
    '.wxs-n{padding:12px 10px;font-size:13.5px;color:#66788a}',
    '@media(max-width:720px){.wxs-links{display:none}.wxs-in{gap:8px;padding:6px 10px}#wxsQ{font-size:16px}.wxs-home{font-size:13px}}',
    '@media print{#wxs,#wxsHold{display:none!important}}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'wxs-css'; st.textContent = css; document.head.appendChild(st);

  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function build() {
    if (document.getElementById('wxs')) return;
    var hold = el('div'); hold.id = 'wxsHold';
    var bar = el('div'); bar.id = 'wxs'; bar.setAttribute('role', 'search');
    bar.innerHTML = '<div class="wxs-in"><a class="wxs-home" href="/" aria-label="GrowthETFs.com home">Growth<i>ETFs</i></a>' +
      '<div class="wxs-box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.3-4.3"></path></svg>' +
      '<input id="wxsQ" type="search" placeholder="Search growth ETFs, tickers and articles" autocomplete="off" spellcheck="false" aria-label="Search GrowthETFs.com" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="wxsR">' +
      '<div id="wxsR" role="listbox" aria-label="Search results"></div></div>' +
      '<nav class="wxs-links" aria-label="Quick links"><a href="/all-growth-etfs.html">All ETFs</a><a href="/swipe.html">Swipe</a><a href="/blog.html">Blog</a></nav></div>';
    hold.appendChild(bar);
    var anchor = document.querySelector('.site-network-bar') || document.querySelector('header');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(hold, anchor.nextSibling); else document.body.insertBefore(hold, document.body.firstChild);

    /* pin to the top once the page scrolls past it (works even where the page blocks position:sticky) */
    var pinned = false;
    function onScroll() {
      var should = hold.getBoundingClientRect().top <= 0;
      if (should === pinned) return; pinned = should;
      if (should) { hold.style.height = bar.offsetHeight + 'px'; bar.classList.add('pin'); }
      else { bar.classList.remove('pin'); hold.style.height = ''; }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', function () { if (pinned) hold.style.height = bar.offsetHeight + 'px'; });
    onScroll();
    wire(document.getElementById('wxsQ'), document.getElementById('wxsR'));
  }

  /* ---------- data ---------- */
  var funds = null, guides = null, loading = false, waiters = [];
  function parseCSV(t) {
    var rows = [], row = [], f = '', q = false;
    for (var i = 0; i < t.length; i++) {
      var c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f.trim()); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f.trim()); f = ''; if (row.length > 1) rows.push(row); row = []; }
      else f += c;
    }
    row.push(f.trim()); if (row.length > 1) rows.push(row);
    return rows;
  }
  function cacheGet(k) { try { var v = JSON.parse(sessionStorage.getItem(k) || 'null'); return v && Date.now() - v.t < 36e5 ? v.d : null; } catch (e) { return null; } }
  function cacheSet(k, d) { try { sessionStorage.setItem(k, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {} }
  function fromTable() {
    var out = [];
    [].forEach.call(document.querySelectorAll('#etfBody tr'), function (tr) {
      var td = tr.children; if (td.length >= 3 && /^[A-Z0-9.\-]{1,8}$/i.test(td[0].textContent.trim())) out.push([td[0].textContent.trim(), td[1].textContent.trim(), td[2].textContent.trim()]);
    });
    return out;
  }
  function load(cb) {
    if (funds && guides) return cb();
    waiters.push(cb); if (loading) return; loading = true;
    funds = cacheGet('wxsFunds'); guides = cacheGet('wxsGuides');
    var left = 2, done = function () { if (--left) return; loading = false; var w = waiters; waiters = []; w.forEach(function (x) { x(); }); };
    if (funds) done(); else {
      fetch(CSV + '&t=' + Date.now()).then(function (r) { return r.text(); }).then(function (t) {
        funds = parseCSV(t).slice(1).filter(function (c) { return /^[A-Z0-9.\-]{1,8}$/i.test(c[0] || ''); }).map(function (c) { return [c[0], c[1] || '', c[3] || '']; });
        cacheSet('wxsFunds', funds);
      }).catch(function () { funds = []; }).then(done);
    }
    if (guides) done(); else fetch('/blog.html').then(function (r) { return r.text(); }).then(function (t) {
      var doc = new DOMParser().parseFromString(t, 'text/html'), seen = {};
      guides = [].map.call(doc.querySelectorAll('a.post-card'), function (a) { var t = a.querySelector('.pc-title'); return [(t ? t.textContent : a.textContent).trim(), a.getAttribute('href')]; }).filter(function (g) { if (seen[g[1]]) return false; seen[g[1]] = 1; return true; });
      cacheSet('wxsGuides', guides);
    }).catch(function () { guides = []; }).then(done);
  }

  /* ---------- suggestions ---------- */
  function wire(q, box) {
    var opts = [], act = -1;
    function close() { box.classList.remove('on'); q.setAttribute('aria-expanded', 'false'); act = -1; }
    function hl(node, text, s) {
      var i = text.toLowerCase().indexOf(s);
      if (i < 0 || !s) { node.textContent = text; return; }
      node.appendChild(document.createTextNode(text.slice(0, i))); node.appendChild(el('mark', null, text.slice(i, i + s.length))); node.appendChild(document.createTextNode(text.slice(i + s.length)));
    }
    function opt(href, i) { var a = el('a', 'wxs-o'); a.href = href; a.id = 'wxs-o' + i; a.setAttribute('role', 'option'); a.addEventListener('mousedown', function (e) { e.preventDefault(); }); return a; }
    function render() {
      var raw = q.value.trim(), s = raw.toLowerCase().replace(/^\$/, '');
      box.innerHTML = ''; opts = []; act = -1;
      if (!s) return close();
      var words = s.split(/\s+/);
      var F = (funds || []).map(function (f) {
        var t = f[0].toLowerCase(), n = f[1].toLowerCase();
        var sc = t === s ? 100 : t.indexOf(s) === 0 ? 90 : n.split(/[^a-z0-9]+/).some(function (w) { return w.indexOf(s) === 0; }) ? 70 : t.indexOf(s) >= 0 ? 60 : words.every(function (w) { return n.indexOf(w) >= 0; }) ? 50 : 0;
        return [f, sc];
      }).filter(function (x) { return x[1]; }).sort(function (a, b) { return b[1] - a[1] || (parseFloat(b[0][2]) || 0) - (parseFloat(a[0][2]) || 0); }).slice(0, 6);
      var G = (guides || []).filter(function (g) { var t = g[0].toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); }).slice(0, 5);
      var P = PAGES.filter(function (p) { var t = (p[0] + ' ' + p[2]).toLowerCase(); return words.every(function (w) { return t.indexOf(w) >= 0; }); }).slice(0, 3);
      var n = 0;
      if (F.length) { box.appendChild(el('div', 'wxs-h', 'Growth ETFs')); F.forEach(function (x) { var f = x[0], a = opt('/etf/' + f[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '-growth-etf', n++);
        a.appendChild(el('span', 'wxs-t', '$' + f[0])); var m = el('span', 'wxs-m'), b = el('b'); hl(b, f[1] || f[0], s); m.appendChild(b); a.appendChild(m);
        if (f[2] && f[2] !== '-') a.appendChild(el('span', 'wxs-y', f[2] + ' return')); box.appendChild(a); opts.push(a); }); }
      if (G.length) { box.appendChild(el('div', 'wxs-h', 'Articles')); G.forEach(function (g) { var a = opt(g[1], n++), m = el('span', 'wxs-m'), b = el('b'); hl(b, g[0], words[0]); m.appendChild(b); a.appendChild(m); box.appendChild(a); opts.push(a); }); }
      if (P.length) { box.appendChild(el('div', 'wxs-h', 'Pages')); P.forEach(function (p) { var a = opt(p[1], n++), m = el('span', 'wxs-m'), b = el('b'); hl(b, p[0], words[0]); m.appendChild(b); m.appendChild(el('small', null, p[2])); a.appendChild(m); box.appendChild(a); opts.push(a); }); }
      if (!opts.length) box.appendChild(el('div', 'wxs-n', funds && guides ? 'No matches for "' + raw + '". Try a ticker like VUG.' : 'Searching...'));
      box.classList.add('on'); q.setAttribute('aria-expanded', 'true');
    }
    function setAct(i) { if (opts[act]) opts[act].classList.remove('act'); act = i; if (opts[act]) { opts[act].classList.add('act'); q.setAttribute('aria-activedescendant', opts[act].id); opts[act].scrollIntoView({ block: 'nearest' }); } }
    q.addEventListener('focus', function () { load(render); if (q.value.trim()) render(); });
    q.addEventListener('input', function () { render(); load(render); });
    q.addEventListener('blur', function () { setTimeout(close, 130); });
    q.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (opts.length) setAct(act + 1 >= opts.length ? 0 : act + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (opts.length) setAct(act <= 0 ? opts.length - 1 : act - 1); }
      else if (e.key === 'Enter') { var go = opts[act] || opts[0]; if (go) { e.preventDefault(); try { if (typeof gtag === 'function') gtag('event', 'site_search', { search_term: q.value.trim() }); } catch (x) {} location.href = go.href; } }
      else if (e.key === 'Escape') { close(); q.blur(); }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
