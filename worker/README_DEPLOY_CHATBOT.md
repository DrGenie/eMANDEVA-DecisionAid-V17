# Deploy the eMANDEVAL Policy Assistant (free tier)

This sets up the AI chatbot at no direct cost for prototype and low usage. The
browser never holds the API key. The frontend calls only your Cloudflare
Worker, and the Worker calls Gemini server side.

    GitHub Pages frontend  ->  Cloudflare Worker  ->  Gemini API  ->  answer

> Free tier note: this uses Cloudflare Workers Free and the Gemini API free
> tier. Free tier quotas, model availability and provider terms can change.
> Public or high traffic use may later require paid hosting or paid model
> access.

---

## Which files go where

Two parts. Deploy both.

1. Frontend (GitHub Pages repo): `index.html`, `app.js`, `assistant.js`,
   `styles.css`, `methodology.html`, `README.txt`, `CHATBOT_TESTS.md`. These
   replace the matching files in your Pages repository. The chatbot UI, the
   open/close/minimise behaviour, copy and add to report, and the response
   formatting all live here.
2. Backend (Cloudflare Worker): the `worker/` folder, which contains
   `src/index.js`, `wrangler.toml`, `package.json`, and this guide. The AI
   call, the token limits, the thinking-off setting that prevents cut-off
   answers, the CORS rules and the rate limit live here.

## Already deployed an earlier version? Redeploy both

If your answers were getting cut off after a few lines, that fix is in the
Worker (`worker/src/index.js`: thinking is disabled and the output token
budget is raised). You MUST redeploy the Worker for it to take effect:

```
cd worker
wrangler deploy
```

The open/close/minimise, scrolling, formatting and copy fixes are in the
frontend, so also push the updated `index.html`, `assistant.js` and
`styles.css` to GitHub Pages. The Worker URL is already set in `assistant.js`.

---

## Step 1. Create a free Gemini API key

1. Go to Google AI Studio at https://aistudio.google.com/app/apikey
2. Sign in and create (or copy) a Gemini API key.
3. Copy the key somewhere safe for the next step.
4. Do NOT paste the key into any frontend file, into `assistant.js`, or into
   the GitHub repository. It belongs only in the Cloudflare secret below.

## Step 2. Create a free Cloudflare account and install Wrangler

1. Sign up at https://dash.cloudflare.com (free plan is fine).
2. Install Wrangler (the Workers command line tool):

   ```
   npm install -g wrangler
   ```

3. Log in:

   ```
   wrangler login
   ```

## Step 3. Deploy the Worker

From the folder that contains this file:

```
cd worker
npm install
wrangler secret put GEMINI_API_KEY
```

When prompted, paste your Gemini key and press Enter. It is stored encrypted by
Cloudflare and is never written to the repo.

Optional: set or change the model. The default in `wrangler.toml` is
`gemini-3.5-flash`. The model is configurable, so you can change it WITHOUT
editing code: edit `GEMINI_MODEL` under `[vars]` in `worker/wrangler.toml` and
redeploy, or set it as a variable. Good alternatives if a model is not
available on your key or tier: `gemini-3.1-flash-lite`, or `gemini-2.5-flash`.
If you pick an unavailable model, the assistant now shows a clear
`MODEL_NOT_AVAILABLE` message so you know to switch.

```
# example: change the model without touching code, then redeploy
# (edit GEMINI_MODEL in worker/wrangler.toml, then:)
npx wrangler deploy
```

Then deploy:

```
wrangler deploy
```

Wrangler prints a URL like:

```
https://emandeval-chat.YOUR-SUBDOMAIN.workers.dev
```

## Step 4. The Worker URL is already set

`assistant.js` is already configured with your deployed Worker URL:

```
const CHATBOT_WORKER_URL = "https://emandeval-chat.drgenie.workers.dev/api/emandeval-chat";
```

If your Worker subdomain ever changes, update that one line (keep the
`/api/emandeval-chat` path), then commit and push:

```
git add assistant.js
git commit -m "Update Policy Assistant Worker URL"
git push
```

## Step 5. Allow your site origin (CORS)

The Worker only answers requests from origins you allow. The default already
includes `https://drgenie.github.io`. If your Pages site is on a different
origin, update `ALLOWED_ORIGINS` in `worker/wrangler.toml` (comma separated),
then run `wrangler deploy` again. Use the scheme and host only, with no path,
for example `https://drgenie.github.io`.

## Step 6. Test

1. Open the GitHub Pages tool.
2. Click "Ask Policy Assistant".
3. Try the quick buttons (Explain this result, Explain the LC model, and so on).
4. Type a free text question, for example "What does this predicted support mean?".
5. Open browser DevTools (Network tab) and confirm requests go to your Worker
   URL, not to Google, and that no API key appears anywhere in the page source.
