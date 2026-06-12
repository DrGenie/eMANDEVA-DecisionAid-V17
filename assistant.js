'use strict';

/* =======================================================================
   eMANDEVAL Future - AI Policy Assistant (frontend)
   -----------------------------------------------------------------------
   A real LLM-powered assistant. The browser NEVER talks to Gemini directly
   and NEVER holds an API key. It calls only your Cloudflare Worker, which
   holds the key as a secret and calls Gemini server side:

     GitHub Pages (this file)  ->  Cloudflare Worker  ->  Gemini API

   FREE TIER NOTE: this is designed to run at no direct cost for prototype
   and low usage using free tier services. Free tier quotas, model
   availability and provider terms may change, and public or high traffic
   use may later require paid hosting or paid model access.
   ======================================================================= */

/* ----------------------------------------------------------------------
   CONFIGURE ME: after you deploy the Worker (see README_DEPLOY_CHATBOT.md),
   paste its URL here. This is the only value you need to change in the
   frontend. It must end with /api/emandeval-chat.
   ---------------------------------------------------------------------- */
const CHATBOT_WORKER_URL = "https://emandeval-chat.drgenie.workers.dev/api/emandeval-chat";

/* Session safety limit: keeps usage inside free tier limits. */
const ASSISTANT_SESSION_LIMIT = 20;

const MODEL_TYPE_LABEL = 'Class-share-weighted two-class latent-class model';

/* Has the Worker URL actually been set, or is it still the placeholder? */
function assistantConfigured() {
  return typeof CHATBOT_WORKER_URL === 'string' && CHATBOT_WORKER_URL.indexOf('YOUR-WORKER-SUBDOMAIN') === -1;
}

/* small rounding helpers */
function r1(x) { return (x == null || !isFinite(x)) ? null : Math.round(x * 10) / 10; }
function r2(x) { return (x == null || !isFinite(x)) ? null : Math.round(x * 100) / 100; }

/* =======================================================================
   getCurrentToolStateForAssistant
   Reads the live tool state every time it is called. Uses the existing
   global state and the existing LC support function from app.js. Missing
   values are returned as null so the assistant can say they are missing.
   ======================================================================= */
