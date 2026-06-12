eMANDEVAL Future, version 4.2.0
A vaccine mandate decision aid for Australia, France and Italy.

Predicted public support is calculated with a class-share-weighted two-class
latent-class (LC) choice model. The benefit and cost calculations, interface,
accessibility features and exports are otherwise unchanged from version 4.1.0.

----------------------------------------------------------------------
WHAT THE TOOL DOES
----------------------------------------------------------------------
You choose a country and a mandate design. The tool estimates:
- predicted public support, using a two-class latent-class choice model
- how many lives it could save, and the money value of that benefit
- total cost, net benefit and the benefit to cost ratio, if you add costs
- other health effects, and a breakdown of support by preference class

You build a design on the left, then select Apply and view results.

----------------------------------------------------------------------
HOW PREDICTED SUPPORT IS CALCULATED
----------------------------------------------------------------------
Support uses a two-class latent-class choice model. For a selected mandate
design the tool estimates support separately for each preference class (a
supporter class and a resister class), then averages those estimates using
the estimated share of each class for the selected country and outbreak:

  P(support) = sum over classes [ class share x class support ]

Class support is the class-specific probability of choosing the mandate over
no mandate, from a numerically stable two-alternative logit. The Policy A
display constant is set to zero, because the tool predicts support for a
generic policy bundle rather than a left-versus-right experimental display.
The result is predicted policy support from stated preferences, not a
forecast of behaviour. The earlier mixed-logit support calculation and its
1,000-draw simulation have been removed.

----------------------------------------------------------------------
NEW IN VERSION 4.1.0
----------------------------------------------------------------------
A clear apply step
- Build your design, then press "Apply and view results". You always know
  when a change has taken effect.
- While you have changes waiting, a "Changes not applied" marker and a
  reminder banner appear, so nothing happens silently.
- The slider and other controls still show their own values live as you move
  them, so they feel responsive.

Stronger charts, readable without colour
- Each chart has a short plain language interpretation next to it.
- Each chart shows its unit clearly, for example percent of people, local
  currency, lives per 100,000, or the benefit to cost ratio.
- Each bar is labelled with its value, so the charts can be read in greyscale
  or by people who do not distinguish colours. Colour is never the only cue.
- Each chart has a data table you can show or hide, and the same table is
  available to screen readers.
- Each chart can be exported two ways: a PNG image, and a CSV of the data.

Draft a policy report with an assistant
- A new "Turn this into a policy report" section builds a clear, detailed
  prompt from your current option and any saved options.
- Choose a short brief, a detailed brief, or a comparison memo.
- Copy the prompt, or open it directly in ChatGPT, Copilot or Gemini.
- Nothing is sent automatically. The prompt only contains the figures on
  screen, and it tells the assistant not to invent numbers and to treat the
  support figures as estimates of acceptability, not forecasts.

A guided tour that works
- The tour now spotlights each part of the screen with a clear ring and a
  dimmed surround, and walks through building, applying, reading support,
  adding costs, comparing and drafting a report.

Carried over from 4.0.0
- Plain language throughout, a "What this means" summary, quick start
  examples and a glossary.
- Full keyboard support, visible focus, a four step text size control and a
  high contrast mode, both remembered between visits, and reduced motion
  respected.
- Your current work is saved in this browser and restored when you return.
- A share link recreates the exact option for a colleague.
- Saved options compared side by side, exported to a spreadsheet or a
  briefing document, copied as a summary, or printed to PDF.

Accurate and reproducible
- The support estimate for a given design is identical every time.
- Lives saved outside the study range of 10 to 40 per 100,000 are flagged as
  an extrapolation in the results, the summary, the spreadsheet and the
  briefing document.

----------------------------------------------------------------------
FILES
----------------------------------------------------------------------
- index.html         The tool
- styles.css         The design system and responsive, accessible styles
- app.js             The calculation engine and all interaction logic
- methodology.html   Plain language method and data, with the detail a level down
- README.txt         This file

----------------------------------------------------------------------
DEPLOYMENT ON GITHUB PAGES
----------------------------------------------------------------------
Upload all files to the repository root, or replace the existing files. No
build step or server is needed. After deploying, hard refresh with
Control or Command, Shift and R to clear any cached older version.

The only external item is Chart.js, loaded from a public CDN. Everything else
is self contained. Saved options and preferences live in this browser only and
are never sent anywhere. The report feature opens the assistant website in a
new tab and copies the prompt for you to paste; it does not send anything on
its own.

----------------------------------------------------------------------
AI POLICY ASSISTANT (version 4.3.0)
----------------------------------------------------------------------
A real AI chatbot, the "eMANDEVAL Policy Assistant", is built into the
tool. It helps interpret the latent-class predicted support, the class
breakdown, the benefit and cost outputs, saved comparisons, assumptions,
limitations and policy risks. It can answer free text questions and quick
button prompts, and it reads the current tool state every time you send a
message.

It is interpretation support only. It is not legal or medical advice, and
predicted support is stated-preference policy support, not actual uptake.

