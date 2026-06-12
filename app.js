'use strict';

/* =======================================================================
   eMANDEVAL Future v4.3.2
   Predicted public support uses a class-share-weighted two-class
   latent-class (LC) choice model. The benefit and cost calculations are
   carried over unchanged. Accuracy is the priority, so the science is
   preserved; everything around it, the interface, accessibility and
   exports, is built for clarity.
   ======================================================================= */

const APP_VERSION = '4.3.2';
const STUDY_LIVES_MIN = 10;
const STUDY_LIVES_MAX = 40;

/* Fixed bands used for plain language verdicts */
const SUPPORT_LOW = 50;   /* below this: low support */
const SUPPORT_HIGH = 70;  /* at or above this: high support */
const BCR_LOW = 0.8;      /* below this: poor value */
const BCR_HIGH = 1.0;     /* at or above this: good value */

/* =======================================================================
   Two-class latent-class (LC) support model
   -----------------------------------------------------------------------
   Predicted public support is the class-share-weighted probability of
   choosing the selected mandate policy over no mandate, using a two-class
   latent-class choice model:

     P(support) = sum_c [ pi_c * P(support | class c) ]

   where pi_c is the estimated class share for the selected country and
   outbreak scenario, and P(support | class c) is the class-specific
   probability of supporting the mandate over no mandate:

     V_policy_c   = beta_scope_c   * ScopeAll
                  + beta_exemptMR_c  * ExemptMR
                  + beta_exemptMRP_c * ExemptMRP
                  + beta_cov70_c     * Coverage70
                  + beta_cov90_c     * Coverage90
                  + beta_lives_c     * LivesSaved
     V_noMandate_c = ASC_NoMandate_c
     P(support|c) = 1 / (1 + exp(V_noMandate_c - V_policy_c))   (stable logit)

   The Policy A display constant is set to zero: the tool predicts support
   for a generic policy bundle versus no mandate, not a left-versus-right
   experimental display. Class-membership covariates are not used, because
   this is a class-share-weighted prediction, not an individual posterior.

   Attribute coding:
     Scope:    high risk only            -> ScopeAll = 0
               all occupations / public  -> ScopeAll = 1
     Exempt:   medical only              -> ExemptMR = 0, ExemptMRP = 0
               medical or religious       -> ExemptMR = 1, ExemptMRP = 0
               medical/religious/personal -> ExemptMR = 0, ExemptMRP = 1
     Coverage: 50 percent                -> Coverage70 = 0, Coverage90 = 0
               70 percent                 -> Coverage70 = 1, Coverage90 = 0
               90 percent                 -> Coverage70 = 0, Coverage90 = 1
     LivesSaved: selected value, lives saved per 100,000 (study range 10 to 40)
   ======================================================================= */
const LC_MODELS = {
  "Australia": {
    "mild": { "classes": [
      { "label":"supporter", "share":0.74672, "ASC_NoMandate":-1.010, "ScopeAll":-0.193, "ExemptMR":-0.179, "ExemptMRP":-0.210, "Coverage70":0.101, "Coverage90":0.167, "LivesSaved":0.039 },
      { "label":"resister",  "share":0.25328, "ASC_NoMandate":2.948,  "ScopeAll":-0.266, "ExemptMR":0.108,  "ExemptMRP":0.153,  "Coverage70":-0.095,"Coverage90":-0.261,"LivesSaved":0.015 }
    ]},
    "severe": { "classes": [
      { "label":"resister",  "share":0.21857, "ASC_NoMandate":2.725,  "ScopeAll":-0.012, "ExemptMR":-0.094, "ExemptMRP":0.053,  "Coverage70":0.104, "Coverage90":0.055, "LivesSaved":0.010 },
      { "label":"supporter", "share":0.78143, "ASC_NoMandate":-0.792, "ScopeAll":0.116,  "ExemptMR":-0.152, "ExemptMRP":-0.233, "Coverage70":0.162, "Coverage90":0.241, "LivesSaved":0.045 }
    ]}
  },
  "France": {
    "mild": { "classes": [
      { "label":"supporter", "share":0.72384, "ASC_NoMandate":-0.627, "ScopeAll":-0.112, "ExemptMR":-0.161, "ExemptMRP":-0.149, "Coverage70":0.119, "Coverage90":0.186, "LivesSaved":0.034 },
      { "label":"resister",  "share":0.27616, "ASC_NoMandate":2.779,  "ScopeAll":-0.192, "ExemptMR":0.069,  "ExemptMRP":0.180,  "Coverage70":-0.024,"Coverage90":-0.025,"LivesSaved":0.009 }
    ]},
    "severe": { "classes": [
      { "label":"supporter", "share":0.77124, "ASC_NoMandate":-0.439, "ScopeAll":0.059,  "ExemptMR":-0.124, "ExemptMRP":-0.176, "Coverage70":0.149, "Coverage90":0.260, "LivesSaved":0.036 },
      { "label":"resister",  "share":0.22876, "ASC_NoMandate":2.565,  "ScopeAll":-0.234, "ExemptMR":-0.115, "ExemptMRP":-0.024, "Coverage70":0.148, "Coverage90":0.208, "LivesSaved":0.001 }
    ]}
  },
  "Italy": {
    "mild": { "classes": [
      { "label":"supporter", "share":0.71230, "ASC_NoMandate":-0.867, "ScopeAll":-0.177, "ExemptMR":-0.133, "ExemptMRP":-0.229, "Coverage70":0.132, "Coverage90":0.172, "LivesSaved":0.028 },
      { "label":"resister",  "share":0.28771, "ASC_NoMandate":2.716,  "ScopeAll":-0.256, "ExemptMR":-0.162, "ExemptMRP":0.033,  "Coverage70":-0.135,"Coverage90":-0.194,"LivesSaved":0.008 }
    ]},
    "severe": { "classes": [
      { "label":"supporter", "share":0.76117, "ASC_NoMandate":-0.633, "ScopeAll":0.170,  "ExemptMR":-0.120, "ExemptMRP":-0.224, "Coverage70":0.195, "Coverage90":0.354, "LivesSaved":0.033 },
      { "label":"resister",  "share":0.23883, "ASC_NoMandate":2.749,  "ScopeAll":-0.089, "ExemptMR":-0.169, "ExemptMRP":0.107,  "Coverage70":-0.074,"Coverage90":-0.029,"LivesSaved":0.003 }
    ]}
  }
};
/* Tool country codes map to the LC model keys. */
const LC_COUNTRY = { AU:'Australia', FR:'France', IT:'Italy' };

/* ---------- Cost defaults (per one million people, per year) ---------- */
const COST_PER_MILLION = {
  AU: { it:1200000, comms:800000, enf:1800000, comp:2200000, admin:800000, other:500000 },
  FR: { it:1000000, comms:700000, enf:1500000, comp:1800000, admin:700000, other:400000 },
  IT: { it:900000,  comms:600000, enf:1400000, comp:1600000, admin:600000, other:400000 }
};
const COST_OUTBREAK_MULT = { mild: 0.8, severe: 1.3 };

/* ---------- Benefit metric defaults and labels ---------- */
const metricMeta = {
  vsl:      { label:'value of a statistical life', defaults:{ AU:5400000, FR:3000000, IT:2800000 }, note:'A money value placed on each life saved, used to compare benefits with costs.' },
  vsly:     { label:'value of a life year',        defaults:{ AU:230000, FR:100000, IT:80000 },     note:'Use this when you value each life year gained rather than each whole life.' },
  qalys:    { label:'value per quality adjusted life year', defaults:{ AU:50000, FR:40000, IT:30000 }, note:'A health outcome measure that combines length and quality of life.' },
  healthsys:{ label:'health system savings per life', defaults:{ AU:100000, FR:80000, IT:60000 },   note:'Counts only the costs the health system avoids, a more conservative figure.' }
};

/* Conversions for other health effects (rough, not added to money value) */
const HOSP_PER_LIFE = 8, ICU_PER_LIFE = 10, WORKDAYS_PER_LIFE = 180;

const COUNTRY_NAME = { AU:'Australia', FR:'France', IT:'Italy' };
const OUTBREAK_NAME = { mild:'mild or endemic', severe:'severe outbreak' };
const SCOPE_NAME = { highrisk:'high risk occupations only', all:'all occupations and public spaces' };
const EX_NAME = { medical:'medical reasons only', medrel:'medical or religious', medrelpers:'medical, religious or personal belief' };
const COV_NAME = { '0.5':'50 percent vaccinated', '0.7':'70 percent vaccinated', '0.9':'90 percent vaccinated' };
function currencyFor(country) { return country === 'AU' ? 'AUD' : 'EUR'; }

/* =======================================================================
   Calculation engine
   ======================================================================= */
/* Class-share-weighted latent-class predicted support for a generic mandate
   policy versus no mandate. Returns the weighted support (0 to 1), the same
   as a percentage, and the per-class breakdown for charts and exports. */