6. Confirm a graceful message appears if the backend is briefly unavailable.

## Step 7. Security check

1. In the repo, search for `GEMINI_API_KEY` and for the actual key value. The
   key value must NOT appear anywhere in the repository.
2. Confirm the secret is set in Cloudflare: `wrangler secret list`.
3. Confirm CORS is limited to your GitHub Pages origin in `wrangler.toml`.

## Step 8. Free tier use

- Keep responses short; the Worker caps output length already.
- The frontend limits each session to 20 messages, and the Worker limits
  question length and tool state size and applies a light per IP throttle.
- Monitor usage in the Cloudflare dashboard and in Google AI Studio.
- If a quota is exceeded, users see a clear fallback message and the rest of
  the decision aid keeps working.

---

## Troubleshooting

- "AI assistant is unavailable": check the Worker URL in `assistant.js`, that
  the `GEMINI_API_KEY` secret is set, and that you are within the free tier
  quota.
- CORS error in the console: the request origin is not in `ALLOWED_ORIGINS`.
  Add it in `wrangler.toml` and redeploy.
- 401 or 403 from the Worker: the Gemini API key is missing or invalid. Re-run
  `wrangler secret put GEMINI_API_KEY` and redeploy.
- 429 from the Worker: rate limit or quota reached. Wait and retry, or reduce
  message frequency.
- API key exposed warning: if a key ever appears in the frontend or repo,
  rotate it in Google AI Studio immediately, then set the new key with
  `wrangler secret put GEMINI_API_KEY` and redeploy. Never commit keys.
- Responses stop after a few lines: redeploy the Worker. The fix disables
  model "thinking" (which was consuming the output budget) and raises
  maxOutputTokens. Run `cd worker` then `wrangler deploy`.
- Chatbot gives generic or empty answers: confirm the tool state is being sent.
  In DevTools, inspect the POST body to `/api/emandeval-chat` and check that
  `toolState` is populated. Apply a design in the tool first.

---

## V17 deploy from GitHub Codespaces (exact commands)

From the repository root in Codespaces:

```
cd worker
npm install
npm install --save-dev wrangler@latest

# authenticate (paste your Cloudflare API token)
export CLOUDFLARE_API_TOKEN="PASTE_CLOUDFLARE_TOKEN_HERE"
npx wrangler whoami

# the Gemini key is already a secret from earlier; confirm it exists
npx wrangler secret list
# if it is missing, set it:
# npx wrangler secret put GEMINI_API_KEY

# deploy the Worker
npx wrangler deploy
```

Confirm the Worker stays at:

```
https://emandeval-chat.drgenie.workers.dev
https://emandeval-chat.drgenie.workers.dev/api/emandeval-chat
```

Then commit the frontend and Worker changes and push to the V17 repo:

```
cd ..
git status
git add .gitignore assistant.js worker/src/index.js worker/wrangler.toml worker/package.json worker/README_DEPLOY_CHATBOT.md CHATBOT_TESTS.md README.txt index.html styles.css app.js methodology.html
git commit -m "Upgrade Policy Assistant to V17"
git push
```

GitHub Pages settings for the V17 repository:
- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

After it goes live, hard refresh the page (Ctrl or Cmd + Shift + R) so the new
`assistant.js` and `styles.css` are loaded rather than cached.

## Structured error codes (returned by the Worker)

The Worker returns `{ ok:false, code, message }`. The frontend shows the message
and code so problems are clear. Codes:

- `METHOD_NOT_ALLOWED` - request was not POST.
- `CORS_ORIGIN_NOT_ALLOWED` - the page origin is not in ALLOWED_ORIGINS.
- `INVALID_JSON` - bad body or missing question.
- `QUESTION_TOO_LONG` - question over 1500 characters.
- `TOOL_STATE_TOO_LARGE` - tool state payload too large.
- `RATE_LIMITED` - per minute limit or provider quota reached.
- `GEMINI_KEY_MISSING` - the GEMINI_API_KEY secret is not set.
- `GEMINI_API_ERROR` - the model API returned an error (details included).
- `GEMINI_EMPTY_RESPONSE` - the model returned no text; ask shorter.
- `GEMINI_TIMEOUT` - the model did not respond in time.
- `MODEL_NOT_AVAILABLE` - the selected model is not available for this key.
- `GEMINI_BLOCKED` - blocked by the safety filter.
- `UNKNOWN_ERROR` - any other error.

The Gemini API key is never included in any error message; it is redacted if it
ever appears in upstream text.
