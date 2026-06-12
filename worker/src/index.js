/**
 * eMANDEVAL Future - Policy Assistant backend (Cloudflare Worker) - V17
 * ---------------------------------------------------------------------------
 * Holds the Gemini API key as a Worker SECRET (GEMINI_API_KEY) and calls the
 * Gemini REST API server side. The browser only ever talks to this Worker, so
 * the key is never exposed in frontend code, HTML, CSS, or the GitHub repo.
 *
 *   GitHub Pages frontend  ->  this Worker  ->  Gemini API  ->  answer
 *
 * Endpoint:  POST /api/emandeval-chat
 *
 * V17 changes:
 *   - Default model is gemini-3.5-flash (override with the GEMINI_MODEL var).
 *   - Model aware generation config: the 2.5 "thinkingBudget" field is only
 *     sent to 2.5 models, since Gemini 3.x uses a different thinking control.
 *   - Structured JSON errors: { ok:false, code, message } with clear codes.
 *   - Request timeout via AbortController.
 *   - Domain grounding: a strengthened system prompt plus an embedded
 *     eMANDEVAL knowledge base sent on every request (no fine-tuning).
 *
 * FREE TIER NOTE: built to run at low or no cost using Cloudflare Workers Free
 * and the Gemini API. Free tier quotas, model availability and provider terms
 * can change; public or high traffic use may need paid hosting or model access.
 *
 * Secrets / vars (set with wrangler):
 *   GEMINI_API_KEY   (secret, required)
 *   GEMINI_MODEL     (var, optional, default "gemini-3.5-flash")
 *   ALLOWED_ORIGINS  (var, optional, comma separated)
 */

const DEFAULT_MODEL = 'gemini-3.5-flash';

const DEFAULT_ALLOWED_ORIGINS = [
  'https://drgenie.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5173'
];

const MAX_QUESTION_CHARS = 1500;
const MAX_TOOLSTATE_CHARS = 20000;
const MAX_ANSWER_CHARS = 8000;

/* Best effort per IP throttle. In memory per isolate, so it resets when the
   isolate recycles. For robust limiting at scale use Cloudflare KV or a
   Durable Object. Sufficient for free tier prototype protection. */
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60000;
const rateMap = new Map();

/* Abort the Gemini call if it has not responded in this time. */
const GEMINI_TIMEOUT_MS = 28000;

/* ---------------------------------------------------------------------------
   Domain grounding (training like behaviour without fine-tuning).
   The system prompt sets behaviour and guardrails. The knowledge base gives
   stable definitions and interpretation rules. Both are sent on every request
   together with the live toolState, so the assistant behaves as if trained on
   the eMANDEVAL tool while still using only the live numbers.
   --------------------------------------------------------------------------- */
const SYSTEM_PROMPT = [
  'You are the eMANDEVAL Future Policy Assistant, embedded in a vaccine mandate decision aid used by public health and policy staff.',
  '',
  'PURPOSE. The tool estimates predicted public support for a selected vaccine mandate policy in Australia, France or Italy, under a mild or severe outbreak, using a two-class latent-class (LC) choice model, and pairs it with a simple benefit-cost calculation.',
  '',
  'MODEL. Predicted support is class-share-weighted:',
  'P(support) = sum over classes c of [ pi_c * exp(V_policy,c) / ( exp(V_policy,c) + exp(V_no_mandate,c) ) ].',
  'There are two preference classes: a supporter class (tends to favour mandates) and a resister class (tends to prefer no mandate). Each class has its own coefficients and an estimated share. Overall support is the share-weighted average of class-specific support. The Policy A display constant is set to zero because the tool predicts support for a generic policy bundle versus no mandate.',
  '',
  'MEANING. Predicted support is stated-preference policy support: the model-estimated probability that people would choose this mandate over no mandate. It is NOT actual vaccine uptake, NOT compliance, and NOT a causal effect.',
  '',
  'RULES.',
  '- Use ONLY the values in the provided tool state. Never invent or assume numbers. If a value is missing or null, say it is missing.',
  '- Give policy options, not commands. Use "consider", "compare", "test", "review", "assess".',
  '- Never say a mandate should definitely be implemented. Never give legal or medical advice.',
  '- Never claim predicted support is actual uptake or compliance.',
  '- Stay within Australia, France and Italy. If asked beyond these, say it is outside the model.',
  '- Always remind users that legal, ethical, operational and equity review is required before any real decision, when relevant.',
  '',
  'STYLE. Be concise, clear and policy relevant. Plain language by default; technical detail only if asked. Use short paragraphs and bullets where helpful. Keep most answers to about 250 words unless the user asks for more. When drafting text, produce polished policy-ready wording and note the stated-preference caveat.'
].join('\n');