function computeSupportLC(cfg) {
  const model = LC_MODELS[LC_COUNTRY[cfg.country]][cfg.outbreak];

  const ScopeAll = cfg.scope === 'all' ? 1 : 0;
  let ExemptMR = 0, ExemptMRP = 0;
  if (cfg.exemptions === 'medrel') ExemptMR = 1;
  else if (cfg.exemptions === 'medrelpers') ExemptMRP = 1;
  let Coverage70 = 0, Coverage90 = 0;
  if (Number(cfg.coverage) === 0.7) Coverage70 = 1;
  else if (Number(cfg.coverage) === 0.9) Coverage90 = 1;
  const LivesSaved = Number(cfg.lives) || 0;

  let weighted = 0;
  const classBreakdown = [];
  model.classes.forEach(cls => {
    const Vpolicy = cls.ScopeAll * ScopeAll
                  + cls.ExemptMR * ExemptMR
                  + cls.ExemptMRP * ExemptMRP
                  + cls.Coverage70 * Coverage70
                  + cls.Coverage90 * Coverage90
                  + cls.LivesSaved * LivesSaved;
    const VnoMandate = cls.ASC_NoMandate;
    /* numerically stable two-alternative logit: 1 / (1 + exp(Vno - Vpolicy)) */
    const classSupport = 1 / (1 + Math.exp(VnoMandate - Vpolicy));
    const weightedContribution = cls.share * classSupport;
    weighted += weightedContribution;
    classBreakdown.push({ label: cls.label, share: cls.share, support: classSupport, weightedContribution });
  });

  return { predictedSupport: weighted, predictedSupportPercent: weighted * 100, classBreakdown };
}

function computeDerived(s, opts) {
  const cfg = s.config, set = s.settings, costs = s.costs;
  const pop = set.population || 0;
  const value = set.valuePerLife || 0;
  const lives = cfg.lives || 0;

  const livesTotal = (lives / 100000) * pop;          /* scale per 100k up to population */
  const benefit = livesTotal * value;                 /* money value of lives saved */
  const costTotal = costs ? (costs.it + costs.comms + costs.enf + costs.comp + costs.admin + costs.other) : 0;
  const net = benefit - costTotal;
  const bcr = costTotal > 0 ? benefit / costTotal : null;
  /* Class-share-weighted LC support. Skipped where the caller only needs the
     benefit to cost ratio (the sensitivity calculation), which is cheap now
     but kept consistent for clarity. */
  const lc = (opts && opts.skipSupport) ? null : computeSupportLC(cfg);
  const support = lc ? lc.predictedSupport : null;

  const pop100k = pop / 100000;
  return {
    support, lc, livesTotal, benefit, costTotal, net, bcr,
    hosp: Math.round(HOSP_PER_LIFE * lives * pop100k),
    icu:  Math.round(ICU_PER_LIFE  * lives * pop100k),
    work: Math.round(WORKDAYS_PER_LIFE * lives * pop100k),
    extrapolated: lives < STUDY_LIVES_MIN || lives > STUDY_LIVES_MAX
  };
}

/* Sensitivity of the benefit to cost ratio to a 20 percent change in each input */
function computeTornado(s) {
  const base = computeDerived(s, { skipSupport:true });
  if (base.bcr == null) return [];
  const rows = [];
  const pct = 0.2;
  const vary = (label, mutate) => {
    const lo = computeDerived(mutate(1 - pct), { skipSupport:true });
    const hi = computeDerived(mutate(1 + pct), { skipSupport:true });
    if (lo.bcr == null || hi.bcr == null) return;
    const a = Math.min(lo.bcr, hi.bcr), b = Math.max(lo.bcr, hi.bcr);
    rows.push({ label, lo:a, hi:b, range:b - a });
  };
  if (s.config.lives > 0)
    vary('Lives saved', f => ({ ...s, config:{ ...s.config, lives:s.config.lives*f } }));
  if (s.settings.valuePerLife > 0)
    vary('Value per life', f => ({ ...s, settings:{ ...s.settings, valuePerLife:s.settings.valuePerLife*f } }));
  ['enf','comp','it','comms','admin','other'].forEach(k => {
    const labels = { enf:'Enforcement cost', comp:'Compensation cost', it:'Digital systems cost', comms:'Information cost', admin:'Administration cost', other:'Other costs' };
    if (s.costs && s.costs[k] > 0)
      vary(labels[k], f => ({ ...s, costs:{ ...s.costs, [k]:s.costs[k]*f } }));
  });
  rows.sort((a, b) => b.range - a.range);
  return rows;
}

/* =======================================================================
   Formatting helpers
   ======================================================================= */
function money(v, cur) {
  if (v == null || !isFinite(v)) return cur + ' n/a';
  const a = Math.abs(v); let out;
  if (a >= 1e9) out = (v/1e9).toFixed(2) + ' billion';
  else if (a >= 1e6) out = (v/1e6).toFixed(2) + ' million';
  else if (a >= 1e3) out = (v/1e3).toFixed(1) + ' thousand';
  else out = Math.round(v).toString();
  return cur + ' ' + out;
}
function moneyShort(v, cur) {
  if (v == null || !isFinite(v)) return 'n/a';
  const a = Math.abs(v);
  if (a >= 1e9) return cur + ' ' + (v/1e9).toFixed(1) + 'bn';
  if (a >= 1e6) return cur + ' ' + (v/1e6).toFixed(1) + 'm';
  if (a >= 1e3) return cur + ' ' + (v/1e3).toFixed(0) + 'k';
  return cur + ' ' + Math.round(v);
}
function pct(v) { return (v == null || !isFinite(v)) ? 'n/a' : v.toFixed(0) + ' percent'; }
function supportLevel(p) { return p >= SUPPORT_HIGH ? 'good' : p >= SUPPORT_LOW ? 'mid' : 'low'; }
function bcrLevel(b) { return (b == null) ? 'mid' : b >= BCR_HIGH ? 'good' : b >= BCR_LOW ? 'mid' : 'low'; }
function inWords(p) {
  if (p >= 80) return 'about four in five people';
  if (p >= 66) return 'about two in three people';
  if (p >= 55) return 'a clear majority';
  if (p >= 45) return 'around half of people';
  if (p >= 33) return 'about one in three people';
  return 'a minority of people';
}

/* =======================================================================
   State
   ======================================================================= */
const state = {
  config:   { country:'AU', outbreak:'mild', scope:'highrisk', exemptions:'medical', coverage:0.5, lives:25 },
  settings: { population:1000000, horizon:1, metric:'vsl', valuePerLife:5400000, currency:'AUD' },
  costs:    null,
  derived:  null,
  dirty:    false,
  scenarios: []
};
let charts = { support:null, byclass:null, bc:null, tornado:null };
const $ = id => document.getElementById(id);
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* =======================================================================
   Read the form into state, then recompute
   ======================================================================= */
function readForm() {
  state.config.country = currentChip('country-chips');
  state.config.outbreak = currentChip('outbreak-chips');
  state.config.scope = $('scope').value;
  state.config.exemptions = $('exemptions').value;
  state.config.coverage = parseFloat($('coverage').value);
  state.config.lives = clampNum($('lives').value, 0, 100, 25);

  state.settings.population = Math.max(0, num($('population').value, 1000000));
  state.settings.horizon = Math.max(0.25, num($('horizon').value, 1));
  state.settings.metric = $('metric').value;
  state.settings.valuePerLife = Math.max(0, num($('value-per-life').value, 0));
  state.settings.currency = currencyFor(state.config.country);

  const c = {
    it: clampCost('c-it'), comms: clampCost('c-comms'), enf: clampCost('c-enf'),
    comp: clampCost('c-comp'), admin: clampCost('c-admin'), other: clampCost('c-other')
  };
  const anyCost = c.it + c.comms + c.enf + c.comp + c.admin + c.other > 0;
  state.costs = anyCost ? c : null;
}
function num(v, d) { const n = parseFloat(v); return isFinite(n) ? n : d; }
function clampNum(v, lo, hi, d) { let n = num(v, d); return Math.min(hi, Math.max(lo, n)); }
function clampCost(id) {
  const el = $(id); let n = parseFloat(el.value);
  if (!isFinite(n) || n < 0) { n = 0; if (el.value !== '' && parseFloat(el.value) < 0) el.value = '0'; }
  return n;
}
function currentChip(groupId) {
  const sel = $(groupId).querySelector('[aria-checked="true"]');
  return sel ? sel.dataset.value : null;
}

/* =======================================================================
   Render everything
   ======================================================================= */
function safeScroll(el, opts) {
  if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView(opts);
}
/* Results now update when the user applies changes, so the action is explicit.
   The control values (like the slider number) still update live for feedback. */