function getCurrentToolStateForAssistant() {
  if (typeof state === 'undefined' || !state) return null;
  const c = state.config || {};
  const set = state.settings || {};
  const d = state.derived || null;

  const cName = (typeof COUNTRY_NAME !== 'undefined') ? COUNTRY_NAME : {};
  const oName = (typeof OUTBREAK_NAME !== 'undefined') ? OUTBREAK_NAME : {};
  const sName = (typeof SCOPE_NAME !== 'undefined') ? SCOPE_NAME : {};
  const eName = (typeof EX_NAME !== 'undefined') ? EX_NAME : {};

  /* Prefer the already computed class breakdown; recompute if needed. */
  let lc = d && d.lc ? d.lc : null;
  if (!lc && typeof computeSupportLC === 'function' && c.country) {
    try { lc = computeSupportLC(c); } catch (e) { lc = null; }
  }

  const classBreakdown = lc ? lc.classBreakdown.map(k => ({
    label: k.label,
    sharePercent: r1(k.share * 100),
    supportPercent: r1(k.support * 100),
    weightedContributionPercent: r1(k.weightedContribution * 100)
  })) : [];

  const predictedSupportPercent = lc ? r1(lc.predictedSupport * 100)
    : (d && d.support != null ? r1(d.support * 100) : null);

  const benefitCost = d ? {
    populationCovered: set.population != null ? set.population : null,
    livesSaved: d.livesTotal != null ? Math.round(d.livesTotal) : null,
    valuePerLifeSaved: set.valuePerLife != null ? set.valuePerLife : null,
    grossBenefit: d.benefit != null ? Math.round(d.benefit) : null,
    totalCost: (d.costTotal != null && d.costTotal > 0) ? Math.round(d.costTotal) : null,
    netBenefit: (d.costTotal != null && d.costTotal > 0) ? Math.round(d.net) : null,
    benefitCostRatio: d.bcr != null ? r2(d.bcr) : null,
    currency: set.currency || null
  } : null;

  const savedOptions = (state.scenarios || []).map((s, i) => {
    const sc = s.config || {};
    let slc = (s.derived && s.derived.lc) ? s.derived.lc : null;
    if (!slc && typeof computeSupportLC === 'function' && sc.country) {
      try { slc = computeSupportLC(sc); } catch (e) { slc = null; }
    }
    return {
      label: 'Option ' + (i + 1),
      country: cName[sc.country] || sc.country || null,
      outbreakScenario: oName[sc.outbreak] || sc.outbreak || null,
      scope: sName[sc.scope] || sc.scope || null,
      exemptions: eName[sc.exemptions] || sc.exemptions || null,
      coverageThreshold: sc.coverage != null ? Math.round(Number(sc.coverage) * 100) : null,
      livesSavedPer100k: sc.lives != null ? sc.lives : null,
      predictedSupportPercent: slc ? r1(slc.predictedSupport * 100) : null,
      benefitCostRatio: (s.derived && s.derived.bcr != null) ? r2(s.derived.bcr) : null,
      netBenefit: (s.derived && s.derived.costTotal > 0) ? Math.round(s.derived.net) : null
    };
  });

  const warnings = [];
  if (d && d.extrapolated) warnings.push('Lives saved value is outside the study design range of 10 to 40 per 100,000, so the support estimate is an extrapolation.');
  if (d && (d.costTotal == null || d.costTotal === 0)) warnings.push('Costs have not been entered, so cost, net benefit and the benefit to cost ratio are not available.');

  return {
    country: cName[c.country] || c.country || null,
    outbreakScenario: oName[c.outbreak] || c.outbreak || null,
    scope: sName[c.scope] || c.scope || null,
    exemptions: eName[c.exemptions] || c.exemptions || null,
    coverageThreshold: c.coverage != null ? Math.round(Number(c.coverage) * 100) : null,
    livesSavedPer100k: c.lives != null ? c.lives : null,
    predictedSupportPercent: predictedSupportPercent,
    modelType: MODEL_TYPE_LABEL,
    classBreakdown: classBreakdown,
    benefitCost: benefitCost,
    savedOptions: savedOptions,
    warnings: warnings,
    assumptions: {
      predictionIsStatedPreference: true,
      notActualUptake: true,
      notActualCompliance: true,
      notCausalEffect: true,
      policyAAscExcluded: true,
      livesSavedDesignRange: '10 to 40 per 100,000',
      classPredictionType: 'Class-share-weighted, not individual covariate-specific posterior class probabilities'
    }
  };
}
/* Expose for debugging and reuse. */
if (typeof window !== 'undefined') window.getCurrentToolStateForAssistant = getCurrentToolStateForAssistant;

/* =======================================================================
   Quick-action prompts. The button sends this text as the question.
   ======================================================================= */
const ASSISTANT_QUICK_PROMPTS = {
  explain_result: 'Explain the current result in plain policy language in no more than 250 words. Include predicted support, class breakdown, key assumptions and one practical next step.',
  improve_support: 'Suggest practical ways to improve predicted public support for the current policy. Use only the current tool state. Keep the answer under 250 words.',
  draft_briefing: 'Draft one concise policy briefing paragraph using the current result. Mention stated-preference evidence, predicted support, class interpretation, benefit-cost result if available, and recommended next checks.',
  explain_public: 'Explain the current result for the general public in plain language. Keep it short. Explain that this is predicted stated-preference support, not actual uptake or compliance.',
  identify_risks: 'List the main policy, ethical, implementation, communication and interpretation risks for the current policy. Use short bullets only.',
  compare_saved: 'Compare saved policy options using predicted support, benefit-cost ratio and net benefit. If no saved options exist, say saved options are needed first. Keep it concise.',
  explain_lc: 'Explain the two-class latent-class support model in simple language. Explain supporter and resister classes and why this is not actual uptake.',
  list_assumptions: 'List the key assumptions and limitations of the current result in short bullets.'
};