ARCHITECTURE (no secrets in the browser)
The frontend is static and never holds an API key. It calls only your own
Cloudflare Worker, which holds the key as a secret and calls Gemini:

  GitHub Pages frontend  ->  Cloudflare Worker  ->  Gemini API  ->  answer

The Gemini API key is stored only as a Cloudflare Worker secret named
GEMINI_API_KEY. It must never be placed in frontend code, HTML, CSS, or the
GitHub repository.

PRIVACY
The assistant sends your question and the current tool settings to a free
tier AI service to generate a response. Do not enter personal, confidential
or sensitive information. The Worker does not log user data or store chat
transcripts.

FREE TIER
The chatbot uses free tier AI and backend services (Cloudflare Workers Free
and the Gemini API free tier). Availability may be limited by provider
quotas. If the assistant is unavailable, the decision aid calculations and
report prompts remain fully usable, and the quick actions Explain this
result, Explain the LC model, and List assumptions and limitations still
produce an offline summary from the tool values. Free tier quotas, model
availability and provider terms may change, and public or high traffic use
may later require paid hosting or paid model access.

DEPLOYMENT
Step by step instructions are in worker/README_DEPLOY_CHATBOT.md. In short:
  1. Get a free Gemini API key from Google AI Studio.
  2. Install Wrangler and run: cd worker, npm install,
     wrangler secret put GEMINI_API_KEY, then wrangler deploy.
  3. Paste the deployed Worker URL into the CHATBOT_WORKER_URL constant at
     the top of assistant.js, then commit and push to GitHub Pages.
Test cases are in CHATBOT_TESTS.md. A troubleshooting section is in
worker/README_DEPLOY_CHATBOT.md.

FILES ADDED FOR THE ASSISTANT
  assistant.js                      frontend chatbot logic and UI wiring
  worker/src/index.js               Cloudflare Worker backend
  worker/wrangler.toml              Worker configuration
  worker/package.json               Worker dev dependencies and scripts
  worker/README_DEPLOY_CHATBOT.md   deployment and troubleshooting guide
  CHATBOT_TESTS.md                  test cases
Existing calculation, chart, report, glossary, accessibility and export
features are unchanged.

----------------------------------------------------------------------
HOW THE CHATBOT IS TRAINED / GROUNDED (version 4.3.2, V17)
----------------------------------------------------------------------
The Policy Assistant behaves as if it were trained on the eMANDEVAL tool,
but the base model is NOT fine-tuned. "Training-like" behaviour is achieved
through domain grounding, which is simpler, low cost, transparent, easy to
update, and safe:

  1. A strengthened server-side system prompt sets the assistant's role,
     the LC model structure, supporter and resister classes, the meaning of
     predicted support (stated-preference, not uptake or compliance), the
     benefit-cost interpretation, saved-option comparison, limitations, and
     the legal, ethical, operational and equity cautions.
  2. An embedded eMANDEVAL knowledge base (EMANDEVAL_KNOWLEDGE_BASE in
     worker/src/index.js) provides stable definitions, interpretation rules,
     wording guidance for public, policy-maker and technical audiences,
     guardrails, and an example of a good answer. It is sent on every
     request but kept concise to avoid token waste.
  3. The live tool state is sent with every request, so the assistant uses
     the current numbers and does not invent values.

The Gemini API key stays server-side only, as a Cloudflare Worker secret. No
user data is used to train the base model, and the Worker does not log or
store questions, tool state or answers. Responses are interpretation support
only and should be checked before any policy use.

Future enhancement (optional): if you later want a larger knowledge base
built from manuscripts, policy briefs, PDFs or technical documentation,
implement Retrieval-Augmented Generation (RAG) using Gemini File Search or a
small Worker-side retrieval store, and inject only the most relevant passages
into each request. This keeps prompts small while grounding answers in your
documents.

----------------------------------------------------------------------
CHANGELOG - V17 (version 4.3.2)
----------------------------------------------------------------------
- AI model upgraded to gemini-3.5-flash (configurable via GEMINI_MODEL).
- Generation config is now model aware: the 2.5 "thinking budget" field is
  only sent to 2.5 models, since Gemini 3.x uses a different thinking
  control. This prevents quick-button failures after the model upgrade.
- Quick buttons now use exactly the same request pathway as free text:
  same Worker, same tool state, same model, same rendering. A short label is
  shown in the chat while the fuller instruction is sent to the model.
- Quick prompts shortened so they are less likely to time out or be cut off.
- Real backend errors are now shown ("The AI request did not complete.
  Backend message: ... [CODE]") instead of a misleading generic message.
- Worker returns structured JSON errors with clear codes, adds a request
  timeout, and authenticates with a header rather than a URL key.
- Domain grounding added: strengthened system prompt plus an embedded
  eMANDEVAL knowledge base sent on every request (no fine-tuning).
- Added .gitignore; updated CHATBOT_TESTS.md and deployment guide.
- Scientific LC model, class shares, support formula, cost defaults and
  benefit-cost calculations are unchanged.