function applyChanges() {
  readForm();
  state.derived = computeDerived(state);
  render();
  try { renderCharts(); } catch (e) { console.warn('Chart rendering issue (results are still correct):', e); }
  updateReportPrompt();
  setDirty(false);
  stampApplied();
  scheduleSave();
  announce();
}
function setDirty(d) {
  state.dirty = d;
  $('pending-pill').hidden = !d;
  $('apply-banner').hidden = !d;
  const hint = $('apply-hint');
  hint.textContent = d ? 'You have changes to apply.' : 'Your results are up to date.';
  hint.classList.toggle('is-dirty', d);
  $('tour-apply').classList.toggle('is-dirty', d);
}
function stampApplied() {
  const el = $('applied-stamp'); if (!el) return;
  const t = new Date();
  const p = n => String(n).padStart(2, '0');
  el.textContent = 'Updated ' + p(t.getHours()) + ':' + p(t.getMinutes()) + ':' + p(t.getSeconds());
  el.hidden = false;
}
function markDirty() { setDirty(true); scheduleSave(); }
function onApplyClick() {
  try { applyChanges(); } catch (e) { console.warn(e); }
  toast('Changes applied. Results updated.', 'good');
  const h = $('results-h'); h.setAttribute('tabindex', '-1'); h.focus();
  if (window.matchMedia('(max-width: 1000px)').matches) {
    safeScroll($('results'), { behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }
}

function render() {
  const cfg = state.config, set = state.settings, d = state.derived, cur = set.currency;

  $('config-pill').textContent = COUNTRY_NAME[cfg.country] + ', ' + OUTBREAK_NAME[cfg.outbreak];
  $('currency-unit').textContent = cur;

  /* Support meter */
  const sp = d.support * 100;
  $('support-num').textContent = sp.toFixed(0);
  const lvl = supportLevel(sp);
  const verdict = $('support-verdict');
  verdict.textContent = lvl === 'good' ? 'High support' : lvl === 'mid' ? 'Moderate support' : 'Low support';
  verdict.className = 'support-verdict lvl-' + lvl;
  $('support-plain').textContent = capitalise(inWords(sp)) + ' would support this mandate over no mandate.';
  drawMeter(sp);

  /* Extrapolation */
  const ex = $('extrap');
  if (d.extrapolated) {
    ex.hidden = false;
    $('extrap-text').textContent = 'The lives saved figure (' + cfg.lives + ' per 100,000) is outside the study range of '
      + STUDY_LIVES_MIN + ' to ' + STUDY_LIVES_MAX + '. The benefit and cost figures below are an extrapolation, so treat them with extra care.';
  } else { ex.hidden = true; }

  /* Figures */
  $('f-lives').textContent = d.livesTotal.toFixed(0);
  $('f-benefit').textContent = money(d.benefit, cur);
  $('f-cost').textContent = d.costTotal > 0 ? money(d.costTotal, cur) : 'Not entered';
  $('f-net').textContent = money(d.net, cur);
  const bcrEl = $('f-bcr'), bandEl = $('bcr-band');
  if (d.bcr == null) {
    bcrEl.textContent = 'Enter costs';
    bandEl.textContent = ''; bandEl.className = 'band-tag';
  } else {
    bcrEl.textContent = d.bcr.toFixed(2);
    const bl = bcrLevel(d.bcr);
    bandEl.textContent = bl === 'good' ? 'Benefits exceed costs' : bl === 'mid' ? 'Close to break even' : 'Costs exceed benefits';
    bandEl.className = 'band-tag lvl-' + bl;
  }

  /* Other health effects */
  $('m-hosp').textContent = d.hosp.toLocaleString();
  $('m-icu').textContent = d.icu.toLocaleString();
  $('m-work').textContent = d.work.toLocaleString();

  /* Cost total line */
  $('cost-total-line').textContent = d.costTotal > 0 ? 'Total costs: ' + money(d.costTotal, cur) : 'Total costs: not entered';

  renderInterpretation();
  renderRanges();
}

function renderInterpretation() {
  const cfg = state.config, d = state.derived, cur = state.settings.currency;
  const sp = d.support * 100;
  let t = 'In a ' + OUTBREAK_NAME[cfg.outbreak] + ' situation in ' + COUNTRY_NAME[cfg.country] + ', this mandate would be supported by '
    + inWords(sp) + ' (' + pct(sp) + '). ';
  t += 'It is estimated to save about ' + d.livesTotal.toFixed(0) + ' lives in a population of ' + state.settings.population.toLocaleString()
    + ', worth ' + money(d.benefit, cur) + ' in health terms. ';
  if (d.bcr == null) {
    t += 'Add implementation costs to see whether the benefits outweigh them.';
  } else if (d.bcr >= BCR_HIGH) {
    t += 'With the costs you entered, benefits are larger than costs (ratio ' + d.bcr.toFixed(2) + '), which is a favourable result on the numbers alone.';
  } else if (d.bcr >= BCR_LOW) {
    t += 'With the costs you entered, benefits and costs are close (ratio ' + d.bcr.toFixed(2) + '), so the case is finely balanced.';
  } else {
    t += 'With the costs you entered, costs are larger than benefits (ratio ' + d.bcr.toFixed(2) + ') under these assumptions.';
  }
  $('interpret-text').textContent = t;
}

function renderRanges() {
  const cur = state.settings.currency;
  const low = { ...state, config:{ ...state.config, lives:STUDY_LIVES_MIN } };
  const high = { ...state, config:{ ...state.config, lives:STUDY_LIVES_MAX } };
  const dLow = computeDerived(low), dHigh = computeDerived(high), d = state.derived;
  const lv = [dLow.livesTotal, d.livesTotal, dHigh.livesTotal];
  const su = [dLow.support, d.support, dHigh.support].map(x => x*100);
  $('r-lives').textContent = Math.min(...lv).toFixed(0) + ' to ' + Math.max(...lv).toFixed(0) + ' lives';
  $('r-support').textContent = Math.min(...su).toFixed(0) + ' to ' + Math.max(...su).toFixed(0) + ' percent';
  const bcrs = [dLow.bcr, d.bcr, dHigh.bcr].filter(x => x != null);
  $('r-bcr').textContent = bcrs.length ? Math.min(...bcrs).toFixed(2) + ' to ' + Math.max(...bcrs).toFixed(2) : 'enter costs';
}

/* =======================================================================
   Support meter (SVG)
   ======================================================================= */
function drawMeter(sp) {
  const svg = $('support-meter');
  const c = (v) => Math.max(0, Math.min(100, v));
  const bands = [
    { x:0, w:SUPPORT_LOW, fill:'var(--bad)' },
    { x:SUPPORT_LOW, w:SUPPORT_HIGH-SUPPORT_LOW, fill:'var(--warn)' },
    { x:SUPPORT_HIGH, w:100-SUPPORT_HIGH, fill:'var(--good)' }
  ];
  let html = '';
  bands.forEach(b => {
    html += '<rect x="' + b.x + '" y="6" width="' + b.w + '" height="6" fill="' + b.fill + '" opacity="0.85"></rect>';
  });
  html += '<line x1="0" y1="9" x2="100" y2="9" stroke="var(--surface)" stroke-width="0.4" opacity="0.4"></line>';
  const x = c(sp);
  html += '<polygon points="' + x + ',2 ' + (x-2.2) + ',5 ' + (x+2.2) + ',5" fill="var(--ink)"></polygon>';
  html += '<line x1="' + x + '" y1="4.5" x2="' + x + '" y2="13.5" stroke="var(--ink)" stroke-width="1.1"></line>';
  html += '<text x="' + SUPPORT_LOW + '" y="17.4" font-size="3" fill="var(--ink-faint)" text-anchor="middle">50</text>';
  html += '<text x="' + SUPPORT_HIGH + '" y="17.4" font-size="3" fill="var(--ink-faint)" text-anchor="middle">70</text>';
  svg.innerHTML = html;
  svg.setAttribute('aria-label', 'Support meter. Predicted support is ' + sp.toFixed(0)
    + ' percent, which is ' + (supportLevel(sp) === 'good' ? 'high' : supportLevel(sp) === 'mid' ? 'moderate' : 'low')
    + '. The low band ends at 50 percent and the high band starts at 70 percent.');
}

/* =======================================================================
   Charts (Chart.js) with hidden data tables
   ======================================================================= */
const CHART = { good:'#226347', mid:'#9A6700', bad:'#B3261E', primary:'#15564A', grey:'#9AA7A0', ink:'#3C4D46', grid:'rgba(22,36,31,.08)' };

/* Draws the value next to every bar. This gives a text label for each data
   point so the charts are readable without relying on colour, which helps
   colour blind users and anyone reading a greyscale print. */
const valueLabelsPlugin = {
  id: 'valueLabels',
  afterDatasetsDraw(chart) {
    const cfg = chart.options.plugins && chart.options.plugins.valueLabels;
    if (!cfg || !cfg.display) return;
    try {
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 11px "Source Sans 3", system-ui, sans-serif';
      ctx.fillStyle = cfg.color || '#16241F';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (!meta || !meta.data) return;
        meta.data.forEach((el, i) => {
          const raw = ds.data[i];
          const num = Array.isArray(raw) ? raw[1] : raw;
          if (num == null || !isFinite(num)) return;
          let text;
          try { text = cfg.formatter ? cfg.formatter(raw, i) : String(num); } catch (e) { text = String(num); }
          if (text == null || text === '') return;
          if (chart.options.indexAxis === 'y') {
            ctx.textBaseline = 'middle';
            if (!Array.isArray(raw) && num < 0) { ctx.textAlign = 'right'; ctx.fillText(text, el.x - 6, el.y); }
            else { ctx.textAlign = 'left'; ctx.fillText(text, el.x + 6, el.y); }
          } else {
            ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
            ctx.fillText(text, el.x, el.y - 4);
          }
        });
      });
      ctx.restore();
    } catch (e) { /* never let labels break a chart */ }
  }
};
function chartBase() {
  return {
    responsive:true, maintainAspectRatio:false,
    animation: reduceMotion ? false : { duration:300 },
    plugins:{ legend:{ display:false } },
    scales:{ x:{ grid:{ color:CHART.grid }, ticks:{ color:CHART.ink, font:{ family:'Source Sans 3' } } },
             y:{ grid:{ color:CHART.grid }, ticks:{ color:CHART.ink, font:{ family:'Source Sans 3' } } } }
  };
}
function fillTable(id, rows) {
  const tb = $(id).querySelector('tbody'); tb.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');
    r.forEach(cell => { const td = document.createElement('td'); td.textContent = cell; tr.appendChild(td); });
    tb.appendChild(tr);
  });
}
function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const d = state.derived, cur = state.settings.currency, sp = d.support * 100;
  $('unit-bc').textContent = 'unit: ' + cur;

  /* Support vs no mandate */
  const optOut = 100 - sp;
  $('interp-support').textContent = 'Predicted public support is ' + sp.toFixed(0) + ' percent. The other ' + optOut.toFixed(0) + ' percent would prefer no mandate. This is the class-share-weighted latent-class estimate. Unit: percent of people.';
  upsert('support', $('chart-support'), {
    type:'bar',
    data:{ labels:['Support mandate','No mandate'], datasets:[{ data:[+sp.toFixed(1), +optOut.toFixed(1)],
      backgroundColor:[ supportLevel(sp)==='good'?CHART.good:supportLevel(sp)==='mid'?CHART.mid:CHART.bad, CHART.grey ], borderRadius:6 }] },
    options:{ ...chartBase(), scales:{ ...chartBase().scales, y:{ ...chartBase().scales.y, min:0, max:100, ticks:{ callback:v=>v+'%' } } },
      plugins:{ legend:{ display:false }, valueLabels:{ display:true, formatter:r=>r.toFixed(0)+'%' }, tooltip:{ callbacks:{ label:c=>c.parsed.y.toFixed(1)+' percent' } } } }
  });
  fillTable('tbl-support', [['Support mandate', sp.toFixed(0)+' percent'], ['No mandate', optOut.toFixed(0)+' percent']]);
  $('chart-support').setAttribute('aria-label', 'Bar chart. Support ' + sp.toFixed(0) + ' percent, no mandate ' + optOut.toFixed(0) + ' percent.');

  /* Benefit, cost, net */
  const vals = [d.benefit, d.costTotal, d.net];
  $('interp-bc').textContent = d.costTotal > 0
    ? 'Benefit ' + money(d.benefit,cur) + ' against cost ' + money(d.costTotal,cur) + ' leaves a net benefit of ' + money(d.net,cur) + '.'
    : 'Health benefit is ' + money(d.benefit,cur) + '. Add costs to show cost and net benefit. Unit: ' + cur + '.';
  upsert('bc', $('chart-bc'), {
    type:'bar',
    data:{ labels:['Benefit','Cost','Net'], datasets:[{ data:vals,
      backgroundColor:[CHART.good, CHART.bad, d.net>=0?CHART.primary:CHART.bad], borderRadius:6 }] },
    options:{ ...chartBase(), scales:{ ...chartBase().scales, y:{ ...chartBase().scales.y, ticks:{ callback:v=>moneyShort(v,cur) } } },
      plugins:{ legend:{ display:false }, valueLabels:{ display:true, formatter:r=>moneyShort(r,cur) }, tooltip:{ callbacks:{ label:c=>money(c.parsed.y,cur) } } } }
  });
  fillTable('tbl-bc', [['Benefit', money(d.benefit,cur)], ['Cost', d.costTotal>0?money(d.costTotal,cur):'Not entered'], ['Net benefit', money(d.net,cur)]]);
  $('chart-bc').setAttribute('aria-label', 'Bar chart. Benefit ' + money(d.benefit,cur) + ', cost ' + (d.costTotal>0?money(d.costTotal,cur):'not entered') + ', net ' + money(d.net,cur) + '.');

  /* Predicted support by preference class (LC class breakdown) */
  const lc = d.lc || computeSupportLC(state.config);
  const classes = lc.classBreakdown;
  const clsLabels = classes.map(c => capitalise(c.label) + ' class (' + (c.share * 100).toFixed(0) + '%)');
  clsLabels.push('Weighted support');
  const clsValues = classes.map(c => +(c.support * 100).toFixed(1));
  clsValues.push(+(lc.predictedSupport * 100).toFixed(1));
  const clsColors = classes.map(c => c.label === 'supporter' ? CHART.good : CHART.bad);
  clsColors.push(CHART.primary);
  $('interp-byclass').textContent = 'Support is estimated for each preference class, then averaged using each class share. '
    + classes.map(c => capitalise(c.label) + ' class ' + (c.support * 100).toFixed(0) + ' percent at a ' + (c.share * 100).toFixed(0) + ' percent share').join('; ')
    + '. Weighted support ' + (lc.predictedSupport * 100).toFixed(0) + ' percent. Unit: percent supporting.';
  upsert('byclass', $('chart-byclass'), {
    type:'bar',
    data:{ labels:clsLabels, datasets:[{ data:clsValues, backgroundColor:clsColors, borderRadius:5 }] },
    options:{ ...chartBase(), indexAxis:'y',
      scales:{ ...chartBase().scales, x:{ ...chartBase().scales.x, min:0, max:100, ticks:{ callback:v=>v+'%' } } },
      plugins:{ legend:{ display:false }, valueLabels:{ display:true, formatter:r=>r.toFixed(0)+'%' }, tooltip:{ callbacks:{ label:c=>c.parsed.x.toFixed(1)+' percent supporting' } } } }
  });
  fillTable('tbl-byclass',
    classes.map(c => [capitalise(c.label), (c.share * 100).toFixed(1) + ' percent', (c.support * 100).toFixed(1) + ' percent', (c.weightedContribution * 100).toFixed(1) + ' percent'])
      .concat([['Weighted total', '100.0 percent', (lc.predictedSupport * 100).toFixed(1) + ' percent', (lc.predictedSupport * 100).toFixed(1) + ' percent']]));
  $('chart-byclass').setAttribute('aria-label', 'Predicted support by preference class. ' + classes.map(c => capitalise(c.label) + ' ' + (c.support * 100).toFixed(0) + ' percent').join(', ') + '. Weighted ' + (lc.predictedSupport * 100).toFixed(0) + ' percent.');

  /* Tornado: needs costs. Hide the chart box entirely when empty so there is
     no zero-height canvas to mismanage. */
  const tor = computeTornado(state);
  const box = $('tornado-box'), empty = $('tornado-empty');
  if (tor.length) {
    $('interp-tornado').textContent = 'The input ' + tor[0].label.toLowerCase() + ' has the largest effect on the ratio. Longer bars change the ratio more. Unit: benefit to cost ratio.';
    box.style.display = ''; empty.style.display = 'none';
    upsert('tornado', $('chart-tornado'), {
      type:'bar',
      data:{ labels:tor.map(t=>t.label), datasets:[{ data:tor.map(t=>[+t.lo.toFixed(2), +t.hi.toFixed(2)]), backgroundColor:CHART.primary, borderRadius:4 }] },
      options:{ ...chartBase(), indexAxis:'y',
        plugins:{ legend:{ display:false }, valueLabels:{ display:true, formatter:r=>r[1].toFixed(2) }, tooltip:{ callbacks:{ label:c=>'Ratio ranges '+c.raw[0].toFixed(2)+' to '+c.raw[1].toFixed(2) } } } }
    });
    fillTable('tbl-tornado', tor.map(t=>[t.label, t.lo.toFixed(2), t.hi.toFixed(2)]));
  } else {
    $('interp-tornado').textContent = 'Add costs to see which inputs move the benefit to cost ratio most.';
    box.style.display = 'none'; empty.style.display = '';
    if (charts.tornado) { charts.tornado.destroy(); charts.tornado = null; }
    fillTable('tbl-tornado', [['Enter costs to see this', '', '']]);
  }
  $('chart-tornado').setAttribute('aria-label', tor.length ? 'Sensitivity chart with ' + tor.length + ' inputs.' : 'Sensitivity chart. Enter costs to populate.');

  /* Resize once the browser has settled the layout, so charts created during a
     synchronous render are sized correctly. */
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => { Object.keys(charts).forEach(k => { try { if (charts[k]) charts[k].resize(); } catch (e) {} }); });
  }
}