const EMANDEVAL_KNOWLEDGE_BASE = [
  'EMANDEVAL KNOWLEDGE BASE (use to interpret the tool state; do not override live numbers).',
  '',
  'DEFINITIONS.',
  '- Predicted public support: model-estimated probability of choosing the selected mandate over no mandate, from stated preferences. Not uptake, not compliance.',
  '- Supporter class: the preference group that generally favours mandates; usually the larger share; class-specific support is typically high.',
  '- Resister class: the preference group that generally prefers no mandate; has a large positive no-mandate constant; class-specific support is typically low.',
  '- Weighted contribution: a class share multiplied by its class-specific support; the overall support is the sum of the two contributions.',
  '- Lives saved per 100,000: a user-set assumption of the health benefit; the study design range is 10 to 40; values outside are extrapolation.',
  '- Gross benefit: lives saved multiplied by the value per life saved. Total cost: the costs entered. Net benefit: gross benefit minus total cost. Benefit-cost ratio (BCR): gross benefit divided by total cost; above 1 means benefits exceed costs, below 1 means costs exceed benefits.',
  '',
  'INTERPRETATION RULES.',
  '- Explain what the support figure means, what drives it (class shares and class support), which assumptions matter, what limitations apply, and one practical next step.',
  '- If costs are not entered, say BCR and net benefit are not available rather than guessing.',
  '- For saved-option comparisons, rank on predicted support, BCR and net benefit, and note trade-offs; if no saved options, say saved options are needed first.',
  '',
  'WORDING GUIDANCE.',
  '- Public: short, plain, no jargon; stress that this is predicted support, not actual uptake.',
  '- Policymaker: concise, decision focused; surface trade-offs, assumptions and next checks.',
  '- Technical: may reference the LC formula, class shares and coefficients if asked.',
  '',
  'GUARDRAILS AND LIMITATIONS.',
  '- Stated-preference evidence, not behaviour or compliance; not causal; covers Australia, France and Italy only.',
  '- Class-share-weighted, not individual posterior class probabilities.',
  '- Economic results depend on the value per life saved and the cost inputs.',
  '- Not legal or medical advice; legal, ethical, operational and equity review is required before real use.',
  '',
  'EXAMPLE OF A GOOD ANSWER (style only, always use live numbers): "Predicted support is X percent, which is stated-preference support rather than actual uptake. It is driven mainly by the supporter class (about S percent of people, supporting at A percent), while the resister class contributes little. Costs are/are not entered, so the benefit-cost ratio is Y/not available. Consider testing a narrower exemption rule and comparing saved options. Any real decision needs legal, ethical and equity review."'
].join('\n');

const SAFETY_NOTE = 'Interpretation support only. Not legal or medical advice. Predicted support is stated-preference policy support, not actual uptake or compliance.';