/* Short, friendly label shown in the chat for each quick action (the full
   prompt above is what is actually sent to the model). */
const ASSISTANT_QUICK_LABELS = {
  explain_result: 'Explain this result',
  improve_support: 'How can support be improved?',
  draft_briefing: 'Draft a policy briefing',
  explain_public: 'Explain this for the public',
  identify_risks: 'Identify the risks',
  compare_saved: 'Compare saved options',
  explain_lc: 'Explain the LC model',
  list_assumptions: 'List assumptions and limitations'
};

/* =======================================================================
   askPolicyAssistant: calls the Worker, returns the answer text.
   ======================================================================= */
async function askPolicyAssistant(question, actionType = 'free_text') {
  const toolState = getCurrentToolStateForAssistant();
  if (!toolState) {
    throw new Error('The current tool state is not available yet. Apply a design in the tool first, then ask again.');
  }

  /* Client side timeout so a hung request does not spin forever. */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 32000);

  let response;
  try {
    response = await fetch(CHATBOT_WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: question, actionType: actionType, toolState: toolState }),
      signal: controller.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') throw new Error('The request timed out. Please try a shorter question.');
    throw new Error('Could not reach the assistant service. This is usually a network connection or CORS issue.');
  }
  clearTimeout(timer);

  let data = {};
  try {
    data = await response.json();
  } catch (e) {
    throw new Error('The assistant returned an unreadable response (HTTP ' + response.status + ').');
  }

  /* Surface the real, specific backend message and code. */
  if (!response.ok || data.ok === false) {
    const baseMsg = data.message || data.error || ('Request failed with HTTP ' + response.status + '.');
    const code = data.code ? (' [' + data.code + ']') : '';
    throw new Error(baseMsg + code);
  }

  if (!data.answer || !String(data.answer).trim()) {
    throw new Error('The assistant returned an empty response. Please try a shorter or more specific question.');
  }
  return data.answer;
}
if (typeof window !== 'undefined') window.askPolicyAssistant = askPolicyAssistant;

/* =======================================================================
   Deterministic local fallbacks. Used when the backend is unreachable or
   not yet configured, for the quick actions where a useful summary can be
   built from the tool state alone. Clearly labelled as offline summaries.
   ======================================================================= */
function fmtPct(v) { return v == null ? 'not available' : v.toFixed(1) + ' percent'; }
function fmtMoney(v, cur) { return v == null ? 'not available' : (cur ? cur + ' ' : '') + Math.round(v).toLocaleString(); }