/* Create a chart once, then update it in place on later renders. Each chart is
   isolated: if one fails to build, the others still render, and the data table
   remains available as a fallback. */
function upsert(key, canvas, conf) {
  try {
    const ex = charts[key];
    if (ex) {
      ex.data = conf.data;
      ex.options = conf.options;
      ex.update(reduceMotion ? 'none' : undefined);
      return ex;
    }
    /* If a previous attempt left a chart attached to this canvas but our
       reference was lost, destroy it first so the canvas can be reused. */
    if (typeof Chart !== 'undefined' && Chart.getChart) {
      const orphan = Chart.getChart(canvas);
      if (orphan) orphan.destroy();
    }
    charts[key] = new Chart(canvas, conf);
    return charts[key];
  } catch (e) {
    console.warn('Chart "' + key + '" could not render; showing its data table instead.', e);
    try {
      const fig = canvas.closest('.chart-card');
      if (fig) { const t = fig.querySelector('.chart-data'); if (t) t.classList.add('shown'); }
    } catch (_) {}
    return null;
  }
}
function shorten(s, n) { return s.length > n ? s.slice(0, n-1) + '\u2026' : s; }
function capitalise(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

/* =======================================================================
   Live region announcements (throttled)
   ======================================================================= */
let announceTimer = null;
function announce() {
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    const d = state.derived;
    let msg = 'Predicted support ' + (d.support*100).toFixed(0) + ' percent. ';
    if (d.bcr != null) msg += 'Benefit to cost ratio ' + d.bcr.toFixed(2) + '. ';
    if (d.extrapolated) msg += 'Lives saved is outside the study range. ';
    $('live-results').textContent = msg;
  }, 600);
}