function allowedOrigins(env) {
  if (env && env.ALLOWED_ORIGINS) {
    return env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

function corsHeaders(origin, env) {
  const list = allowedOrigins(env);
  const ok = origin && list.indexOf(origin) !== -1;
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (ok) headers['Access-Control-Allow-Origin'] = origin;
  return { headers, ok };
}

function jsonOk(body, headers) {
  return new Response(JSON.stringify(Object.assign({ ok: true }, body)), {
    status: 200,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
  });
}

/* Structured error. "message" is the user friendly text; "error" is kept as an
   alias for backward compatibility with older frontends. */
function jsonErr(code, message, status, headers) {
  return new Response(JSON.stringify({ ok: false, code: code, message: message, error: message }), {
    status: status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {})
  });
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (rateMap.get(ip) || []).filter(t => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) { rateMap.set(ip, arr); return true; }
  arr.push(now);
  rateMap.set(ip, arr);
  if (rateMap.size > 5000) { for (const k of rateMap.keys()) { if (k !== ip) { rateMap.delete(k); break; } } }
  return false;
}

/* Model aware generation config. Gemini 3.x uses a different thinking control
   (thinking level, not thinking budget) and recommends default sampling, so we
   keep the 3.x config minimal and robust and only send the 2.5 thinking field
   to 2.5 models. */
function buildGenerationConfig(model) {
  const m = String(model || '').toLowerCase();
  const isV3 = m.indexOf('gemini-3') === 0;
  const cfg = { temperature: 0.3, topP: 0.9, maxOutputTokens: isV3 ? 4096 : 2048 };
  if (!isV3) {
    /* 2.5 models think by default and charge it against maxOutputTokens, which
       truncates answers. Disable thinking for complete, fast replies. */
    cfg.thinkingConfig = { thinkingBudget: 0 };
  }
  return cfg;
}

/* Remove anything that looks like the API key from text we send back. */
function sanitise(text, apiKey) {
  if (!text) return '';
  let t = String(text);
  if (apiKey) t = t.split(apiKey).join('[redacted]');
  return t;
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors.headers });
    }
    if (request.method !== 'POST') {
      return jsonErr('METHOD_NOT_ALLOWED', 'Method not allowed. Use POST.', 405, cors.headers);
    }
    if (!cors.ok) {
      return jsonErr('CORS_ORIGIN_NOT_ALLOWED', 'This origin is not allowed to use the assistant.', 403, cors.headers);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (rateLimited(ip)) {
      return jsonErr('RATE_LIMITED', 'Too many requests in a short time. Please wait a moment and try again.', 429, cors.headers);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return jsonErr('INVALID_JSON', 'The request body was not valid JSON.', 400, cors.headers);
    }

    const question = (body && typeof body.question === 'string') ? body.question : '';
    if (!question || !question.trim()) {
      return jsonErr('INVALID_JSON', 'A question is required.', 400, cors.headers);
    }
    if (question.length > MAX_QUESTION_CHARS) {
      return jsonErr('QUESTION_TOO_LONG', 'Your question is too long. Please shorten it to ' + MAX_QUESTION_CHARS + ' characters or fewer.', 400, cors.headers);
    }

    const toolState = (body && body.toolState && typeof body.toolState === 'object') ? body.toolState : null;
    let toolStateStr = '';
    try { toolStateStr = JSON.stringify(toolState || {}); } catch (e) { toolStateStr = ''; }
    if (toolStateStr.length > MAX_TOOLSTATE_CHARS) {
      return jsonErr('TOOL_STATE_TOO_LARGE', 'The tool state is too large to send.', 400, cors.headers);
    }

    const apiKey = env && env.GEMINI_API_KEY;
    if (!apiKey) {
      return jsonErr('GEMINI_KEY_MISSING', 'The assistant is not configured on the server. Set the GEMINI_API_KEY secret.', 500, cors.headers);
    }
    const model = (env && env.GEMINI_MODEL) ? env.GEMINI_MODEL : DEFAULT_MODEL;

    const systemText = SYSTEM_PROMPT + '\n\n' + EMANDEVAL_KNOWLEDGE_BASE;
    const userContent =
      'Current eMANDEVAL tool state (live values, use only these):\n' +
      JSON.stringify(toolState || {}, null, 2) +
      '\n\nUser question:\n' + question +
      '\n\nAnswer using the system instructions and knowledge base. Use only the tool state values and do not invent numbers.';

    const payload = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userContent }] }],
      generationConfig: buildGenerationConfig(model),
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };

    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(model) + ':generateContent';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let gResp;
    try {
      gResp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
    } catch (e) {
      clearTimeout(timer);
      if (e && e.name === 'AbortError') {
        return jsonErr('GEMINI_TIMEOUT', 'The AI service took too long to respond. Please try a shorter question.', 504, cors.headers);
      }
      return jsonErr('GEMINI_API_ERROR', 'The AI service could not be reached. Please try again shortly.', 502, cors.headers);
    }
    clearTimeout(timer);

    if (!gResp.ok) {
      let detail = '';
      try {
        const eb = await gResp.json();
        detail = (eb && eb.error && eb.error.message) ? eb.error.message : '';
      } catch (e) {
        try { detail = await gResp.text(); } catch (e2) { detail = ''; }
      }
      detail = sanitise(detail, apiKey);
      const status = gResp.status;
      let code = 'GEMINI_API_ERROR';
      let msg = 'The AI service returned an error.';
      if (status === 429) { code = 'RATE_LIMITED'; msg = 'The AI service quota or rate limit was reached. Please try again later.'; }
      else if (status === 401 || status === 403) { code = 'GEMINI_API_ERROR'; msg = 'The AI service rejected the request. Check the API key and access.'; }
      else if (status === 404) { code = 'MODEL_NOT_AVAILABLE'; msg = 'The selected model is not available for this API key. Set GEMINI_MODEL to an available model (for example gemini-2.5-flash).'; }
      else if (status === 400) { code = 'GEMINI_API_ERROR'; msg = 'The AI request was rejected as invalid.'; }
      else if (status >= 500) { code = 'GEMINI_API_ERROR'; msg = 'The AI service is temporarily unavailable. Please try again later.'; }
      if (detail) msg = msg + ' Details: ' + detail;
      return jsonErr(code, msg, status === 429 ? 429 : (status === 504 ? 504 : 502), cors.headers);
    }

    let data;
    try {
      data = await gResp.json();
    } catch (e) {
      return jsonErr('GEMINI_API_ERROR', 'The AI service returned an unreadable response.', 502, cors.headers);
    }

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return jsonErr('GEMINI_BLOCKED', 'The request was blocked by the AI safety filter. Please rephrase your question.', 422, cors.headers);
    }
    const cand = data.candidates && data.candidates[0];
    if (cand && cand.finishReason === 'SAFETY') {
      return jsonErr('GEMINI_BLOCKED', 'The response was blocked by the AI safety filter. Please rephrase your question.', 422, cors.headers);
    }

    let answer = '';
    if (cand && cand.content && Array.isArray(cand.content.parts)) {
      answer = cand.content.parts.map(p => (p && p.text) ? p.text : '').join('').trim();
    }

    if (!answer) {
      const fr = cand && cand.finishReason;
      if (fr === 'MAX_TOKENS') {
        return jsonErr('GEMINI_EMPTY_RESPONSE', 'Gemini returned no text because the answer was too long. Please ask for a shorter or more specific answer.', 502, cors.headers);
      }
      return jsonErr('GEMINI_EMPTY_RESPONSE', 'Gemini returned no text. Please try a shorter or more specific question.', 502, cors.headers);
    }

    if (cand && cand.finishReason === 'MAX_TOKENS') {
      answer += '\n\n(Response reached the length limit. Ask me to continue or focus on one part.)';
    }
    if (answer.length > MAX_ANSWER_CHARS) {
      answer = answer.slice(0, MAX_ANSWER_CHARS) + '\n\n(Response trimmed for length.)';
    }

    /* We do not log or store the question, the tool state, or the answer. */
    return jsonOk({ answer: answer, model: model, safetyNote: SAFETY_NOTE }, cors.headers);
  }
};