function localExplainResult(ts) {
  if (!ts) return 'The tool state is not available yet. Apply a design first, then ask again.';
  const lines = [];
  lines.push('Offline summary (the AI assistant is not connected, so this is built from the tool values only).');
  lines.push('');
  lines.push('Design: ' + (ts.country || 'country not set') + ', ' + (ts.outbreakScenario || 'scenario not set') + '. Applies to ' + (ts.scope || 'not set') + ', opt out for ' + (ts.exemptions || 'not set') + ', lifted at ' + (ts.coverageThreshold != null ? ts.coverageThreshold + ' percent' : 'not set') + ', health benefit ' + (ts.livesSavedPer100k != null ? ts.livesSavedPer100k + ' lives per 100,000' : 'not set') + '.');
  lines.push('Predicted public support: ' + fmtPct(ts.predictedSupportPercent) + '. This is class-share-weighted latent-class support, that is the model predicted probability of choosing this mandate over no mandate. It is not actual vaccine uptake or compliance.');
  if (ts.classBreakdown && ts.classBreakdown.length) {
    lines.push('By preference class:');
    ts.classBreakdown.forEach(k => lines.push('  - ' + k.label + ': supports at ' + fmtPct(k.supportPercent) + ', share ' + fmtPct(k.sharePercent) + ', contributing ' + fmtPct(k.weightedContributionPercent) + ' to the overall figure.'));
  }
  if (ts.benefitCost && ts.benefitCost.benefitCostRatio != null) {
    const b = ts.benefitCost;
    lines.push('Benefit and cost: gross benefit ' + fmtMoney(b.grossBenefit, b.currency) + ', total cost ' + fmtMoney(b.totalCost, b.currency) + ', net benefit ' + fmtMoney(b.netBenefit, b.currency) + ', benefit to cost ratio ' + (b.benefitCostRatio != null ? b.benefitCostRatio.toFixed(2) : 'not available') + '.');
  } else {
    lines.push('Benefit and cost: costs have not been entered, so the ratio is not available.');
  }
  if (ts.warnings && ts.warnings.length) ts.warnings.forEach(w => lines.push('Note: ' + w));
  lines.push('Before any real decision, legal, ethical, operational and equity review is required.');
  return lines.join('\n');
}

function localExplainLC() {
  return [
    'Offline summary of the latent-class model.',
    '',
    'Predicted support uses a two-class latent-class choice model. People are grouped into two preference classes, a supporter class that tends to favour mandates and a resister class that tends to prefer no mandate. Each class has its own preference weights.',
    'For the selected design the model works out support within each class, then averages them using the estimated class shares for the chosen country and outbreak:',
    '  P(support) = sum over classes [ class share x class support ].',
    'Class support is the class-specific probability of choosing the mandate over no mandate. The no-mandate constant is included, and the Policy A display constant is set to zero, because the tool predicts support for a generic policy bundle rather than a left versus right experimental display.',
    'This is predicted policy support from stated preferences. It is not actual vaccination uptake, not compliance, and not a causal effect.'
  ].join('\n');
}

function localAssumptions(ts) {
  const out = [
    'Offline summary of assumptions and limitations.',
    '',
    '- Predicted support is from stated preference survey data. It is an estimate of acceptability, not actual uptake, compliance or a causal effect.',
    '- Support is class-share-weighted across two latent classes, not an individual covariate-specific posterior class probability.',
    '- The Policy A display constant is excluded; support is for a generic mandate bundle versus no mandate.',
    '- The lives saved health benefit is an assumption you set. The study design range is 10 to 40 per 100,000, and values outside that are flagged as extrapolation.',
    '- Benefit and cost figures depend on the value placed on each life saved and on the cost assumptions you enter.',
    '- The model covers Australia, France and Italy only.',
    '- This is not legal or medical advice. Legal, ethical, operational and equity review is required before any real decision.'
  ];
  if (ts && ts.warnings && ts.warnings.length) { out.push(''); ts.warnings.forEach(w => out.push('Current note: ' + w)); }
  return out.join('\n');
}

function localFallbackFor(actionType) {
  const ts = getCurrentToolStateForAssistant();
  if (actionType === 'explain_result') return localExplainResult(ts);
  if (actionType === 'explain_lc') return localExplainLC();
  if (actionType === 'list_assumptions') return localAssumptions(ts);
  return null;
}

const ASSISTANT_OFFLINE_MSG = 'The AI Policy Assistant is temporarily unavailable, likely because the free tier quota has been reached or the backend is offline. The decision aid calculations are still available. Please try again later or use the report prompt section.';

/* =======================================================================
   UI
   ======================================================================= */
const AS = id => document.getElementById(id);

const assistant = {
  open: false,
  greeted: false,
  userMessages: 0,
  busy: false,
  lastAnswer: ''
};

const OPENING_MESSAGE = 'I can help interpret the selected mandate design, explain the latent-class support estimate, suggest ways to improve public acceptability, draft policy briefing text, identify policy risks, and compare saved options. Please do not enter personal, confidential or sensitive information.';