/* =======================================================================
   Presets
   ======================================================================= */
const PRESETS = {
  balanced: { country:'AU', outbreak:'mild', scope:'highrisk', exemptions:'medrel', coverage:0.7, lives:25 },
  strict:   { country:'AU', outbreak:'severe', scope:'all', exemptions:'medical', coverage:0.9, lives:30 },
  lenient:  { country:'AU', outbreak:'mild', scope:'highrisk', exemptions:'medrelpers', coverage:0.5, lives:18 }
};
function applyPreset(name) {
  const p = PRESETS[name]; if (!p) return;
  setChip('country-chips', p.country);
  setChip('outbreak-chips', p.outbreak);
  $('scope').value = p.scope;
  $('exemptions').value = p.exemptions;
  $('coverage').value = String(p.coverage);
  $('lives').value = p.lives; syncLivesOut();
  updateValueForMetric(p.country, $('metric').value);
  applyChanges();
  safeScroll($('results'), { behavior: reduceMotion ? 'auto' : 'smooth', block:'start' });
  toast('Example loaded. Change anything you like.', 'good');
}

/* =======================================================================
   Chips
   ======================================================================= */
function setChip(groupId, value) {
  $(groupId).querySelectorAll('[role="radio"]').forEach(b => {
    b.setAttribute('aria-checked', b.dataset.value === value ? 'true' : 'false');
  });
}
function initChipGroup(groupId, onChange) {
  const group = $(groupId);
  const radios = Array.from(group.querySelectorAll('[role="radio"]'));
  group.addEventListener('click', e => {
    const r = e.target.closest('[role="radio"]'); if (!r) return;
    setChip(groupId, r.dataset.value); onChange();
  });
  group.addEventListener('keydown', e => {
    const i = radios.indexOf(document.activeElement);
    if (i < 0) return;
    let j = i;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i+1) % radios.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i-1+radios.length) % radios.length;
    else return;
    e.preventDefault();
    radios[j].focus(); setChip(groupId, radios[j].dataset.value); onChange();
  });
}

/* =======================================================================
   Value per life sync when metric or country changes
   ======================================================================= */
function updateValueForMetric(country, metric) {
  const meta = metricMeta[metric];
  if (meta && meta.defaults[country] != null) $('value-per-life').value = meta.defaults[country];
  $('metric-note').textContent = meta ? meta.note : '';
}

/* =======================================================================
   Costs
   ======================================================================= */
function loadTypicalCosts() {
  const country = currentChip('country-chips');
  const base = COST_PER_MILLION[country];
  const mult = COST_OUTBREAK_MULT[currentChip('outbreak-chips')] || 1;
  const pop = Math.max(0, num($('population').value, 1000000));
  const horizon = Math.max(0.25, num($('horizon').value, 1));
  const scale = (pop/1000000) * horizon * mult;
  $('c-it').value = Math.round(base.it*scale);
  $('c-comms').value = Math.round(base.comms*scale);
  $('c-enf').value = Math.round(base.enf*scale);
  $('c-comp').value = Math.round(base.comp*scale);
  $('c-admin').value = Math.round(base.admin*scale);
  $('c-other').value = Math.round(base.other*scale);
  applyChanges();
  toast('Typical costs loaded for ' + COUNTRY_NAME[country] + '. Adjust as needed.', 'good');
}

/* =======================================================================
   Scenarios: save, compare, export
   ======================================================================= */
