# Proof-of-Done

**Milestone payments for freelancers where "done" is backed by evidence.**

Freelancers deliver the work and then wait to be paid, or argue about whether "done" means done. Proof-of-Done fixes both sides:

- The **client's money is held by PayPal** while the freelancer works. The freelancer knows it exists, and the client isn't charged yet.
- When the work is delivered, the app **visits the live website, collects evidence, and an AI checks it against the checklist both sides agreed on**.
- The **client makes the final call** with the evidence in front of them: approve and pay, ask for changes, or reject and release the hold. The AI never moves money.

Built by a student freelancer in East London, South Africa, who builds websites for local restaurants.

## How it works

| Step | Who | What happens | Tech |
|---|---|---|---|
| 1. Agree | Freelancer | Pastes the client's brief. The AI turns it into 3–8 concrete checklist items, each marked "checked automatically" or "client checks" (taste). | Gemini, structured JSON output |
| 2. Hold | Client | Reviews the checklist and holds the payment. Nothing is charged. | PayPal Orders v2, `intent: AUTHORIZE` |
| 3. Deliver | Freelancer | Submits the live website address. A crawler visits up to 8 pages and records headings, text, forms, phone links, image alt text, phone-ready settings and broken links. | Plain HTTP and HTML parsing, no AI |
| 4. Check | AI | Judges each checklist item **only from that evidence**: ✓ met, ✕ not met, or ? for the client, with a quote or count as proof. | Gemini, structured JSON output |
| 5. Decide | Client | Approve → PayPal **captures** the hold. Request changes → the money stays held. Reject → PayPal **voids** the hold. | PayPal Payments v2 capture / void / reauthorize |

## Try the demo

1. Open the app and click **Fill in the demo example**, then **Draft the checklist with AI**.
2. Click **Open as client**, then **Hold $150.00 with PayPal**. Log in with a PayPal **sandbox personal** account. For judges, the test buyer login is in the Devpost submission.
3. Back on the freelancer page, submit the built-in demo site: `<app address>/demo/`. It's a restaurant site with deliberate gaps: no booking form, a broken Gallery link, and an image without alt text.
4. Open the client view to read the evidence report, then approve, request changes, or reject.

## Design decisions

- **Evidence, not opinion.** The crawler collects facts without AI. The AI only judges against those facts and must cite them. The raw evidence is shown under "What the AI was shown".
- **PayPal's 3-day catch.** PayPal holds authorized money for 29 days but only *guarantees* it for the first 3 (the honor period). When work is submitted on a hold older than 3 days, the app **reauthorizes** first, so the client reviews inside a fresh guarantee.
- **Prompt injection.** Website text is written by the freelancer, so the AI is told to treat it as untrusted and ignore instructions in it. The client still decides.
- **Safe crawling.** The checker refuses private-network addresses and checks every redirect, so a submitted URL can't probe the server's own network.
- **Safe retries.** Every PayPal call that moves money sends a `PayPal-Request-Id`, so a double click or a retry can't capture twice.
- **Free-tier friendly.** AI calls are capped per hour (`MAX_AI_CALLS_PER_HOUR`, default 40). If a Gemini model is busy, the app falls back through other Flash models.

## AI and tools used

| Tool | How it's used |
|---|---|
| **Google Gemini** (`gemini-3.8-flash`, with Flash fallbacks) via `@google/genai` | Drafts the acceptance checklist from the brief, and judges each item against the crawled evidence. Both calls use a JSON schema (zod) and the answer is validated before it's shown. |
| **PayPal REST APIs (sandbox)** | Orders v2 (`AUTHORIZE` intent), Payments v2 authorizations: capture, void, reauthorize. |
| `node-html-parser` | Reads the delivered pages for the evidence report. |
| Claude Code | AI pair-programmer used to build the project. |

## Run it yourself

You need Node.js 24 or newer.

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | [developer.paypal.com](https://developer.paypal.com/) → Apps & Credentials → **Sandbox** → your app |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com/) → Get API key (free) |
| `ALLOW_LOCAL_URLS=true` | Local only: lets the checker visit the demo site on `localhost` |

```bash
npm run check   # verifies both keys without printing them
npm start       # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm start` | Run the app |
| `npm run dev` | Run and restart on file changes |
| `npm run check` | Check the PayPal and Gemini credentials |
| `npm run typecheck` | Type-check with TypeScript |

The app runs TypeScript directly on Node 24 (type stripping): no build step. Milestones are saved to `data/milestones.json`.

## Code layout

| Path | Contents |
|---|---|
| `src/server.ts` | Routes and the milestone lifecycle |
| `src/paypal.ts` | PayPal REST client: OAuth, orders, authorize, capture, void, reauthorize |
| `src/evidence.ts` | Website crawler and private-network guard |
| `src/ai.ts` | Gemini prompts, schemas, fallbacks and the hourly cap |
| `src/views.ts` | Server-rendered freelancer and client pages |
| `src/store.ts` | Milestone storage |
| `public/demo/` | Demo restaurant site with deliberate gaps |
| `docs/VALIDATION.md` | Problem research and competitors |

## Limits and next steps

- The AI checks facts on the page, not taste or design quality. Those stay with the client, and the app says so.
- Sandbox only. Live use needs PayPal live credentials, plus logins instead of unguessable links.
- Next: deeper checks (performance scores, form submissions), more deliverable types than websites, and a reminder before the 29-day hold expires.

## Sandbox test results (10 November 2026, South African accounts)

| Question | Result |
|---|---|
| Does a South African sandbox business account accept `AUTHORIZE` orders? | Yes: authorization `CREATED`, guaranteed for 3 days, expires after 29. |
| Does capture complete? | Yes: `COMPLETED`, with the authorization marked `CAPTURED`. |
| Does releasing the hold (void) work? | Yes: `VOIDED`, and the client isn't charged. |

## License

MIT. See [LICENSE](LICENSE).