function assistantEls() {
  return {
    fab: AS('assistant-fab'), panel: AS('assistant-panel'), scrim: AS('assistant-scrim'),
    close: AS('assistant-close'), min: AS('assistant-min'), messages: AS('assistant-messages'),
    form: AS('assistant-form'), input: AS('assistant-input'), send: AS('assistant-send'),
    clear: AS('assistant-clear'), count: AS('assistant-count'), quick: AS('assistant-quick'),
    toast: AS('assistant-toast')
  };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

/* Lightweight, XSS safe markdown rendering for assistant replies. Everything
   is escaped first, then a small set of safe formatting is applied: bold,
   inline code, bullet lists, numbered lists, and paragraphs. */
function inlineMd(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}
function formatAssistant(text) {
  const lines = escapeHtml(String(text)).replace(/\r/g, '').split('\n');
  let html = '';
  let mode = null; /* null | 'ul' | 'ol' */
  let para = [];
  const flushPara = () => { if (para.length) { html += '<p>' + inlineMd(para.join(' ')) + '</p>'; para = []; } };
  const closeList = () => { if (mode) { html += mode === 'ul' ? '</ul>' : '</ol>'; mode = null; } };
  lines.forEach(raw => {
    const line = raw.trim();
    if (!line) { flushPara(); closeList(); return; }
    const bullet = line.match(/^[-*\u2022]\s+(.*)$/);
    const numbered = line.match(/^\d+[.)]\s+(.*)$/);
    if (bullet) {
      flushPara();
      if (mode !== 'ul') { closeList(); html += '<ul>'; mode = 'ul'; }
      html += '<li>' + inlineMd(bullet[1]) + '</li>';
    } else if (numbered) {
      flushPara();
      if (mode !== 'ol') { closeList(); html += '<ol>'; mode = 'ol'; }
      html += '<li>' + inlineMd(numbered[1]) + '</li>';
    } else {
      closeList();
      para.push(line);
    }
  });
  flushPara(); closeList();
  return html || '<p></p>';
}

function addMessage(role, text, opts) {
  const els = assistantEls();
  const wrap = document.createElement('div');
  wrap.className = 'assistant-msg msg-' + role;
  const bubble = document.createElement('div');
  bubble.className = 'assistant-bubble';
  if (role === 'assistant') bubble.innerHTML = formatAssistant(text);
  else bubble.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  wrap.appendChild(bubble);

  if (role === 'assistant' && (!opts || !opts.noActions)) {
    const actions = document.createElement('div');
    actions.className = 'assistant-msg-actions';
    const copyBtn = document.createElement('button');
    copyBtn.type = 'button'; copyBtn.className = 'assistant-mini'; copyBtn.textContent = 'Copy response';
    copyBtn.addEventListener('click', () => copyAssistantText(text, copyBtn));
    const reportBtn = document.createElement('button');
    reportBtn.type = 'button'; reportBtn.className = 'assistant-mini'; reportBtn.textContent = 'Add to report';
    reportBtn.addEventListener('click', () => addToReport(text, reportBtn));
    actions.appendChild(copyBtn); actions.appendChild(reportBtn);
    wrap.appendChild(actions);
  }
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
  return wrap;
}

/* Flash a confirmation inside the panel (always visible above the chat input),
   and briefly mark the button that was pressed. */
let _panelToastTimer = null;
function showPanelToast(msg, kind) {
  const t = assistantEls().toast;
  if (!t) { toastSafe(msg, kind); return; }
  t.textContent = msg;
  t.className = 'assistant-toast' + (kind === 'warn' ? ' warn' : '');
  t.hidden = false;
  /* force reflow so the transition runs each time */
  void t.offsetWidth;
  t.classList.add('show');
  if (_panelToastTimer) clearTimeout(_panelToastTimer);
  _panelToastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 220);
  }, 1900);
}
function markDone(btn, label) {
  if (!btn) return;
  const original = btn.dataset.label || btn.textContent;
  btn.dataset.label = original;
  btn.textContent = label;
  btn.classList.add('done');
  setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove('done'); }, 1600);
}