function saveScenario() {
  const d = computeDerived(state);
  const s = {
    id: Date.now(),
    config: { ...state.config },
    settings: { ...state.settings },
    costs: state.costs ? { ...state.costs } : null,
    derived: d
  };
  const fp = JSON.stringify([s.config, s.costs, s.settings.valuePerLife, s.settings.population]);
  if (state.scenarios.some(x => JSON.stringify([x.config, x.costs, x.settings.valuePerLife, x.settings.population]) === fp)) {
    toast('That exact option is already saved.', 'warn'); return;
  }
  state.scenarios.push(s);
  persistScenarios();
  renderCompare();
  toast('Option saved. See the Compare section.', 'good');
}
function renderCompare() {
  const empty = $('compare-empty'), body = $('compare-body');
  if (!state.scenarios.length) { empty.hidden = false; body.hidden = true; return; }
  empty.hidden = true; body.hidden = false;
  const tb = $('compare-table').querySelector('tbody'); tb.innerHTML = '';
  state.scenarios.forEach((s, i) => {
    const d = s.derived, cur = s.settings.currency;
    const tr = document.createElement('tr');
    if (d.extrapolated) tr.className = 'row-extrap';
    const cells = [
      'Option ' + (i+1),
      COUNTRY_NAME[s.config.country],
      capitalise(OUTBREAK_NAME[s.config.outbreak]),
      (d.support*100).toFixed(0) + '%',
      d.livesTotal.toFixed(0),
      moneyShort(d.benefit, cur),
      d.costTotal>0 ? moneyShort(d.costTotal, cur) : 'n/a',
      moneyShort(d.net, cur),
      d.bcr != null ? d.bcr.toFixed(2) : 'n/a'
    ];
    cells.forEach((c, idx) => { const td = document.createElement('td'); td.textContent = c; if (idx >= 3) td.className = 'num'; tr.appendChild(td); });
    const tdAct = document.createElement('td');
    const rm = document.createElement('button'); rm.className = 'mini-remove'; rm.type = 'button';
    rm.textContent = 'Remove'; rm.setAttribute('aria-label', 'Remove option ' + (i+1));
    rm.addEventListener('click', () => { state.scenarios.splice(i,1); persistScenarios(); renderCompare(); toast('Option removed.', 'warn'); });
    tdAct.appendChild(rm); tr.appendChild(tdAct);
    tb.appendChild(tr);
  });
}
function exportCSV() {
  if (!state.scenarios.length) { toast('Save an option first.', 'warn'); return; }
  const head = ['option','country','outbreak_scenario','scope','exemption_level','coverage_threshold','lives_saved_per_100k',
    'extrapolated','lives_total','hospitalisations','icu','working_days',
    'predicted_support_lc_percent','weighted_lc_support',
    'class1_label','class1_share','class1_support','class1_weighted_contribution',
    'class2_label','class2_share','class2_support','class2_weighted_contribution',
    'benefit','cost','net_benefit','bcr','currency'];
  const lines = [head.join(',')];
  state.scenarios.forEach((s, i) => {
    const d = s.derived, c = s.config;
    const lc = (d && d.lc) ? d.lc : computeSupportLC(c);
    const k1 = lc.classBreakdown[0], k2 = lc.classBreakdown[1];
    const supPct = (lc.predictedSupport * 100).toFixed(1);
    const row = [ 'Option '+(i+1), COUNTRY_NAME[c.country], OUTBREAK_NAME[c.outbreak], SCOPE_NAME[c.scope], EX_NAME[c.exemptions],
      Math.round(Number(c.coverage) * 100), c.lives, d.extrapolated?'yes':'no', d.livesTotal.toFixed(0), d.hosp, d.icu, d.work,
      supPct, lc.predictedSupport.toFixed(4),
      k1.label, k1.share.toFixed(5), k1.support.toFixed(4), k1.weightedContribution.toFixed(4),
      k2.label, k2.share.toFixed(5), k2.support.toFixed(4), k2.weightedContribution.toFixed(4),
      Math.round(d.benefit), Math.round(d.costTotal), Math.round(d.net), d.bcr!=null?d.bcr.toFixed(3):'', s.settings.currency ];
    lines.push(row.map(v => typeof v === 'string' && v.includes(',') ? '"'+v+'"' : v).join(','));
  });
  download(new Blob([lines.join('\n')], { type:'text/csv' }), 'emandeval-options.csv');
  toast('Spreadsheet downloaded.', 'good');
}
function exportWord() {
  if (!state.scenarios.length) { toast('Save an option first.', 'warn'); return; }
  const now = new Date().toLocaleString('en-GB');
  let h = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Mandate options briefing</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#16241F}h1{font-size:17pt}h2{font-size:13pt;margin-top:16pt}'
    + 'table{border-collapse:collapse;width:100%;margin:8pt 0;font-size:10pt}th,td{border:1px solid #b9c6c0;padding:5pt 7pt;text-align:left}'
    + 'th{background:#15564A;color:#fff}tr:nth-child(even) td{background:#f1f5f3}.flag{color:#B3261E;font-weight:bold}.meta{color:#62716A;font-size:9pt}</style></head><body>';
  h += '<h1>Vaccine mandate options briefing</h1>';
  h += '<p class="meta">Prepared with eMANDEVAL Future version ' + APP_VERSION + ' on ' + now + '. Predicted support is from a class-share-weighted two-class latent-class choice model. Figures are estimates of acceptability from stated preferences and simple cost benefit calculations, and are not a substitute for legal, ethical or political judgement.</p>';
  h += '<h2>Summary</h2><table><thead><tr><th>Option</th><th>Country</th><th>Outbreak</th><th>Support</th><th>Lives saved</th><th>Benefit</th><th>Cost</th><th>Net benefit</th><th>Ratio</th><th>Extrapolated</th></tr></thead><tbody>';
  state.scenarios.forEach((s, i) => {
    const d = s.derived, cur = s.settings.currency;
    h += '<tr><td>Option ' + (i+1) + '</td><td>' + COUNTRY_NAME[s.config.country] + '</td><td>' + capitalise(OUTBREAK_NAME[s.config.outbreak])
      + '</td><td>' + (d.support*100).toFixed(0) + '%</td><td>' + d.livesTotal.toFixed(0) + '</td><td>' + moneyShort(d.benefit,cur)
      + '</td><td>' + (d.costTotal>0?moneyShort(d.costTotal,cur):'n/a') + '</td><td>' + moneyShort(d.net,cur) + '</td><td>'
      + (d.bcr!=null?d.bcr.toFixed(2):'n/a') + '</td><td>' + (d.extrapolated?'Yes':'No') + '</td></tr>';
  });
  h += '</tbody></table>';
  state.scenarios.forEach((s, i) => {
    const d = s.derived, c = s.config, cur = s.settings.currency;
    h += '<h2>Option ' + (i+1) + ': ' + COUNTRY_NAME[c.country] + ', ' + OUTBREAK_NAME[c.outbreak] + '</h2>';
    h += '<p><strong>Design.</strong> Applies to ' + SCOPE_NAME[c.scope] + '. Opt out allowed for ' + EX_NAME[c.exemptions]
      + '. Lifted at ' + COV_NAME[String(c.coverage)] + '. Health benefit assumption ' + c.lives + ' lives per 100,000'
      + (d.extrapolated ? ' <span class="flag">(outside study range, extrapolated)</span>' : '') + '.</p>';
    h += '<p><strong>Results.</strong> Predicted public support ' + (d.support*100).toFixed(0) + ' percent. About ' + d.livesTotal.toFixed(0)
      + ' lives saved in a population of ' + s.settings.population.toLocaleString() + ', worth ' + money(d.benefit,cur) + '. ';
    h += (d.costTotal>0 ? 'Total cost ' + money(d.costTotal,cur) + ', net benefit ' + money(d.net,cur) + ', ratio ' + d.bcr.toFixed(2) + '.' : 'Costs not entered.') + '</p>';
    h += '<p class="meta">Other health effects, approximate: ' + d.hosp.toLocaleString() + ' hospital admissions avoided, '
      + d.icu.toLocaleString() + ' intensive care admissions avoided, ' + d.work.toLocaleString() + ' working days saved.</p>';
  });
  h += '<p class="meta">Read alongside fairness, feasibility and stakeholder views, which the numbers do not capture.</p>';
  h += '<hr><p class="meta">Developed by Mesfin Genie, Newcastle Business School, University of Newcastle, Australia. Questions: mesfin.genie@newcastle.edu.au. &copy; ' + new Date().getFullYear() + ' Mesfin Genie. All rights reserved.</p></body></html>';
  download(new Blob([h], { type:'application/msword' }), 'emandeval-briefing.doc');
  toast('Briefing document downloaded.', 'good');
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function copySummary() {
  const cfg = state.config, d = state.derived, cur = state.settings.currency;
  const text =
    'Vaccine mandate option summary\n' +
    'Country: ' + COUNTRY_NAME[cfg.country] + '. Situation: ' + OUTBREAK_NAME[cfg.outbreak] + '.\n' +
    'Design: ' + SCOPE_NAME[cfg.scope] + '. Opt out: ' + EX_NAME[cfg.exemptions] + '. Lifted at ' + COV_NAME[String(cfg.coverage)] + '.\n' +
    'Health benefit assumption: ' + cfg.lives + ' lives per 100,000' + (d.extrapolated ? ' (outside study range, extrapolated)' : '') + '.\n' +
    'Predicted public support: ' + (d.support*100).toFixed(0) + ' percent.\n' +
    'Lives saved: about ' + d.livesTotal.toFixed(0) + ', worth ' + money(d.benefit,cur) + '.\n' +
    (d.bcr != null ? 'Cost: ' + money(d.costTotal,cur) + '. Net benefit: ' + money(d.net,cur) + '. Ratio: ' + d.bcr.toFixed(2) + '.\n' : 'Costs not entered.\n') +
    'Read alongside fairness, feasibility and legal advice.';
  copyText(text, 'Summary copied to the clipboard.');
}
function shareLink() {
  const cfg = state.config, set = state.settings;
  const p = new URLSearchParams({
    country:cfg.country, outbreak:cfg.outbreak, scope:cfg.scope, exemptions:cfg.exemptions,
    coverage:String(cfg.coverage), lives:String(cfg.lives), pop:String(set.population), horizon:String(set.horizon),
    metric:set.metric, value:String(set.valuePerLife)
  });
  if (state.costs) p.set('costs', [state.costs.it,state.costs.comms,state.costs.enf,state.costs.comp,state.costs.admin,state.costs.other].join('-'));
  const url = window.location.href.split('#')[0] + '#' + p.toString();
  copyText(url, 'Share link copied. Anyone who opens it sees this exact option.');
}
function copyText(text, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg, 'good'), () => fallbackCopy(text, okMsg));
  } else fallbackCopy(text, okMsg);
}
function fallbackCopy(text, okMsg) {
  const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
  ta.select(); try { document.execCommand('copy'); toast(okMsg, 'good'); } catch (e) { toast('Copy failed. Select and copy manually.', 'bad'); }
  document.body.removeChild(ta);
}
function decodeShare() {
  if (!window.location.hash || window.location.hash.length < 2) return false;
  const p = new URLSearchParams(window.location.hash.slice(1));
  if (!p.has('country')) return false;
  setChip('country-chips', p.get('country'));
  setChip('outbreak-chips', p.get('outbreak'));
  $('scope').value = p.get('scope') || 'highrisk';
  $('exemptions').value = p.get('exemptions') || 'medical';
  $('coverage').value = p.get('coverage') || '0.5';
  $('lives').value = p.get('lives') || '25'; syncLivesOut();
  $('population').value = p.get('pop') || '1000000';
  $('horizon').value = p.get('horizon') || '1';
  if (p.has('metric')) $('metric').value = p.get('metric');
  if (p.has('value')) $('value-per-life').value = p.get('value');
  if (p.has('costs')) {
    const [it,comms,enf,comp,admin,other] = p.get('costs').split('-');
    $('c-it').value=it; $('c-comms').value=comms; $('c-enf').value=enf; $('c-comp').value=comp; $('c-admin').value=admin; $('c-other').value=other;
    $('tour-costs').open = true;
  }
  $('metric-note').textContent = metricMeta[$('metric').value] ? metricMeta[$('metric').value].note : '';
  return true;
}

/* =======================================================================
   Per chart tools: data table toggle, image export, data export
   ======================================================================= */
const CHART_KEYS = {
  support: { table:'tbl-support', name:'support' },
  bc:      { table:'tbl-bc', name:'benefit-cost' },
  byclass: { table:'tbl-byclass', name:'support-by-class' },
  tornado: { table:'tbl-tornado', name:'sensitivity' }
};
function initChartTools() {
  document.querySelectorAll('.chart-card').forEach(fig => {
    const key = fig.dataset.chart;
    const tools = fig.querySelector('.chart-tools');
    if (!tools) return;
    tools.addEventListener('click', e => {
      const btn = e.target.closest('.chart-tool'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'table') toggleChartTable(fig, btn);
      else if (act === 'png') exportChartImage(key);
      else if (act === 'csv') exportChartData(key);
    });
  });
}
function toggleChartTable(fig, btn) {
  const tbl = fig.querySelector('.chart-data');
  const show = !tbl.classList.contains('shown');
  tbl.classList.toggle('shown', show);
  btn.textContent = show ? 'Hide data table' : 'Show data table';
  btn.setAttribute('aria-expanded', String(show));
}
function exportChartImage(key) {
  const ch = charts[key];
  if (!ch) { toast('This chart has no data to export yet.', 'warn'); return; }
  const a = document.createElement('a');
  a.href = ch.toBase64Image('image/png', 1);
  a.download = 'emandeval-' + CHART_KEYS[key].name + '.png';
  a.click();
  toast('Chart image downloaded.', 'good');
}
function exportChartData(key) {
  const tbl = $(CHART_KEYS[key].table);
  const rows = Array.from(tbl.querySelectorAll('tr')).map(tr =>
    Array.from(tr.children).map(c => { const t = c.textContent.trim(); return t.includes(',') ? '"' + t + '"' : t; }).join(',')
  );
  download(new Blob([rows.join('\n')], { type:'text/csv' }), 'emandeval-' + CHART_KEYS[key].name + '.csv');
  toast('Chart data downloaded.', 'good');
}

/* =======================================================================
   Policy report prompt builder (ChatGPT, Copilot, Gemini)
   ======================================================================= */
