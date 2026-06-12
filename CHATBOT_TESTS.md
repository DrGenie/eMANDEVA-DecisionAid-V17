# Policy Assistant test cases (V17)

Run these after deploying the Worker and pushing the frontend. The assistant
must always use the live tool state and must never invent numbers. Quick
buttons must behave exactly like typing the same prompt in the free text box.

## A. Core behaviour

1. Free-text prompt works
   - Type: "Explain the results in lay terms for the public".
   - Expect: a clear, complete answer using the current values; it says
     predicted support is stated-preference support, not actual uptake.

2. Every quick button works (not the generic offline message)
   - Click each: Explain this result, Improve support, Draft policy briefing,
     Explain for the public, Identify risks, Compare saved options, Explain the
     LC model, List assumptions and limitations.
   - Expect: each returns a real AI answer. None should show a generic
     "temporarily unavailable" message when the backend is healthy.

3. Quick buttons and free text render identically
   - The same formatting (paragraphs and bullets), the same panel, the same
     Copy response and Add to report buttons, and scrolling all work.

4. Tool state is included in the request
   - In DevTools Network, open the POST to /api/emandeval-chat and confirm the
     body contains question, actionType, and a populated toolState (country,
     predictedSupportPercent, classBreakdown, benefitCost).

## B. Error handling (real messages, not the generic one)

5. Backend errors are shown with detail
   - Temporarily set GEMINI_MODEL to an invalid name (for example
     "gemini-does-not-exist") and redeploy the Worker.
   - Ask any question. Expect a message like: "The AI request did not complete.
     Backend message: ... [MODEL_NOT_AVAILABLE]". Restore the model afterwards.

6. Long question fails gracefully
   - Paste a very long question (near 1500 characters) that forces a long
     answer. Expect either a complete answer or a clear message such as
     GEMINI_EMPTY_RESPONSE asking for a shorter question, not a silent failure.

7. Rate limit / quota messages are clear
   - If you exceed the free tier or the per minute limit, expect a clear
     RATE_LIMITED message, not the generic offline text.

8. Empty AI response
   - If Gemini returns no text, expect a GEMINI_EMPTY_RESPONSE message asking to
     shorten or refine the question.

9. Timeout
   - If the model does not respond in time, expect a GEMINI_TIMEOUT message.

## C. Saved options

10. Compare saved options with none saved
    - With no saved options, click Compare saved options. Expect: it says saved
      options are needed first.

11. Compare saved options with options saved
    - Save two or more options, then click Compare saved options. Expect: a
      concise comparison on predicted support, benefit-cost ratio and net
      benefit.

## D. Security

12. No API key in the frontend
    - View page source and assistant.js. Confirm no Gemini API key appears.
    - Search the repository for the key value. It must not be found.

13. Requests go only to the Worker
    - In DevTools, confirm requests go to
      https://emandeval-chat.drgenie.workers.dev/api/emandeval-chat and never to
      generativelanguage.googleapis.com from the browser.

## E. Guardrails (all responses)

14. Predicted support is described as stated-preference support, not actual
    uptake or compliance.
15. No legal advice and no medical advice.
16. Never states the policy should definitely be implemented.
17. Uses only the current tool state; does not invent numbers.
18. Explains assumptions and limitations when relevant.
19. Stays within Australia, France and Italy, or clearly frames anything else as
    outside the model.