function copyAssistantText(text, btn) {
  const ok = () => { showPanelToast('Response copied to the clipboard.'); markDone(btn, 'Copied'); toastSafe('Response copied to the clipboard.'); };
  const fail = () => { fallbackCopy(text, btn); };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(ok, fail);
  } else {
    fallbackCopy(text, btn);
  }
}
function fallbackCopy(text, btn) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'absolute'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    const done = document.execCommand && document.execCommand('copy');
    document.body.removeChild(ta);
    if (done) { showPanelToast('Response copied to the clipboard.'); markDone(btn, 'Copied'); }
    else showPanelToast('Copy failed. Select the text manually.', 'warn');
  } catch (e) {
    showPanelToast('Copy failed. Select the text manually.', 'warn');
  }
}

function addToReport(text, btn) {
  const ta = document.getElementById('report-prompt');
  if (!ta) { showPanelToast('The report section is not available.', 'warn'); return; }
  const stamp = 'Policy Assistant note:\n';
  ta.value = (ta.value ? ta.value.trim() + '\n\n' : '') + stamp + text;
  ta.dispatchEvent(new Event('input', { bubbles: true }));
  showPanelToast('Added to the report prompt.');
  markDone(btn, 'Added');
  toastSafe('Added to the report prompt.');
}

/* Use the app toast if present. Used in addition to the in panel toast so the
   confirmation is visible whether or not the panel is open. */
function toastSafe(msg, kind) {
  if (typeof toast === 'function') { try { toast(msg, kind === 'warn' ? 'warn' : 'good'); return; } catch (e) {} }
}

function showTyping() {
  const els = assistantEls();
  const wrap = document.createElement('div');
  wrap.className = 'assistant-msg msg-assistant assistant-typing';
  wrap.id = 'assistant-typing';
  wrap.innerHTML = '<div class="assistant-bubble"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
  els.messages.appendChild(wrap);
  els.messages.scrollTop = els.messages.scrollHeight;
}
function hideTyping() {
  const t = AS('assistant-typing');
  if (t) t.remove();
}

function updateCount() {
  const els = assistantEls();
  const remaining = ASSISTANT_SESSION_LIMIT - assistant.userMessages;
  els.count.textContent = assistant.userMessages + ' of ' + ASSISTANT_SESSION_LIMIT + ' messages used this session';
  if (remaining <= 0) {
    els.input.disabled = true; els.send.disabled = true;
    els.input.placeholder = 'Session message limit reached. Clear chat to start again.';
  }
}

function setBusy(b) {
  assistant.busy = b;
  const els = assistantEls();
  els.send.disabled = b || assistant.userMessages >= ASSISTANT_SESSION_LIMIT;
  els.quick.querySelectorAll('button').forEach(btn => btn.disabled = b);
}

function setPanelOpen(isOpen) {
  const els = assistantEls();
  if (!els.panel) return;
  assistant.open = isOpen;
  els.panel.classList.toggle('is-open', isOpen);
  els.scrim.classList.toggle('is-open', isOpen);
  els.fab.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  els.panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
  if (isOpen) els.panel.removeAttribute('inert');
  else els.panel.setAttribute('inert', '');
  document.body.classList.toggle('assistant-open', isOpen);
}

function openAssistant() {
  const els = assistantEls();
  if (!els.panel) return;
  setPanelOpen(true);
  if (!assistant.greeted) {
    addMessage('assistant', OPENING_MESSAGE, { noActions: true });
    assistant.greeted = true;
    updateCount();
  }
  setTimeout(() => { try { els.input.focus(); } catch (e) {} }, 60);
}