function reportStyle() {
  const el = $('report-style').querySelector('[aria-checked="true"]');
  return el ? el.dataset.value : 'brief';
}
function scenarioBlock(label, s) {
  const d = s.derived || computeDerived(s), c = s.config, cur = s.settings.currency;
  const lc = (d && d.lc) ? d.lc : computeSupportLC(c);
  const classLine = 'Class-share-weighted latent-class support, by class: '
    + lc.classBreakdown.map(cl => capitalise(cl.label) + ' ' + (cl.support * 100).toFixed(1) + ' percent at a ' + (cl.share * 100).toFixed(1) + ' percent share').join('; ') + '.';
  return [
    label,
    'Country: ' + COUNTRY_NAME[c.country] + '. Situation: ' + OUTBREAK_NAME[c.outbreak] + '.',
    'Design: ' + SCOPE_NAME[c.scope] + '; opt out ' + EX_NAME[c.exemptions] + '; lifted at ' + COV_NAME[String(c.coverage)] + '.',
    'Lives saved assumption: ' + c.lives + ' per 100,000' + (d.extrapolated ? ' (outside study range, extrapolated)' : '') + '.',
    'Predicted public support: ' + (d.support * 100).toFixed(1) + ' percent.',
    classLine,
    'Lives saved: about ' + d.livesTotal.toFixed(0) + ', valued at ' + money(d.benefit, cur) + '.',
    (d.bcr != null
      ? 'Total cost: ' + money(d.costTotal, cur) + '; net benefit: ' + money(d.net, cur) + '; benefit to cost ratio: ' + d.bcr.toFixed(2) + '.'
      : 'Costs not entered.')
  ].join('\n');
}
function buildReportPrompt() {
  const style = reportStyle();
  let intro, ask;
  if (style === 'brief') {
    intro = 'You are helping a public health policy adviser. Using only the figures below, write a short policy brief of about 400 words.';
    ask = 'Structure: a one sentence bottom line, then short paragraphs on public support, health benefits, costs and value for money, and risks and caveats. Plain, neutral, government style. Do not invent numbers.';
  } else if (style === 'detailed') {
    intro = 'You are helping a public health policy adviser. Using only the figures below, write a detailed policy brief of about 900 words.';
    ask = 'Use these headings: Bottom line; Background; Public support; Health benefits; Costs and value for money; Sensitivity and uncertainty; Equity and feasibility to check; Options; Caveats. Plain, neutral, government style. Do not invent numbers.';
  } else {
    intro = 'You are helping a public health policy adviser. Using only the figures below, write a comparison memo of about 700 words weighing the saved options against each other.';
    ask = 'Structure: a one paragraph summary, a clear comparison of the options on support, lives saved, cost and ratio, then a balanced discussion of trade offs and what to check before deciding. Plain, neutral, government style. Do not invent numbers.';
  }
  let body = 'Current option:\n' + scenarioBlock('Current option', { config:state.config, settings:state.settings, costs:state.costs, derived:state.derived });
  if (state.scenarios.length) {
    body += '\n\nSaved options:\n' + state.scenarios.map((s, i) => scenarioBlock('Option ' + (i + 1), s)).join('\n\n');
  }
  const caveats = 'Context for the writer: predicted support is based on a class-share-weighted two-class latent-class choice model. For each policy it estimates support within each preference class, then averages using the estimated class shares for the selected country and outbreak. These are estimates of acceptability from stated preferences, not forecasts of behaviour or compliance. The benefit to cost ratio depends on the value placed on each life saved and on the cost assumptions. Figures marked as extrapolated are outside the original study range of 10 to 40 lives per 100,000. This tool does not assess legal, ethical, fairness or political questions, so flag those as needing separate advice.';
  return [intro, '', ask, '', body, '', caveats].join('\n');
}
function updateReportPrompt() {
  const ta = $('report-prompt'); if (!ta) return;
  ta.value = buildReportPrompt();
}
function openAssistant(which) {
  const text = $('report-prompt').value;
  copyText(text, 'Prompt copied. Paste it into the chat if it is not already there, then send.');
  const urls = {
    chatgpt: 'https://chatgpt.com/?q=' + encodeURIComponent(text),
    copilot: 'https://copilot.microsoft.com/',
    gemini:  'https://gemini.google.com/app'
  };
  let url = urls[which] || urls.chatgpt;
  if (which === 'chatgpt' && url.length > 1900) url = 'https://chatgpt.com/';
  window.open(url, '_blank', 'noopener');
}


const LS_SCENARIOS = 'emandeval_v4_scenarios';
const LS_WORKING = 'emandeval_v4_working';
const LS_PREFS = 'emandeval_v4_prefs';
let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  $('save-state').textContent = 'Saving';
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(LS_WORKING, JSON.stringify(readWorking())); $('save-state').textContent = 'All changes saved'; }
    catch (e) { $('save-state').textContent = ''; }
  }, 500);
}
function readWorking() {
  return {
    country:currentChip('country-chips'), outbreak:currentChip('outbreak-chips'),
    scope:$('scope').value, exemptions:$('exemptions').value, coverage:$('coverage').value, lives:$('lives').value,
    population:$('population').value, horizon:$('horizon').value, metric:$('metric').value, value:$('value-per-life').value,
    c:{ it:$('c-it').value, comms:$('c-comms').value, enf:$('c-enf').value, comp:$('c-comp').value, admin:$('c-admin').value, other:$('c-other').value }
  };
}
function restoreWorking() {
  let w; try { w = JSON.parse(localStorage.getItem(LS_WORKING) || 'null'); } catch (e) { w = null; }
  if (!w) return false;
  setChip('country-chips', w.country); setChip('outbreak-chips', w.outbreak);
  $('scope').value = w.scope; $('exemptions').value = w.exemptions; $('coverage').value = w.coverage;
  $('lives').value = w.lives; syncLivesOut();
  $('population').value = w.population; $('horizon').value = w.horizon; $('metric').value = w.metric; $('value-per-life').value = w.value;
  if (w.c) { $('c-it').value=w.c.it; $('c-comms').value=w.c.comms; $('c-enf').value=w.c.enf; $('c-comp').value=w.c.comp; $('c-admin').value=w.c.admin; $('c-other').value=w.c.other; }
  $('metric-note').textContent = metricMeta[w.metric] ? metricMeta[w.metric].note : '';
  return true;
}
function persistScenarios() { try { localStorage.setItem(LS_SCENARIOS, JSON.stringify(state.scenarios)); } catch (e) {} }
function loadScenarios() { try { const r = JSON.parse(localStorage.getItem(LS_SCENARIOS) || '[]'); if (Array.isArray(r)) state.scenarios = r; } catch (e) {} }

/* =======================================================================
   Preferences: text size and contrast
   ======================================================================= */
function loadPrefs() {
  let p; try { p = JSON.parse(localStorage.getItem(LS_PREFS) || 'null'); } catch (e) { p = null; }
  if (!p) return;
  if (p.text) document.body.dataset.text = p.text;
  if (p.contrast) { document.body.dataset.contrast = 'high'; $('contrast-toggle').setAttribute('aria-pressed', 'true'); }
}
function savePrefs() {
  try { localStorage.setItem(LS_PREFS, JSON.stringify({ text:document.body.dataset.text, contrast:document.body.dataset.contrast === 'high' })); } catch (e) {}
}
const TEXT_STEPS = ['s','m','l','xl'];
function changeText(dir) {
  let i = TEXT_STEPS.indexOf(document.body.dataset.text || 'm');
  i = Math.min(TEXT_STEPS.length-1, Math.max(0, i + dir));
  document.body.dataset.text = TEXT_STEPS[i];
  savePrefs();
}

/* =======================================================================
   Tooltips / help dots
   ======================================================================= */
let activeHelp = null;
function initHelp() {
  const tip = $('tooltip');
  document.addEventListener('click', e => {
    const btn = e.target.closest('.help-dot');
    if (btn) {
      e.preventDefault();
      if (activeHelp === btn) { hideTip(); return; }
      showTip(btn, btn.dataset.help); activeHelp = btn; return;
    }
    if (!e.target.closest('#tooltip')) hideTip();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, { passive:true });
  function showTip(el, text) {
    tip.textContent = text; tip.hidden = false;
    const r = el.getBoundingClientRect();
    let top = r.bottom + 8, left = r.left;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    if (left + tw > window.innerWidth - 12) left = window.innerWidth - tw - 12;
    if (top + th > window.innerHeight - 12) top = r.top - th - 8;
    tip.style.left = Math.max(8, left) + 'px';
    tip.style.top = Math.max(8, top) + 'px';
  }
  function hideTip() { tip.hidden = true; activeHelp = null; }
  window._hideTip = hideTip;
}

/* =======================================================================
   Glossary modal with focus trap
   ======================================================================= */
let lastFocus = null;
function openModal(id) {
  const m = $(id); lastFocus = document.activeElement; m.hidden = false;
  const focusables = m.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])');
  if (focusables.length) focusables[0].focus();
  m._trap = e => {
    if (e.key === 'Escape') { closeModal(id); return; }
    if (e.key !== 'Tab') return;
    const f = Array.from(m.querySelectorAll('button, a[href], [tabindex]:not([tabindex="-1"])')).filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length-1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', m._trap);
}
function closeModal(id) {
  const m = $(id); m.hidden = true;
  document.removeEventListener('keydown', m._trap);
  if (lastFocus) lastFocus.focus();
}

/* =======================================================================
   Guided tour
   ======================================================================= */
