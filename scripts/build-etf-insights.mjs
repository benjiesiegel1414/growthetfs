#!/usr/bin/env node
/**
 * GrowthETFs.com: richer ETF pages + per-ETF breakdown pages.
 *
 *   /etf/<sym>-growth-etf.html   upgraded in place (the page build-growth-pages.js wrote):
 *                                key numbers, interactive performance chart vs SPY and QQQ,
 *                                trailing returns, calendar-year returns, drawdowns, risk,
 *                                52-week range, dividends, rank, FAQ. Every box links to its breakdown.
 *   /etf/<sym>/<metric>.html     one breakdown page per metric (served at the clean URL)
 *
 * Runs after build-growth-pages.js. Data: the GrowthETFs sheet + Yahoo Finance daily history
 * (adjusted close = total return with dividends reinvested). If Yahoo fails for a fund, its page
 * keeps the basic version and its old breakdown pages stay in place.
 *
 * Env: ONLY=SCHG,VUG (test a few)  YAHOO_CACHE=dir (reuse downloads)  GROWTH_ROOT=repo dir
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.GROWTH_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://growthetfs.com';
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQgB3eBiOxZ6CoBjVvi9Rm3PmJDssWCsHWuVG4YgCPnXLG02u0tQxoR055J-e21MYbXJES1UpPTy7h9/pub?gid=0&single=true&output=csv';
const ONLY = process.env.ONLY ? new Set(process.env.ONLY.split(',').map(s => s.trim().toUpperCase())) : null;
const CACHE = process.env.YAHOO_CACHE || '';
const BENCH = ['SPY', 'QQQ'];
const DAY = 864e5;

// ───────── helpers
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const ok = v => v != null && isFinite(v);
const pct = (v, d = 1) => ok(v) ? v.toFixed(d) + '%' : 'n/a';
const spct = (v, d = 1) => ok(v) ? (v >= 0 ? '+' : '') + v.toFixed(d) + '%' : 'n/a';
const money = (v, d = 2) => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const money0 = v => '$' + Math.round(v).toLocaleString('en-US');
const fd = t => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fm = t => new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const cls = v => ok(v) ? (v >= 0 ? 'pos' : 'neg') : '';
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

function parseCSV(t) { const rows = []; let row = [], f = '', q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; } else if (c === '"') q = true; else if (c === ',') { row.push(f); f = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; } else f += c; } if (f || row.length) { row.push(f); rows.push(row); } return rows; }
const num = s => { const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(n) ? null : n; };
const aum = s => { const u = String(s || '').toUpperCase(), n = num(u); if (n == null) return null; return u.includes('B') ? n * 1000 : u.includes('K') ? n / 1000 : n; };

async function get(url) { for (let i = 0; i < 3; i++) { try { const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GrowthETFs/1.0)' } }); if (r.ok) return await r.text(); } catch {} await new Promise(r => setTimeout(r, 1500 * (i + 1))); } return null; }

async function yahoo(sym) {
  const cf = CACHE && path.join(CACHE, sym + '.json');
  let txt = cf && fs.existsSync(cf) ? fs.readFileSync(cf, 'utf8') : null;
  if (!txt) { txt = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?period1=0&period2=9999999999&interval=1d&events=div%7Csplit&includeAdjustedClose=true`); if (txt && cf) fs.writeFileSync(cf, txt); }
  if (!txt) return null;
  try {
    const r = JSON.parse(txt).chart.result[0], q = r.indicators.quote[0], adj = r.indicators.adjclose?.[0]?.adjclose || [];
    const pts = [];
    r.timestamp.forEach((ts, i) => { const c = q.close[i], a = adj[i]; if (ok(c) && ok(a) && c > 0 && a > 0) pts.push({ t: ts * 1000, c, a }); });
    if (pts.length < 30) return null;
    const divs = Object.values(r.events?.dividends || {}).map(d => ({ t: d.date * 1000, v: d.amount })).sort((x, y) => x.t - y.t);
    return { pts, divs, meta: r.meta };
  } catch { return null; }
}

// ───────── metrics
function at(pts, t) { let lo = 0, hi = pts.length - 1; if (t <= pts[0].t) return pts[0]; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m].t <= t) lo = m; else hi = m - 1; } return pts[lo]; }
function ret(pts, from, k = 'a') { const s = at(pts, from), e = pts[pts.length - 1]; if (s.t > from + 10 * DAY && from > pts[0].t) return null; if (from < pts[0].t - 5 * DAY) return null; return (e[k] / s[k] - 1) * 100; }
function ann(pts, years) { const end = pts[pts.length - 1].t, from = end - years * 365.25 * DAY; if (from < pts[0].t - 5 * DAY) return null; const r = ret(pts, from); return ok(r) ? (Math.pow(1 + r / 100, 1 / years) - 1) * 100 : null; }
function metrics(y) {
  const p = y.pts, last = p[p.length - 1], end = last.t, first = p[0];
  const yearStart = Date.UTC(new Date(end).getUTCFullYear(), 0, 1) - DAY;
  const years = (end - first.t) / (365.25 * DAY);
  const r = {
    last, first, years,
    r1m: ret(p, end - 30.4 * DAY), r3m: ret(p, end - 91.3 * DAY), r6m: ret(p, end - 182.6 * DAY), ytd: ret(p, yearStart), r1y: ret(p, end - 365.25 * DAY),
    a3: ann(p, 3), a5: ann(p, 5), a10: ann(p, 10),
    cum: (last.a / first.a - 1) * 100, cumPrice: (last.c / first.c - 1) * 100,
    cagr: (Math.pow(last.a / first.a, 1 / years) - 1) * 100,
  };
  // drawdowns
  let peak = p[0], mdd = 0, mddPeak = p[0], mddTrough = p[0], cur = peak; const dd = [];
  for (const x of p) { if (x.a > peak.a) peak = x; const d = (x.a / peak.a - 1) * 100; if (d < mdd) { mdd = d; mddPeak = peak; mddTrough = x; } dd.push(d); }
  let rec = null; for (let i = p.indexOf(mddTrough); i < p.length; i++) if (p[i].a >= mddPeak.a) { rec = p[i]; break; }
  r.mdd = mdd; r.mddPeak = mddPeak; r.mddTrough = mddTrough; r.mddRec = rec; r.curDD = dd[dd.length - 1]; r.ath = peak;
  // 52 week
  const w = p.filter(x => x.t >= end - 365.25 * DAY); r.hi52 = w.reduce((m, x) => x.c > m.c ? x : m, w[0]); r.lo52 = w.reduce((m, x) => x.c < m.c ? x : m, w[0]);
  r.pos52 = (last.c - r.lo52.c) / ((r.hi52.c - r.lo52.c) || 1) * 100;
  // volatility (1y, 3y) from daily log returns
  const vol = days => { const s = p.filter(x => x.t >= end - days * DAY); const lr = []; for (let i = 1; i < s.length; i++) lr.push(Math.log(s[i].a / s[i - 1].a)); if (lr.length < 50) return null; const m = lr.reduce((a, b) => a + b, 0) / lr.length; return Math.sqrt(lr.reduce((a, b) => a + (b - m) ** 2, 0) / (lr.length - 1) * 252) * 100; };
  r.vol1 = vol(365); r.vol3 = vol(3 * 365);
  // calendar-year returns
  const yrs = {}; const y0 = new Date(first.t).getUTCFullYear(), y1 = new Date(end).getUTCFullYear();
  for (let yy = y0; yy <= y1; yy++) { const s = yy === y0 ? first : at(p, Date.UTC(yy, 0, 1) - DAY), e = yy === y1 ? last : at(p, Date.UTC(yy + 1, 0, 1) - DAY); if (s && e && e.t > s.t) yrs[yy] = { v: (e.a / s.a - 1) * 100, partial: yy === y0 || yy === y1 }; }
  r.years_ = yrs;
  const full = Object.entries(yrs).filter(([, v]) => !v.partial);
  r.best = full.reduce((m, x) => !m || x[1].v > m[1].v ? x : m, null); r.worst = full.reduce((m, x) => !m || x[1].v < m[1].v ? x : m, null);
  r.upYears = full.filter(x => x[1].v > 0).length; r.fullYears = full.length;
  // dividends
  const d12 = y.divs.filter(d => d.t >= end - 365.25 * DAY); r.ttmDiv = d12.reduce((a, d) => a + d.v, 0); r.yield = r.ttmDiv / last.c * 100; r.divCount = d12.length; r.lastDiv = y.divs[y.divs.length - 1] || null;
  r.freq = d12.length >= 11 ? 'Monthly' : d12.length >= 4 ? 'Quarterly' : d12.length >= 2 ? 'Semiannual' : d12.length === 1 ? 'Annual' : 'None';
  return r;
}
function beta(p, b, days = 3 * 365) {
  const end = p[p.length - 1].t, mp = new Map(b.map(x => [Math.round(x.t / DAY), x.a])); const xs = [], ys = [];
  const s = p.filter(x => x.t >= end - days * DAY);
  for (let i = 1; i < s.length; i++) { const b0 = mp.get(Math.round(s[i - 1].t / DAY)), b1 = mp.get(Math.round(s[i].t / DAY)); if (b0 && b1) { ys.push(s[i].a / s[i - 1].a - 1); xs.push(b1 / b0 - 1); } }
  if (xs.length < 100) return null; const mx = xs.reduce((a, c) => a + c, 0) / xs.length, my = ys.reduce((a, c) => a + c, 0) / ys.length;
  let cov = 0, vx = 0, vy = 0; xs.forEach((x, i) => { cov += (x - mx) * (ys[i] - my); vx += (x - mx) ** 2; vy += (ys[i] - my) ** 2; });
  return { beta: cov / vx, corr: cov / Math.sqrt(vx * vy) };
}
// weekly series for charts: [daysSinceEpoch, adj, close]
function weekly(p) { const out = [p[0]]; let lastW = Math.floor(p[0].t / (7 * DAY)) + 0.5; for (const x of p.slice(1)) { const w = Math.floor(x.t / (7 * DAY)); if (w !== lastW) { out.push(x); lastW = w; } else out[out.length - 1] = x; } return out.map(x => [Math.round(x.t / DAY), +x.a.toPrecision(6), +x.c.toPrecision(6)]); }

// ───────── page pieces
const METRICS = [
  ['total-return', 'Total Return', '📈'], ['growth-of-10k', 'Growth of $10,000', '🌱'], ['vs-spy', 'vs S&P 500 (SPY)', '⚔️'], ['vs-qqq', 'vs Nasdaq-100 (QQQ)', '⚔️'],
  ['calendar-returns', 'Calendar-Year Returns', '🗓️'], ['drawdown', 'Max Drawdown', '📉'], ['risk', 'Volatility & Beta', '🎢'], ['52-week-range', '52-Week Range', '📏'],
  ['dividends', 'Dividends & Yield', '💵'], ['rank', 'Rank vs Growth ETFs', '🏆'],
];
const L = Object.fromEntries(METRICS.map(([k, t]) => [k, t]));
const url = (sym, m) => m ? `/etf/${sym.toLowerCase()}/${m}` : `/etf/${sym.toLowerCase()}-growth-etf`;

const CSS = `
.gx{--g:#002D22;--g2:#003d2e;--gold:#c9a94e;--pos:#16a34a;--neg:#dc2626;--line:#e3e8e1;--mut:#5f6b66;--bg:#f2f4f0}
.gx *{box-sizing:border-box}
.gx .card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:20px;margin:0 0 16px}
.gx h2{font-size:1.25rem;color:var(--g);margin:0 0 4px;font-weight:900}
.gx .sub{color:var(--mut);font-size:.88rem;margin:0 0 14px}
.gx .pos{color:var(--pos)!important}.gx .neg{color:var(--neg)!important}
.gx-hero{background:linear-gradient(135deg,#002D22,#00513c 70%,#0b6b50);color:#fff;border-radius:18px;padding:22px 24px;margin:6px 0 16px;display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:center;box-shadow:0 10px 30px rgba(0,45,34,.2)}
.gx-hero .tk{display:flex;align-items:center;gap:12px}
.gx-hero .sym{font-size:2.4rem;font-weight:900;letter-spacing:-.02em;line-height:1}
.gx-hero .nm{font-size:1rem;opacity:.9;margin-top:4px}
.gx-hero .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.gx-hero .chips span{font-size:.72rem;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:4px 9px;border-radius:999px;background:rgba(255,255,255,.12)}
.gx-hero .chips span.gold{background:var(--gold);color:#1f1600}
.gx-hero .px{text-align:right}
.gx-hero .px b{font-size:2.3rem;font-weight:900;display:block;line-height:1}
.gx-hero .px small{opacity:.8;font-size:.78rem}
.gx-hero .px .chg{display:inline-block;margin-top:6px;font-weight:800;padding:4px 10px;border-radius:8px;background:rgba(255,255,255,.12)}
.gx-hero .mini{grid-column:1/-1;display:grid;grid-template-columns:repeat(5,1fr);gap:8px}
.gx-hero .mini a{display:block;text-decoration:none;color:#fff;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:10px;text-align:center;transition:.15s}
.gx-hero .mini a:hover{background:rgba(255,255,255,.16)}
.gx-hero .mini b{display:block;font-size:1.15rem;font-weight:900}
.gx-hero .mini b.pos{color:#7ff0b0!important}.gx-hero .mini b.neg{color:#ffaaa5!important}
.gx-hero .mini small{font-size:.68rem;opacity:.8;text-transform:uppercase;letter-spacing:.6px;font-weight:700}
.kn{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kn a{display:flex;flex-direction:column;gap:2px;text-decoration:none;color:#222;background:#f7f9f6;border:1px solid var(--line);border-radius:12px;padding:14px;transition:.15s;position:relative}
.kn a:hover{border-color:var(--g);background:#fff;box-shadow:0 6px 18px rgba(0,45,34,.08);transform:translateY(-2px)}
.kn a::after{content:"→";position:absolute;right:12px;top:12px;color:var(--gold);font-weight:900}
.kn small{font-size:.7rem;color:var(--mut);font-weight:800;text-transform:uppercase;letter-spacing:.5px}
.kn b{font-size:1.35rem;font-weight:900;color:var(--g)}
.kn span{font-size:.76rem;color:var(--mut)}
.chart-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px}
.rng{display:flex;gap:4px;flex-wrap:wrap}
.rng button,.cmp label{font-family:inherit;font-size:.78rem;font-weight:800;border:1px solid var(--line);background:#fff;color:#444;border-radius:8px;padding:6px 10px;cursor:pointer}
.rng button.on{background:var(--g);color:#fff;border-color:var(--g)}
.cmp{display:flex;gap:6px;flex-wrap:wrap}
.cmp label{display:inline-flex;align-items:center;gap:6px}
.cmp i{width:12px;height:3px;border-radius:2px;display:inline-block}
.gchart{position:relative;width:100%;height:300px}
.gchart svg{width:100%;height:100%;display:block}
.gtip{position:absolute;pointer-events:none;background:#002D22;color:#fff;font-size:.76rem;padding:8px 10px;border-radius:8px;white-space:nowrap;display:none;box-shadow:0 6px 16px rgba(0,0,0,.2);z-index:3}
.legend-v{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:.86rem}
.legend-v b{font-weight:900}
.tbl{width:100%;border-collapse:collapse;font-size:.92rem}
.tbl th,.tbl td{padding:10px 8px;border-bottom:1px solid var(--line);text-align:right}
.tbl th:first-child,.tbl td:first-child{text-align:left}
.tbl th{font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--mut)}
.tbl tr.me td{background:#f4faf6;font-weight:800}
.tbl-wrap{overflow-x:auto}
.cy{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:6px}
.cy div{border-radius:10px;padding:10px 4px;text-align:center;font-weight:900;font-size:.9rem}
.cy div small{display:block;font-size:.68rem;font-weight:700;opacity:.75}
.r52{position:relative;height:12px;border-radius:999px;background:linear-gradient(90deg,#fecaca,#fde68a,#bbf7d0);margin:18px 0 8px}
.r52 i{position:absolute;top:-6px;width:4px;height:24px;background:var(--g);border-radius:2px}
.r52-l{display:flex;justify-content:space-between;font-size:.8rem;color:var(--mut)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.rel{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px}
.rel a{display:block;text-decoration:none;color:#222;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff;transition:.15s}
.rel a:hover{border-color:var(--g);transform:translateY(-2px)}
.rel b{display:block;font-size:1rem;color:var(--g)}
.rel small{font-size:.76rem;color:var(--mut)}
.bd{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.bd a{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--g);font-weight:800;font-size:.88rem;border:1px solid var(--line);border-radius:12px;padding:12px;background:#fff}
.bd a:hover{border-color:var(--gold);background:#fffdf5}
.faq details{border-bottom:1px solid var(--line);padding:12px 0}
.faq summary{font-weight:800;cursor:pointer;color:var(--g)}
.faq p{margin:8px 0 0;color:#444;line-height:1.6;font-size:.94rem}
.note{font-size:.76rem;color:var(--mut);margin-top:10px;line-height:1.5}
.bigstat{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.bigstat b{font-size:2.6rem;font-weight:900;color:var(--g);line-height:1}
.prose p{line-height:1.7;color:#333;margin:0 0 12px}
@media(max-width:820px){.gx-hero{grid-template-columns:1fr}.gx-hero .px{text-align:left}.gx-hero .mini{grid-template-columns:repeat(3,1fr)}.kn{grid-template-columns:repeat(2,1fr)}.two{grid-template-columns:1fr}.gchart{height:240px}}
@media(max-width:480px){.gx-hero .mini{grid-template-columns:repeat(2,1fr)}.gx-hero .sym{font-size:2rem}.gx .card{padding:16px}}
`;

const CHART_JS = `(function(){document.querySelectorAll('.gchart').forEach(function(box){
var D=JSON.parse(box.dataset.series),names=JSON.parse(box.dataset.names),cols=['#002D22','#c9a94e','#7c8bff'];var sel=box.dataset.range||'max',show={};names.forEach(function(n,i){show[n]=true});
var svgNS='http://www.w3.org/2000/svg',svg=document.createElementNS(svgNS,'svg'),tip=document.createElement('div');tip.className='gtip';box.appendChild(svg);box.appendChild(tip);
var card=box.closest('.card');var rb=card.querySelectorAll('.rng button');rb.forEach(function(b){b.onclick=function(){rb.forEach(function(x){x.classList.toggle('on',x===b)});sel=b.dataset.r;draw()}});
card.querySelectorAll('.cmp input').forEach(function(c){c.onchange=function(){show[c.value]=c.checked;draw()}});
var leg=card.querySelector('.legend-v');
function from(){var last=D[0][D[0].length-1][0];var y=new Date(last*864e5).getUTCFullYear();return sel==='max'?0:sel==='ytd'?Date.UTC(y,0,1)/864e5:last-{'1m':30,'6m':182,'1y':365,'3y':1096,'5y':1826,'10y':3652}[sel]}
function draw(){var W=box.clientWidth,H=box.clientHeight,pl=48,pr=10,pt=10,pb=24;svg.setAttribute('viewBox','0 0 '+W+' '+H);svg.innerHTML='';
var f=from();var start=Math.max(f,D[0][0][0]);var S=[];D.forEach(function(s,i){if(!show[names[i]])return;var pts=s.filter(function(p){return p[0]>=start});if(pts.length<2)return;var b=pts[0][1];S.push({i:i,n:names[i],p:pts.map(function(p){return[p[0],(p[1]/b-1)*100]})})});
if(!S.length)return;var x0=start,x1=D[0][D[0].length-1][0],ys=[];S.forEach(function(s){s.p.forEach(function(p){ys.push(p[1])})});var y0=Math.min.apply(0,ys),y1=Math.max.apply(0,ys);var pad=(y1-y0)*.06||1;y0-=pad;y1+=pad;
var X=function(v){return pl+(v-x0)/(x1-x0||1)*(W-pl-pr)},Y=function(v){return pt+(1-(v-y0)/(y1-y0))*(H-pt-pb)};
for(var k=0;k<=4;k++){var v=y0+(y1-y0)*k/4,y=Y(v);var l=document.createElementNS(svgNS,'line');l.setAttribute('x1',pl);l.setAttribute('x2',W-pr);l.setAttribute('y1',y);l.setAttribute('y2',y);l.setAttribute('stroke','#e8ece6');svg.appendChild(l);var t=document.createElementNS(svgNS,'text');t.setAttribute('x',pl-6);t.setAttribute('y',y+4);t.setAttribute('text-anchor','end');t.setAttribute('font-size','10');t.setAttribute('fill','#7a8580');t.textContent=(v>=0?'+':'')+(Math.abs(v)>=1000?Math.round(v/100)/10+'k':Math.round(v))+'%';svg.appendChild(t)}
var z=document.createElementNS(svgNS,'line');z.setAttribute('x1',pl);z.setAttribute('x2',W-pr);z.setAttribute('y1',Y(0));z.setAttribute('y2',Y(0));z.setAttribute('stroke','#9aa59f');z.setAttribute('stroke-dasharray','3 3');svg.appendChild(z);
[0,.5,1].forEach(function(q){var v=x0+(x1-x0)*q,t=document.createElementNS(svgNS,'text');t.setAttribute('x',X(v));t.setAttribute('y',H-6);t.setAttribute('font-size','10');t.setAttribute('fill','#7a8580');t.setAttribute('text-anchor',q===0?'start':q===1?'end':'middle');t.textContent=new Date(v*864e5).toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'});svg.appendChild(t)});
S.slice().reverse().forEach(function(s){var d='';s.p.forEach(function(p,j){d+=(j?'L':'M')+X(p[0]).toFixed(1)+' '+Y(p[1]).toFixed(1)});var pa=document.createElementNS(svgNS,'path');pa.setAttribute('d',d);pa.setAttribute('fill','none');pa.setAttribute('stroke',cols[s.i]);pa.setAttribute('stroke-width',s.i===0?2.4:1.6);pa.setAttribute('stroke-linejoin','round');svg.appendChild(pa)});
if(leg)leg.innerHTML=S.map(function(s){var v=s.p[s.p.length-1][1];return'<span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+cols[s.i]+';margin-right:6px"></i>'+s.n+' <b class="'+(v>=0?'pos':'neg')+'">'+(v>=0?'+':'')+v.toFixed(1)+'%</b></span>'}).join('');
var vl=document.createElementNS(svgNS,'line');vl.setAttribute('stroke','#002D22');vl.setAttribute('stroke-width','1');vl.style.display='none';svg.appendChild(vl);
svg.onmousemove=svg.ontouchmove=function(e){var r=svg.getBoundingClientRect(),cx=(e.touches?e.touches[0].clientX:e.clientX)-r.left;var xv=x0+(cx-pl)/(W-pl-pr)*(x1-x0);var html='',best=S[0].p.reduce(function(m,p){return Math.abs(p[0]-xv)<Math.abs(m[0]-xv)?p:m});html='<b>'+new Date(best[0]*864e5).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'})+'</b>';S.forEach(function(s){var p=s.p.reduce(function(m,q){return Math.abs(q[0]-xv)<Math.abs(m[0]-xv)?q:m});html+='<br>'+s.n+': '+(p[1]>=0?'+':'')+p[1].toFixed(1)+'%'});tip.innerHTML=html;tip.style.display='block';var tx=Math.min(Math.max(cx+12,0),W-150);tip.style.left=tx+'px';tip.style.top='8px';vl.setAttribute('x1',X(best[0]));vl.setAttribute('x2',X(best[0]));vl.setAttribute('y1',pt);vl.setAttribute('y2',H-pb);vl.style.display=''};
svg.onmouseleave=function(){tip.style.display='none';vl.style.display='none'}}
draw();window.addEventListener('resize',draw)})})();`;

function chartCard({ title, sub, series, names, range = 'max', id }) {
  const btns = [['1m', '1M'], ['6m', '6M'], ['ytd', 'YTD'], ['1y', '1Y'], ['3y', '3Y'], ['5y', '5Y'], ['10y', '10Y'], ['max', 'Max']].map(([k, t]) => `<button type="button" data-r="${k}"${k === range ? ' class="on"' : ''}>${t}</button>`).join('');
  const cmp = names.slice(1).map((n, i) => `<label><input type="checkbox" value="${n}" checked><i style="background:${['#c9a94e', '#7c8bff'][i]}"></i>${n}</label>`).join('');
  return `<div class="card" id="${id || 'perf'}"><h2>${title}</h2><p class="sub">${sub}</p><div class="chart-top"><div class="rng">${btns}</div><div class="cmp">${cmp}</div></div>
<div class="gchart" data-range="${range}" data-names='${esc(JSON.stringify(names))}' data-series='${JSON.stringify(series)}'></div><div class="legend-v"></div>
<p class="note">Total return with dividends reinvested, from daily closing prices. Hover or tap the chart for exact values.</p></div>`;
}

function ddSVG(p) {
  const W = 760, H = 150; let peak = 0; const pts = []; const w = weekly(p);
  w.forEach(([d, a]) => { if (a > peak) peak = a; pts.push([d, (a / peak - 1) * 100]); });
  const x0 = pts[0][0], x1 = pts[pts.length - 1][0], mn = Math.min(...pts.map(q => q[1])) * 1.05 || -1;
  const X = v => (v - x0) / (x1 - x0) * W, Y = v => v / mn * (H - 4);
  const d = 'M0 0 ' + pts.map(q => 'L' + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1)).join(' ') + ` L${W} 0 Z`;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:150px;display:block;background:#fff"><path d="${d}" fill="rgba(220,38,38,.18)" stroke="#dc2626" stroke-width="1.2"/></svg>`;
}

function cyGrid(m, bm) {
  return `<div class="cy">${Object.entries(m.years_).reverse().map(([y, v]) => { const a = Math.min(Math.abs(v.v) / 40, 1); const bg = v.v >= 0 ? `rgba(22,163,74,${0.12 + a * 0.5})` : `rgba(220,38,38,${0.12 + a * 0.5})`; return `<div style="background:${bg}" title="${y}${v.partial ? ' (partial year)' : ''}"><small>${y}${v.partial ? '*' : ''}</small>${spct(v.v, 1)}</div>`; }).join('')}</div><p class="note">* Partial year (fund launch year or year to date).</p>`;
}

// ───────── build one fund
function buildFund(f, Y, B, list) {
  const sym = f.sym, m = metrics(Y), bm = Object.fromEntries(BENCH.map(b => [b, B[b] ? metrics(B[b]) : null]));
  const bt = B.SPY ? beta(Y.pts, B.SPY.pts) : null;
  const start = m.first.t;
  const series = [weekly(Y.pts)].concat(BENCH.map(b => weekly(B[b].pts.filter(x => x.t >= start - 7 * DAY))));
  const names = [sym, ...BENCH];
  const rankTR = list.slice().filter(x => ok(x.tr)).sort((a, b) => b.tr - a.tr).findIndex(x => x.sym === sym) + 1;
  const rankAUM = list.slice().filter(x => ok(x.aum)).sort((a, b) => b.aum - a.aum).findIndex(x => x.sym === sym) + 1;
  const n = list.length;
  const g10 = 10000 * (1 + m.cum / 100);
  const g10b = Object.fromEntries(BENCH.map(b => { const bp = B[b].pts; const s = at(bp, start); return [b, 10000 * bp[bp.length - 1].a / s.a]; }));
  const trail = [['1 month', 'r1m'], ['3 months', 'r3m'], ['6 months', 'r6m'], ['Year to date', 'ytd'], ['1 year', 'r1y'], ['3 yr (annual)', 'a3'], ['5 yr (annual)', 'a5'], ['10 yr (annual)', 'a10']];
  const bTrail = b => { const bp = B[b].pts, mm = bm[b]; return mm; };
  const pp = Y.pts, chg = pp.length > 1 ? (pp[pp.length - 1].c / pp[pp.length - 2].c - 1) * 100 : null;
  const asOf = fd(m.last.t);
  const sinceTxt = fm(start);
  const peers = list.filter(x => x.sym !== sym && ok(x.tr)).sort((a, b) => Math.abs(a.aum - f.aum) - Math.abs(b.aum - f.aum)).slice(0, 8);
  const bcagr = {}, bmdd = {};
  for (const b of BENCH) { const bp = B[b].pts.filter(x => x.t >= start - 3 * DAY), s0 = bp[0], e = bp[bp.length - 1]; bcagr[b] = (Math.pow(e.a / s0.a, 1 / ((e.t - s0.t) / (365.25 * DAY))) - 1) * 100; let pk = s0.a, md = 0; for (const x of bp) { if (x.a > pk) pk = x.a; md = Math.min(md, (x.a / pk - 1) * 100); } bmdd[b] = md; }
  const eps = []; { const p = Y.pts; let pk = p[0], tr = p[0], inDD = false; for (const x of p) { if (x.a >= pk.a) { if (inDD && (tr.a / pk.a - 1) * 100 < -5) eps.push({ p: pk.t, t: tr.t, d: (tr.a / pk.a - 1) * 100, r: x.t }); pk = x; tr = x; inDD = false; } else { inDD = true; if (x.a < tr.a) tr = x; } } if (inDD && (tr.a / pk.a - 1) * 100 < -5) eps.push({ p: pk.t, t: tr.t, d: (tr.a / pk.a - 1) * 100, r: null }); eps.sort((a, b) => a.d - b.d); }
  const yr = Y.pts.filter(x => x.t >= m.last.t - 365.25 * DAY); let bestDay = -1e9, worstDay = 1e9; for (let i = 1; i < yr.length; i++) { const r = (yr[i].a / yr[i - 1].a - 1) * 100; bestDay = Math.max(bestDay, r); worstDay = Math.min(worstDay, r); }
  return { sym, m, bm, bt, series, names, rankTR, rankAUM, n, g10, g10b, trail, chg, asOf, sinceTxt, peers, f, bcagr, bmdd, episodes: eps, bestDay, worstDay, list };
}

function mainContent(D) {
  const { sym, m, bm, bt, f } = D;
  const kn = [
    ['total-return', 'Total return (since launch)', spct(m.cum, 0), `${pct(m.cagr)} a year since ${D.sinceTxt}`],
    ['growth-of-10k', 'Growth of $10,000', money0(D.g10), `invested at launch, ${D.sinceTxt}`],
    ['vs-spy', 'vs S&P 500 (1 yr)', spct(m.r1y - D.bm.SPY.r1y, 1), `SPY ${spct(D.bm.SPY.r1y)} over the same year`],
    ['vs-qqq', 'vs Nasdaq-100 (1 yr)', spct(m.r1y - D.bm.QQQ.r1y, 1), `QQQ ${spct(D.bm.QQQ.r1y)} over the same year`],
    ['drawdown', 'Max drawdown', pct(m.mdd), `${fm(m.mddPeak.t)} to ${fm(m.mddTrough.t)}`],
    ['risk', 'Volatility (1 yr)', pct(m.vol1), bt ? `beta ${bt.beta.toFixed(2)} vs the S&P 500` : 'annualized'],
    ['52-week-range', '52-week position', pct(m.pos52, 0), `${money(m.lo52.c)} to ${money(m.hi52.c)}`],
    ['rank', 'Rank by total return', `#${D.rankTR} of ${D.n}`, `#${D.rankAUM} by fund size`],
  ];
  const trRows = D.trail.map(([lab, k]) => `<tr><td>${lab}</td><td class="${cls(m[k])}"><b>${spct(m[k])}</b></td>${BENCH.map(b => `<td class="${cls(bm[b][k])}">${spct(bm[b][k])}</td>`).join('')}</tr>`).join('');
  const faq = [
    [`What is the ${sym} ETF?`, `${sym} is the ${esc(f.name)}. It is one of ${D.n} growth ETFs tracked on GrowthETFs.com, with about ${esc(f.aumTxt)} in assets.`],
    [`What is ${sym}'s total return?`, `Since its first trading day in ${D.sinceTxt}, ${sym} has returned ${spct(m.cum, 0)} with dividends reinvested, about ${pct(m.cagr)} a year. Over the last 12 months it returned ${spct(m.r1y)}.`],
    [`Has ${sym} beaten the S&P 500?`, `Over the last year ${sym} returned ${spct(m.r1y)} versus ${spct(bm.SPY.r1y)} for SPY. ${ok(m.a5) && ok(bm.SPY.a5) ? `Over 5 years it averaged ${pct(m.a5)} a year versus ${pct(bm.SPY.a5)} for SPY.` : ''}`],
    [`How much would $10,000 in ${sym} be worth today?`, `$10,000 invested in ${sym} at launch (${D.sinceTxt}) would be worth about ${money0(D.g10)} today with dividends reinvested, versus ${money0(D.g10b.SPY)} in SPY over the same period.`],
    [`What was ${sym}'s worst drawdown?`, `${sym}'s largest drop from a high was ${pct(m.mdd)}, from ${fd(m.mddPeak.t)} to ${fd(m.mddTrough.t)}. ${m.mddRec ? `It got back to its old high by ${fd(m.mddRec.t)}.` : 'It has not yet fully recovered that high.'}`],
    [`Does ${sym} pay a dividend?`, m.ttmDiv > 0 ? `Yes, small. ${sym} paid ${money(m.ttmDiv, 4).replace(/0+$/, '')} per share over the last 12 months, about a ${pct(m.yield, 2)} yield, paid ${m.freq.toLowerCase()}. Growth ETFs reinvest most of their return into price gains rather than paying it out.` : `${sym} has not paid a dividend in the last 12 months. Like most growth ETFs, its return comes almost entirely from price gains.`],
  ];
  return `
<section class="gx-hero">
  <div><div class="tk"><img src="/etf-images/${sym.toLowerCase()}.png" alt="" width="54" height="54" style="border-radius:12px;background:#fff" onerror="this.remove()"><div><div class="sym">${sym}</div><div class="nm">${esc(f.name)}</div></div></div>
  <div class="chips"><span class="gold">#${D.rankTR} of ${D.n} by total return</span><span>${esc(f.aumTxt)} AUM</span><span>Since ${D.sinceTxt}</span>${m.ttmDiv > 0 ? `<span>${pct(m.yield, 2)} yield</span>` : ''}</div></div>
  <div class="px"><b data-live-price="${sym}">${money(m.last.c)}</b>${ok(D.chg) ? `<span class="chg">${spct(D.chg, 2)} last session</span>` : ''}<br><small>Close as of ${D.asOf}. Delayed quote.</small></div>
  <div class="mini">
    <a href="${url(sym, 'total-return')}"><b class="${cls(m.ytd)}">${spct(m.ytd)}</b><small>YTD</small></a>
    <a href="${url(sym, 'total-return')}"><b class="${cls(m.r1y)}">${spct(m.r1y)}</b><small>1 Year</small></a>
    <a href="${url(sym, 'total-return')}"><b class="${cls(m.a5)}">${ok(m.a5) ? pct(m.a5) : 'n/a'}</b><small>5Y / yr</small></a>
    <a href="${url(sym, 'growth-of-10k')}"><b>${money0(D.g10)}</b><small>$10k at launch</small></a>
    <a href="${url(sym, 'drawdown')}"><b class="neg">${pct(m.mdd, 0)}</b><small>Max drawdown</small></a>
  </div>
</section>

<div class="card"><h2>${sym} key numbers</h2><p class="sub">Tap any box for the full breakdown.</p><div class="kn">${kn.map(([k, l, v, s]) => `<a href="${url(sym, k)}"><small>${l}</small><b class="${/^[+-]/.test(v) ? (v[0] === '+' ? 'pos' : 'neg') : ''}">${v}</b><span>${s}</span></a>`).join('')}</div></div>

${chartCard({ title: `${sym} performance vs SPY and QQQ`, sub: `Growth of every dollar since ${D.sinceTxt}, dividends reinvested.`, series: D.series, names: D.names, range: 'max' })}

<div class="card"><h2>Trailing returns</h2><p class="sub">Total return including dividends, as of ${D.asOf}.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Period</th><th>${sym}</th>${BENCH.map(b => `<th>${b}</th>`).join('')}</tr></thead><tbody>${trRows}</tbody></table></div><p class="note"><a href="${url(sym, 'vs-spy')}">Full ${sym} vs SPY breakdown →</a> &nbsp; <a href="${url(sym, 'vs-qqq')}">${sym} vs QQQ →</a></p></div>

<div class="card"><h2>Calendar-year returns</h2><p class="sub">${m.upYears} of ${m.fullYears} full years were positive. Best: ${m.best ? `${m.best[0]} (${spct(m.best[1].v)})` : 'n/a'}. Worst: ${m.worst ? `${m.worst[0]} (${spct(m.worst[1].v)})` : 'n/a'}.</p>${cyGrid(m)}<p class="note"><a href="${url(sym, 'calendar-returns')}">Year-by-year vs SPY and QQQ →</a></p></div>

<div class="two">
<div class="card"><h2>Drawdowns</h2><p class="sub">How far ${sym} fell from each high. Worst: ${pct(m.mdd)} (${fm(m.mddPeak.t)} to ${fm(m.mddTrough.t)}). Today: ${pct(m.curDD)} from its high.</p>${ddSVG(D.f.Y.pts)}<p class="note"><a href="${url(sym, 'drawdown')}">Drawdown breakdown →</a></p></div>
<div class="card"><h2>52-week range</h2><p class="sub">${sym} is ${pct(m.pos52, 0)} of the way from its 52-week low to its high.</p><div class="r52"><i style="left:calc(${Math.min(Math.max(m.pos52, 0), 100).toFixed(1)}% - 2px)"></i></div><div class="r52-l"><span>Low ${money(m.lo52.c)}<br>${fd(m.lo52.t)}</span><span style="text-align:right">High ${money(m.hi52.c)}<br>${fd(m.hi52.t)}</span></div>
<div class="kn" style="grid-template-columns:1fr 1fr;margin-top:14px"><a href="${url(sym, 'risk')}"><small>Volatility 1Y / 3Y</small><b>${pct(m.vol1, 0)} / ${pct(m.vol3, 0)}</b><span>annualized</span></a><a href="${url(sym, 'dividends')}"><small>Dividend yield</small><b>${pct(m.yield, 2)}</b><span>${m.freq} payer</span></a></div></div>
</div>

<div class="card"><h2>Explore ${sym}</h2><p class="sub">Every number on this page has its own deep dive.</p><div class="bd">${METRICS.map(([k, t, ic]) => `<a href="${url(sym, k)}">${ic} ${sym} ${t}</a>`).join('')}</div></div>

<div class="card"><h2>Similar-size growth ETFs</h2><p class="sub">Compare ${sym} with funds of a similar size on our list.</p><div class="rel">${D.peers.map(p => `<a href="${url(p.sym)}"><b>${p.sym}</b><small>${esc(p.aumTxt)} AUM</small></a>`).join('')}</div></div>

<div class="card faq"><h2>${sym} FAQ</h2>${faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
<p class="note">Data: GrowthETFs.com list and Yahoo Finance daily prices as of ${D.asOf}. Total return assumes dividends are reinvested. Past performance does not guarantee future results. Not financial advice.</p>`;
}

function breakdownContent(D, key) {
  const { sym, m, bm } = D;
  const nav = `<div class="card"><h2>More ${sym} breakdowns</h2><div class="bd">${METRICS.filter(([k]) => k !== key).map(([k, t, ic]) => `<a href="${url(sym, k)}">${ic} ${t}</a>`).join('')}<a href="${url(sym)}">📊 ${sym} overview</a></div></div>`;
  let body = '';
  if (key === 'growth-of-10k') {
    const rows = [[sym, D.g10, m.cagr], ...BENCH.map(b => { const bp = D.f.B[b].pts, s = at(bp, m.first.t), e = bp[bp.length - 1], yrs = (e.t - s.t) / (365.25 * DAY); return [b, D.g10b[b], (Math.pow(e.a / s.a, 1 / yrs) - 1) * 100]; })];
    body = `<div class="card"><div class="bigstat"><b>${money0(D.g10)}</b><span>is what $10,000 in ${sym} at launch (${D.sinceTxt}) is worth today, with dividends reinvested.</span></div></div>
${chartCard({ title: `Growth of $10,000: ${sym} vs SPY vs QQQ`, sub: 'Pick a start window to see how each would have grown.', series: D.series, names: D.names })}
<div class="card"><h2>Ending value of $10,000 since ${D.sinceTxt}</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fund</th><th>Value today</th><th>Total gain</th><th>Per year</th></tr></thead><tbody>${rows.map(([n, v, c]) => `<tr class="${n === sym ? 'me' : ''}"><td>${n}</td><td>${money0(v)}</td><td class="pos">${spct((v / 10000 - 1) * 100, 0)}</td><td>${pct(c)}</td></tr>`).join('')}</tbody></table></div></div>
<div class="card prose"><h2>What this means</h2><p>${sym} turned $10,000 into about ${money0(D.g10)} since ${D.sinceTxt}, ${D.g10 > D.g10b.SPY ? `beating the S&P 500 (SPY) by about ${money0(D.g10 - D.g10b.SPY)}` : `trailing the S&P 500 (SPY) by about ${money0(D.g10b.SPY - D.g10)}`}. That works out to ${pct(m.cagr)} a year, compounded.</p><p>The ride wasn't smooth: the worst drop along the way was ${pct(m.mdd)}, between ${fd(m.mddPeak.t)} and ${fd(m.mddTrough.t)}. Growth funds tend to win big in strong markets and fall harder in sell-offs, so the path matters as much as the ending number.</p></div>`;
  }
  else if (key === 'total-return') {
    const rows = D.trail.map(([lab, k]) => `<tr><td>${lab}</td><td class="${cls(m[k])}"><b>${spct(m[k])}</b></td>${BENCH.map(b => `<td class="${cls(bm[b][k])}">${spct(bm[b][k])}</td>`).join('')}</tr>`).join('');
    body = `<div class="card"><div class="bigstat"><b class="pos">${spct(m.cum, 0)}</b><span>total return since ${D.sinceTxt} with dividends reinvested, or ${pct(m.cagr)} a year. Price alone is up ${spct(m.cumPrice, 0)}.</span></div></div>
${chartCard({ title: `${sym} total return chart`, sub: 'Pick any window. Lines show cumulative total return.', series: D.series, names: D.names, range: '1y' })}
<div class="card"><h2>${sym} trailing returns vs SPY and QQQ</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Period</th><th>${sym}</th>${BENCH.map(b => `<th>${b}</th>`).join('')}</tr></thead><tbody>${rows}<tr><td>Since ${D.sinceTxt} (annual)</td><td><b>${pct(m.cagr)}</b></td>${BENCH.map(b => `<td>${pct(D.bcagr[b])}</td>`).join('')}</tr></tbody></table></div></div>
<div class="card prose"><h2>Price return vs total return</h2><p>Total return counts the share price change plus every dividend reinvested. For ${sym} the gap is small (${spct(m.cumPrice, 0)} price only vs ${spct(m.cum, 0)} total) because growth funds pay little in dividends. Almost all of the return comes from the stocks inside the fund rising in value.</p></div>`;
  } else if (key === 'vs-spy' || key === 'vs-qqq') {
    const b = key === 'vs-spy' ? 'SPY' : 'QQQ', bmm = bm[b], idx = D.names.indexOf(b), ser = [D.series[0], D.series[idx]];
    const diff = m.r1y - bmm.r1y;
    const yrs = Object.keys(m.years_).filter(y => bmm.years_[y]).reverse();
    const won = yrs.filter(y => !m.years_[y].partial && m.years_[y].v > bmm.years_[y].v).length, tot = yrs.filter(y => !m.years_[y].partial).length;
    const bb = b === 'SPY' ? D.bt : null;
    body = `<div class="card"><div class="bigstat"><b class="${cls(diff)}">${spct(diff)}</b><span>${sym} vs ${b} over the last year (${spct(m.r1y)} vs ${spct(bmm.r1y)}). ${sym} beat ${b} in ${won} of ${tot} full calendar years.</span></div></div>
${chartCard({ title: `${sym} vs ${b}: total return`, sub: `Head to head since ${D.sinceTxt}.`, series: ser, names: [sym, b], range: '5y' })}
<div class="card"><h2>Returns side by side</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Period</th><th>${sym}</th><th>${b}</th><th>Difference</th></tr></thead><tbody>${D.trail.map(([lab, k]) => `<tr><td>${lab}</td><td class="${cls(m[k])}">${spct(m[k])}</td><td class="${cls(bmm[k])}">${spct(bmm[k])}</td><td class="${cls(ok(m[k]) && ok(bmm[k]) ? m[k] - bmm[k] : null)}"><b>${ok(m[k]) && ok(bmm[k]) ? spct(m[k] - bmm[k]) : 'n/a'}</b></td></tr>`).join('')}</tbody></table></div></div>
<div class="card"><h2>Year by year</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th><th>${sym}</th><th>${b}</th><th>Winner</th></tr></thead><tbody>${yrs.map(y => `<tr><td>${y}${m.years_[y].partial ? '*' : ''}</td><td class="${cls(m.years_[y].v)}">${spct(m.years_[y].v)}</td><td class="${cls(bmm.years_[y].v)}">${spct(bmm.years_[y].v)}</td><td><b>${m.years_[y].v >= bmm.years_[y].v ? sym : b}</b></td></tr>`).join('')}</tbody></table></div><p class="note">* Partial year. ${b} figures cover the same dates as ${sym}.</p></div>
<div class="card"><h2>Risk side by side</h2><div class="kn"><a href="${url(sym, 'risk')}"><small>${sym} volatility (1Y)</small><b>${pct(m.vol1, 1)}</b><span>${b}: ${pct(bmm.vol1, 1)}</span></a><a href="${url(sym, 'drawdown')}"><small>Max drawdown</small><b class="neg">${pct(m.mdd)}</b><span>${b} since ${D.sinceTxt}: ${pct(D.bmdd[b])}</span></a>${bb ? `<a href="${url(sym, 'risk')}"><small>Beta vs ${b} (3Y)</small><b>${bb.beta.toFixed(2)}</b><span>correlation ${bb.corr.toFixed(2)}</span></a>` : ''}<a href="${url(sym, 'growth-of-10k')}"><small>$10K since ${D.sinceTxt}</small><b>${money0(D.g10)}</b><span>${b}: ${money0(D.g10b[b])}</span></a></div></div>`;
  } else if (key === 'calendar-returns') {
    const yrs = Object.keys(m.years_).reverse();
    body = `<div class="card"><div class="bigstat"><b>${m.upYears}/${m.fullYears}</b><span>full calendar years ${sym} finished positive. Best: ${m.best ? m.best[0] + ' (' + spct(m.best[1].v) + ')' : 'n/a'}. Worst: ${m.worst ? m.worst[0] + ' (' + spct(m.worst[1].v) + ')' : 'n/a'}.</span></div></div>
<div class="card"><h2>${sym} returns by year</h2>${cyGrid(m)}</div>
<div class="card"><h2>${sym} vs SPY vs QQQ by year</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Year</th><th>${sym}</th><th>SPY</th><th>QQQ</th></tr></thead><tbody>${yrs.map(y => `<tr><td>${y}${m.years_[y].partial ? '*' : ''}</td><td class="${cls(m.years_[y].v)}"><b>${spct(m.years_[y].v)}</b></td>${BENCH.map(b => `<td class="${cls(bm[b].years_[y]?.v)}">${bm[b].years_[y] ? spct(bm[b].years_[y].v) : 'n/a'}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="note">* Partial year (launch year or year to date). Benchmarks shown for full calendar years.</p></div>`;
  } else if (key === 'drawdown') {
    const ep = D.episodes.slice(0, 6);
    body = `<div class="card"><div class="bigstat"><b class="neg">${pct(m.mdd)}</b><span>${sym}'s worst drop from a high, ${fd(m.mddPeak.t)} to ${fd(m.mddTrough.t)}. ${m.mddRec ? `Recovered by ${fd(m.mddRec.t)}.` : 'Not yet fully recovered.'} Today it sits ${pct(m.curDD)} below its all-time high.</span></div></div>
<div class="card"><h2>${sym} drawdown history</h2><p class="sub">Every point shows how far ${sym} was below its previous high.</p>${ddSVG(D.f.Y.pts)}</div>
<div class="card"><h2>Biggest drawdowns</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Peak</th><th>Bottom</th><th>Drop</th><th>Recovered</th></tr></thead><tbody>${ep.map(e => `<tr><td>${fd(e.p)}</td><td>${fd(e.t)}</td><td class="neg"><b>${pct(e.d)}</b></td><td>${e.r ? fd(e.r) : 'Not yet'}</td></tr>`).join('')}</tbody></table></div></div>
<div class="card prose"><h2>How it compares</h2><p>Over the same period, SPY's worst drop was ${pct(D.bmdd.SPY)} and QQQ's was ${pct(D.bmdd.QQQ)}. Drawdowns are the price of growth investing: the funds that climb fastest in bull markets usually fall hardest when growth stocks sell off.</p></div>`;
  } else if (key === 'risk') {
    body = `<div class="card"><div class="bigstat"><b>${pct(m.vol1)}</b><span>annualized volatility over the last year (${pct(m.vol3)} over 3 years). SPY: ${pct(bm.SPY.vol1)}. QQQ: ${pct(bm.QQQ.vol1)}.</span></div></div>
<div class="card"><h2>${sym} risk numbers</h2><div class="kn"><a href="${url(sym, 'risk')}"><small>Volatility 1Y</small><b>${pct(m.vol1)}</b><span>3Y: ${pct(m.vol3)}</span></a>${D.bt ? `<a href="${url(sym, 'vs-spy')}"><small>Beta vs SPY (3Y)</small><b>${D.bt.beta.toFixed(2)}</b><span>${D.bt.beta > 1 ? 'moves more than the market' : 'moves less than the market'}</span></a><a href="${url(sym, 'vs-spy')}"><small>Correlation vs SPY</small><b>${D.bt.corr.toFixed(2)}</b><span>1.00 = moves in lockstep</span></a>` : ''}<a href="${url(sym, 'drawdown')}"><small>Max drawdown</small><b class="neg">${pct(m.mdd)}</b><span>${fm(m.mddPeak.t)} to ${fm(m.mddTrough.t)}</span></a><a href="${url(sym, 'drawdown')}"><small>Below all-time high</small><b class="${cls(m.curDD)}">${pct(m.curDD)}</b><span>as of ${D.asOf}</span></a><a href="${url(sym, 'calendar-returns')}"><small>Positive years</small><b>${m.upYears}/${m.fullYears}</b><span>full calendar years</span></a><a href="${url(sym, 'total-return')}"><small>Best day (1Y)</small><b class="pos">${spct(D.bestDay)}</b><span>worst day ${spct(D.worstDay)}</span></a></div></div>
<div class="card prose"><h2>What volatility means here</h2><p>Volatility measures how much ${sym}'s daily returns swing, scaled to a year. At ${pct(m.vol1, 0)}, a typical year could land roughly ${pct(m.vol1, 0)} above or below its average return. ${D.bt ? `A beta of ${D.bt.beta.toFixed(2)} means that when the S&P 500 moves 1%, ${sym} has tended to move about ${D.bt.beta.toFixed(2)}%.` : ''}</p></div>`;
  } else if (key === '52-week-range') {
    const fromHi = (m.last.c / m.hi52.c - 1) * 100, fromLo = (m.last.c / m.lo52.c - 1) * 100;
    body = `<div class="card"><div class="bigstat"><b>${pct(m.pos52, 0)}</b><span>of the way from ${sym}'s 52-week low (${money(m.lo52.c)}) to its high (${money(m.hi52.c)}).</span></div><div class="r52"><i style="left:calc(${Math.min(Math.max(m.pos52, 0), 100).toFixed(1)}% - 2px)"></i></div><div class="r52-l"><span>Low ${money(m.lo52.c)}<br>${fd(m.lo52.t)}</span><span style="text-align:right">High ${money(m.hi52.c)}<br>${fd(m.hi52.t)}</span></div></div>
<div class="card"><h2>${sym} vs its 52-week range</h2><div class="kn"><a href="${url(sym, '52-week-range')}"><small>Last close</small><b>${money(m.last.c)}</b><span>${D.asOf}</span></a><a href="${url(sym, '52-week-range')}"><small>Below 52-week high</small><b class="${cls(fromHi)}">${spct(fromHi)}</b><span>high ${fd(m.hi52.t)}</span></a><a href="${url(sym, '52-week-range')}"><small>Above 52-week low</small><b class="pos">${spct(fromLo)}</b><span>low ${fd(m.lo52.t)}</span></a><a href="${url(sym, 'drawdown')}"><small>Below all-time high</small><b class="${cls(m.curDD)}">${pct(m.curDD)}</b><span>total return basis</span></a></div></div>
${chartCard({ title: `${sym} over the last year`, sub: 'Total return over the past 12 months vs SPY and QQQ.', series: D.series, names: D.names, range: '1y' })}`;
  } else if (key === 'dividends') {
    const last12 = D.f.Y.divs.slice(-12).reverse();
    body = `<div class="card"><div class="bigstat"><b>${pct(m.yield, 2)}</b><span>trailing 12-month dividend yield (${money(m.ttmDiv, 4)} per share over ${m.divCount} payment${m.divCount === 1 ? '' : 's'}). ${sym} pays ${m.freq.toLowerCase()}.</span></div></div>
<div class="card"><h2>Recent ${sym} dividends</h2>${last12.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ex-date</th><th>Amount per share</th></tr></thead><tbody>${last12.map(d => `<tr><td>${fd(d.t)}</td><td>${money(d.v, 4)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="sub">No dividends on record.</p>`}</div>
<div class="card prose"><h2>Growth ETFs and dividends</h2><p>Growth funds own companies that reinvest profits to grow rather than paying them out, so yields are small. For ${sym}, dividends added about ${pct(m.cum - m.cumPrice, 0)} points to the total return since ${D.sinceTxt}. If income is the goal, our sister site <a href="https://topdividendetfs.com" target="_blank" rel="noopener">TopDividendETFs.com</a> ranks 100+ dividend ETFs.</p></div>`;
  } else if (key === 'rank') {
    const sorted = D.list.filter(x => ok(x.tr)).sort((a, b) => b.tr - a.tr), i = sorted.findIndex(x => x.sym === sym), win = sorted.slice(Math.max(0, i - 5), i + 6);
    body = `<div class="card"><div class="bigstat"><b>#${D.rankTR}</b><span>of ${D.n} growth ETFs by total return on GrowthETFs.com (${D.f.tr != null ? D.f.tr + '%' : 'n/a'} on our list), and #${D.rankAUM} by fund size (${esc(D.f.aumTxt)}).</span></div></div>
<div class="card"><h2>Where ${sym} sits on the list</h2><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Rank</th><th>ETF</th><th>Total return</th><th>AUM</th></tr></thead><tbody>${win.map(x => `<tr class="${x.sym === sym ? 'me' : ''}"><td>#${sorted.indexOf(x) + 1}</td><td><a href="${url(x.sym)}">${x.sym}</a> <small style="color:#5f6b66">${esc(x.name)}</small></td><td>${x.tr}%</td><td>${esc(x.aumTxt)}</td></tr>`).join('')}</tbody></table></div><p class="note"><a href="/all-growth-etfs.html">See all ${D.n} growth ETFs ranked →</a></p></div>`;
  }

  return `<section class="gx-hero" style="grid-template-columns:1fr"><div><div class="chips" style="margin:0 0 8px"><span class="gold">${sym} breakdown</span><span>Data as of ${D.asOf}</span></div><div class="sym" style="font-size:1.9rem">${sym} ${L[key]}</div><div class="nm">${esc(D.f.name)}</div></div></section>${body}${nav}<p class="note">Not financial advice. Data from Yahoo Finance daily prices and the GrowthETFs.com list.</p>`;
}

// ───────── assemble pages
function page(existing, D, inner, opts) {
  let h = existing;
  const a = h.indexOf('<main'), b = h.indexOf('</main>') + 7;
  h = h.slice(0, a) + `<main class="wrap gx"><div class="crumbs"><a href="/">Home</a> &rsaquo; <a href="/all-growth-etfs.html">All Growth ETFs</a> &rsaquo; ${opts.key ? `<a href="${url(D.sym)}">${D.sym}</a> &rsaquo; ${L[opts.key]}` : D.sym}</div>${inner}</main>` + h.slice(b);
  if (!h.includes('.gx-hero{')) h = h.replace('</style>', CSS + '</style>');
  h = h.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(opts.title)}</title>`).replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(opts.desc)}">`);
  if (opts.canon) h = h.replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${opts.canon}">`);
  h = h.replace('</body>', `<script>${CHART_JS}</script>\n</body>`);
  return h;
}

async function main() {
  const csv = await get(CSV_URL + '&t=' + Date.now()); if (!csv) throw new Error('sheet');
  const rows = parseCSV(csv), hd = rows.shift().map(x => x.trim().toLowerCase());
  const I = k => hd.indexOf(k);
  const list = rows.filter(r => r[I('symbol')]).map(r => ({ sym: r[I('symbol')].trim().toUpperCase(), name: r[I('name')].trim(), aumTxt: (r[I('aum')] || '').trim(), aum: aum(r[I('aum')]), tr: num(r[I('total returns')]) }));
  const B = {}; for (const b of BENCH) B[b] = await yahoo(b);
  if (!B.SPY || !B.QQQ) throw new Error('benchmark data unavailable');
  const built = [];
  for (const f of list) {
    if (ONLY && !ONLY.has(f.sym)) continue;
    const file = path.join(ROOT, 'etf', f.sym.toLowerCase() + '-growth-etf.html'); if (!fs.existsSync(file)) continue;
    const Y = await yahoo(f.sym); if (!Y) { console.log('skip', f.sym); continue; }
    f.Y = Y; f.B = B;
    const existing = fs.readFileSync(file, 'utf8').replace(/<style>[\s\S]*?<\/style>/, s => s); // keep site CSS
    const D = buildFund(f, Y, B, list);
    const base = existing;
    fs.writeFileSync(file, page(base, D, mainContent(D), { title: `${f.sym} ETF: Performance, Total Return & Risk vs SPY (${new Date().getUTCFullYear()}) | ${f.name}`, desc: `${f.sym} total return ${spct(D.m.cum, 0)} since ${D.sinceTxt} (${pct(D.m.cagr)}/yr), ${spct(D.m.r1y)} over 1 year vs ${spct(D.bm.SPY.r1y)} for SPY. Charts, drawdowns, risk and rank among ${D.n} growth ETFs.` }));
    const dir = path.join(ROOT, 'etf', f.sym.toLowerCase()); fs.mkdirSync(dir, { recursive: true });
    for (const [k] of METRICS) {
      fs.writeFileSync(path.join(dir, k + '.html'), page(base, D, breakdownContent(D, k), { key: k, title: `${f.sym} ${L[k]} (${new Date().getUTCFullYear()}) | GrowthETFs.com`, desc: `${f.sym} ${L[k].toLowerCase()}: ${f.name} data as of ${D.asOf}.`, canon: SITE + url(f.sym, k) }));
    }
    built.push(f.sym);
    console.log('built', f.sym);
  }
}
async function sitemapAdd(syms) {
  const sm = path.join(ROOT, 'sitemap.xml'); if (!fs.existsSync(sm)) return;
  let x = fs.readFileSync(sm, 'utf8'); const today = new Date().toISOString().slice(0, 10);
  // every breakdown page that exists on disk (built today or kept from an earlier run)
  const add = [];
  for (const d of fs.readdirSync(path.join(ROOT, 'etf'), { withFileTypes: true })) { if (!d.isDirectory()) continue; for (const [k] of METRICS) if (fs.existsSync(path.join(ROOT, 'etf', d.name, k + '.html'))) add.push(`${SITE}/etf/${d.name}/${k}`); }
  const fresh = add.filter(u => !x.includes(`<loc>${u}</loc>`)).map(u => `  <url>\n    <loc>${u}</loc>\n    <lastmod>${today}</lastmod>\n  </url>`).join('\n');
  if (fresh) { x = x.replace('</urlset>', fresh + '\n</urlset>'); fs.writeFileSync(sm, x); }
  console.log('sitemap: +' + (fresh ? fresh.split('<url>').length - 1 : 0) + ' breakdown URLs');
}
main().then(() => sitemapAdd()).catch(e => { console.error(e); process.exit(1); });