/* Both minimise and close collapse the panel to the floating button and keep
   the conversation, so the user can return to the tool and come back later. */
function closeAssistant() {
  const els = assistantEls();
  if (!els.panel) return;
  setPanelOpen(false);
  try { els.fab.focus(); } catch (e) {}
}

function clearChat() {
  const els = assistantEls();
  els.messages.innerHTML = '';
  assistant.userMessages = 0;
  assistant.greeted = false;
  els.input.disabled = false; els.send.disabled = false;
  els.input.placeholder = 'Ask about this result, the LC model, risks, or saved options';
  addMessage('assistant', OPENING_MESSAGE, { noActions: true });
  assistant.greeted = true;
  updateCount();
}

/* Core send flow, shared by free text and quick actions. Quick actions pass a
   short displayText for the chat bubble while sending the fuller prompt. */
async function sendToAssistant(question, actionType, displayText) {
  if (assistant.busy) return;
  if (assistant.userMessages >= ASSISTANT_SESSION_LIMIT) { updateCount(); return; }

  addMessage('user', displayText || question);
  assistant.userMessages += 1;
  updateCount();
  setBusy(true);
  showTyping();

  /* If the Worker URL is not configured, give a local result where possible. */
  if (!assistantConfigured()) {
    hideTyping();
    const local = localFallbackFor(actionType);
    if (local) addMessage('assistant', local);
    else addMessage('assistant', 'The assistant is not connected yet. After the Worker is deployed and its URL is set in assistant.js, questions will be answered by the AI.');
    setBusy(false);
    return;
  }

  try {
    const answer = await askPolicyAssistant(question, actionType || 'free_text');
    hideTyping();
    assistant.lastAnswer = answer;
    addMessage('assistant', answer);
  } catch (err) {
    hideTyping();
    const realError = (err && err.message) ? err.message : 'Unknown backend error.';
    const local = localFallbackFor(actionType);
    if (local) {
      addMessage('assistant',
        'The AI request did not complete. Backend message: ' + realError +
        '\n\nIn the meantime, here is an offline summary built from the current tool values:\n\n' + local);
    } else {
      addMessage('assistant',
        'The AI request did not complete. Backend message: ' + realError +
        '\n\nThe decision aid calculations are still available. Please try a shorter question or use the report prompt section.');
    }
  } finally {
    setBusy(false);
  }
}

function autoGrow(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 140) + 'px';
}

let _assistantInited = false;
function initAssistant() {
  if (_assistantInited) return;
  const els = assistantEls();
  if (!els.fab || !els.panel) return;   /* assistant markup absent: do nothing */
  _assistantInited = true;

  els.fab.addEventListener('click', () => { assistant.open ? closeAssistant() : openAssistant(); });
  els.close.addEventListener('click', closeAssistant);
  if (els.min) els.min.addEventListener('click', closeAssistant);
  els.scrim.addEventListener('click', closeAssistant);
  els.clear.addEventListener('click', clearChat);

  els.form.addEventListener('submit', e => {
    e.preventDefault();
    const q = els.input.value.trim();
    if (!q) return;
    els.input.value = '';
    autoGrow(els.input);
    sendToAssistant(q, 'free_text');
  });

  els.input.addEventListener('input', () => autoGrow(els.input));
  els.input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); els.form.requestSubmit ? els.form.requestSubmit() : els.form.dispatchEvent(new Event('submit', { cancelable: true })); }
  });

  els.quick.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const prompt = ASSISTANT_QUICK_PROMPTS[action];
    if (!prompt) return;
    /* Identical pathway to free text: same Worker, same toolState, same model.
       Only the chat bubble shows a short label. */
    const label = ASSISTANT_QUICK_LABELS[action] || btn.textContent.trim();
    sendToAssistant(prompt, action, label);
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && assistant.open) closeAssistant();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAssistant);
} else {
  initAssistant();
}