const TOUR_STEPS = [
  { el:null, title:'Welcome', body:'This short tour shows the main parts of the tool. Use Next and Back, or the arrow keys. Press Escape to leave at any time.' },
  { el:'tour-design', title:'Build the mandate', body:'Choose who the mandate covers, who can opt out, and when it lifts. The slider sets the expected lives saved.' },
  { el:'tour-apply', title:'Apply your choices', body:'When you are happy with the design, select Apply and view results. The figures update and you move to the results. A reminder appears whenever you have changes waiting.' },
  { el:'tour-support', title:'Read public support', body:'The meter shows how many people would support the mandate. It uses words and a marker, not colour alone. High is green, moderate is amber, low is red.' },
  { el:'tour-costs', title:'Add costs when ready', body:'Costs are optional. Add them to see net benefit and the benefit to cost ratio. You can load typical figures with one click.' },
  { el:'compare', title:'Save and compare', body:'Save options and compare them side by side, then download a spreadsheet or a briefing document.' },
  { el:'report', title:'Draft a report', body:'Build a ready to send prompt from your figures and open it in ChatGPT, Copilot or Gemini to draft a policy brief.' }
];
let tourIndex = 0;
function startTour() {
  tourIndex = 0; $('tour').hidden = false; document.addEventListener('keydown', tourKeys); showTourStep();
}
function endTour() {
  $('tour').hidden = true; clearSpotlight(); document.removeEventListener('keydown', tourKeys);
  $('tour-start').focus();
}
function tourKeys(e) {
  if (e.key === 'Escape') { e.preventDefault(); endTour(); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nextTour(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); prevTour(); }
}
function clearSpotlight() { document.querySelectorAll('.tour-spotlight').forEach(x => x.classList.remove('tour-spotlight')); }
function showTourStep() {
  const step = TOUR_STEPS[tourIndex];
  $('tour-step').textContent = 'Step ' + (tourIndex + 1) + ' of ' + TOUR_STEPS.length;
  $('tour-title').textContent = step.title;
  $('tour-body').textContent = step.body;
  $('tour-back').style.visibility = tourIndex === 0 ? 'hidden' : 'visible';
  $('tour-next').textContent = tourIndex === TOUR_STEPS.length - 1 ? 'Finish' : 'Next';
  clearSpotlight();
  const pop = document.querySelector('.tour-pop');
  pop.style.transform = 'none';
  if (step.el && $(step.el)) {
    const target = $(step.el);
    target.classList.add('tour-spotlight');
    safeScroll(target, { behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    /* Position after the scroll settles. Re run a couple of times so the box
       lands correctly even with smooth scrolling. */
    const place = () => positionPop(pop, target);
    setTimeout(place, reduceMotion ? 0 : 320);
    setTimeout(place, reduceMotion ? 20 : 460);
  } else {
    centrePop(pop);
  }
  pop.focus();
}
function centrePop(pop) {
  pop.style.left = '50%'; pop.style.top = '50%'; pop.style.transform = 'translate(-50%, -50%)';
}
function positionPop(pop, target) {
  const r = target.getBoundingClientRect();
  pop.style.transform = 'none';
  const pw = pop.offsetWidth, ph = pop.offsetHeight, m = 14;
  let top = r.bottom + 12, left = r.left;
  /* Prefer below the target; if it would go off the bottom, place above; if the
     target is taller than the viewport, just pin near the top. */
  if (top + ph > window.innerHeight - m) {
    if (r.top - ph - 12 > m) top = r.top - ph - 12;
    else top = m;
  }
  if (left + pw > window.innerWidth - m) left = window.innerWidth - pw - m;
  pop.style.left = Math.max(m, left) + 'px';
  pop.style.top = Math.max(m, top) + 'px';
}
function nextTour() { if (tourIndex < TOUR_STEPS.length - 1) { tourIndex++; showTourStep(); } else endTour(); }
function prevTour() { if (tourIndex > 0) { tourIndex--; showTourStep(); } }

/* =======================================================================
   Toasts
   ======================================================================= */
function toast(msg, kind) {
  const wrap = $('toasts');
  const t = document.createElement('div');
  t.className = 'toast' + (kind ? ' ' + kind : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3800);
}

/* =======================================================================
   Reset
   ======================================================================= */
function resetAll() {
  setChip('country-chips', 'AU'); setChip('outbreak-chips', 'mild');
  $('scope').value = 'highrisk'; $('exemptions').value = 'medical'; $('coverage').value = '0.5';
  $('lives').value = 25; syncLivesOut();
  $('population').value = 1000000; $('horizon').value = 1; $('metric').value = 'vsl'; $('value-per-life').value = 5400000;
  ['c-it','c-comms','c-enf','c-comp','c-admin','c-other'].forEach(id => $(id).value = 0);
  $('metric-note').textContent = metricMeta.vsl.note;
  applyChanges();
  toast('Reset to default values.', 'good');
}

/* =======================================================================
   Slider output sync
   ======================================================================= */
function syncLivesOut() {
  const v = $('lives').value;
  $('lives-out').textContent = v;
  $('lives').setAttribute('aria-valuetext', v + ' lives per 100,000');
}

/* =======================================================================
   Scroll spy for subnav and mobile bar
   ======================================================================= */
function initScrollSpy() {
  const ids = ['overview','build','results','compare','report','method'];
  const sections = ids.map(id => $(id)).filter(Boolean);
  const setCurrent = id => {
    document.querySelectorAll('.subnav-link').forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === '#' + id));
    document.querySelectorAll('.mb-link').forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === '#' + id));
  };
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) setCurrent(e.target.id); });
    }, { rootMargin:'-45% 0px -50% 0px' });
    sections.forEach(s => obs.observe(s));
  }
}

/* =======================================================================
   Wire up
   ======================================================================= */
let _initDone = false;
function init() {
  if (_initDone) return;
  _initDone = true;
  if (typeof Chart !== 'undefined') Chart.register(valueLabelsPlugin);

  /* Inputs mark the build as changed; results update only on Apply. */
  initChipGroup('country-chips', () => {
    updateValueForMetric(currentChip('country-chips'), $('metric').value);
    markDirty();
  });
  initChipGroup('outbreak-chips', markDirty);

  ['scope','exemptions','coverage','population','horizon','value-per-life',
   'c-it','c-comms','c-enf','c-comp','c-admin','c-other'].forEach(id => {
    $(id).addEventListener('input', markDirty);
    $(id).addEventListener('change', markDirty);
  });
  $('metric').addEventListener('change', () => {
    updateValueForMetric(currentChip('country-chips'), $('metric').value);
    markDirty();
  });
  $('lives').addEventListener('input', () => { syncLivesOut(); markDirty(); });

  $('apply-btn').addEventListener('click', onApplyClick);
  $('apply-banner-btn').addEventListener('click', onApplyClick);

  $('load-costs').addEventListener('click', () => { $('tour-costs').open = true; loadTypicalCosts(); });
  $('reset-all').addEventListener('click', resetAll);
  $('save-scenario').addEventListener('click', () => { saveScenario(); updateReportPrompt(); });
  $('copy-summary').addEventListener('click', copySummary);
  $('share-link').addEventListener('click', shareLink);
  $('print-results').addEventListener('click', () => window.print());
  $('export-csv').addEventListener('click', exportCSV);
  $('export-word').addEventListener('click', exportWord);
  $('clear-scenarios').addEventListener('click', () => {
    if (!state.scenarios.length) return;
    state.scenarios = []; persistScenarios(); renderCompare(); updateReportPrompt(); toast('All saved options cleared.', 'warn');
  });

  document.querySelectorAll('.preset').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));

  /* Report */
  initChipGroup('report-style', updateReportPrompt);
  $('report-copy').addEventListener('click', () => copyText($('report-prompt').value, 'Prompt copied to the clipboard.'));
  $('report-chatgpt').addEventListener('click', () => openAssistant('chatgpt'));
  $('report-copilot').addEventListener('click', () => openAssistant('copilot'));
  $('report-gemini').addEventListener('click', () => openAssistant('gemini'));

  $('text-inc').addEventListener('click', () => changeText(1));
  $('text-dec').addEventListener('click', () => changeText(-1));
  $('contrast-toggle').addEventListener('click', () => {
    const on = document.body.dataset.contrast === 'high';
    if (on) delete document.body.dataset.contrast; else document.body.dataset.contrast = 'high';
    $('contrast-toggle').setAttribute('aria-pressed', String(!on));
    savePrefs();
    if (state.derived) renderCharts();
  });

  $('tour-start').addEventListener('click', startTour);
  $('overview-tour').addEventListener('click', startTour);
  $('tour-next').addEventListener('click', nextTour);
  $('tour-back').addEventListener('click', prevTour);
  $('tour-skip').addEventListener('click', endTour);

  $('open-glossary').addEventListener('click', () => openModal('glossary'));
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => closeModal('glossary')));

  initHelp();
  initScrollSpy();
  initChartTools();

  loadPrefs();
  loadScenarios();
  renderCompare();

  const fromShare = decodeShare();
  if (!fromShare) restoreWorking();

  updateValueForMetric(currentChip('country-chips'), $('metric').value);
  syncLivesOut();
  applyChanges();   /* compute and show results for the starting configuration */

  /* Set the year, and re-render charts once the window and fonts have fully
     loaded, so sizing is correct even on slow connections. */
  const yr = $('footer-year'); if (yr) yr.textContent = String(new Date().getFullYear());
  const reflow = () => { if (state.derived) { try { renderCharts(); } catch (e) {} } };
  window.addEventListener('load', reflow);
  if (document.fonts && document.fonts.ready && typeof document.fonts.ready.then === 'function') {
    document.fonts.ready.then(reflow).catch(() => {});
  }
}
document.addEventListener('DOMContentLoaded', init);
