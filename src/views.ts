// Server-rendered HTML for the freelancer and client pages. Every dynamic value goes through escapeHtml.
import { HONOR_PERIOD_MS } from "./paypal.ts";
import type { Milestone, Status } from "./store.ts";

export type Messages = { notice?: string | null; error?: string | null };

const STATUS: Record<Status, { label: string; tone: string }> = {
  AWAITING_HOLD: { label: "Waiting for the client to hold the payment", tone: "wait" },
  FUNDS_HELD: { label: "Money held · work in progress", tone: "held" },
  IN_REVIEW: { label: "Work submitted · client reviewing", tone: "review" },
  PAID: { label: "Paid", tone: "ok" },
  HOLD_RELEASED: { label: "Rejected · hold released", tone: "bad" },
  DECLINED: { label: "PayPal declined the hold", tone: "bad" },
};

const STEPS = ["Checklist agreed", "Money held", "Work checked", "Paid"];
const STEP_REACHED: Record<Status, number> = { AWAITING_HOLD: 1, FUNDS_HELD: 2, IN_REVIEW: 3, PAID: 4, HOLD_RELEASED: 3, DECLINED: 1 };

const VERDICT = {
  met: { icon: "✓", label: "Met" },
  not_met: { icon: "✕", label: "Not met" },
  client_to_check: { icon: "?", label: "For you to check" },
};

export const DEMO = {
  title: "Restaurant website: home, menu and contact",
  brief:
    "Website for Mama Thandi's Kitchen, a family restaurant in East London. It needs a homepage with our opening hours, " +
    "a menu page with every dish and its price, and a contact page with our phone number and a form to book a table. " +
    "It must work well on phones and feel warm and welcoming.",
  amount: "150",
};

// ---- Pages ----

export function home(milestones: Milestone[], appUrl: string, demo: boolean, messages: Messages): string {
  const value = (field: keyof typeof DEMO) => (demo ? ` value="${escapeHtml(DEMO[field])}"` : "");
  const rows = milestones
    .map(
      (m) => `<li>
        <div><a href="/m/${m.id}"><strong>${escapeHtml(m.title)}</strong></a>${statusPill(m.status)}</div>
        <div class="row-end"><strong>$${m.amount}</strong><a class="small" href="/c/${m.id}">Client view</a></div>
      </li>`,
    )
    .join("");
  return layout(
    "Proof-of-Done",
    "freelancer",
    messages,
    `<section class="hero">
      <h1>Get paid for finished work, with proof.</h1>
      <p>Your client's money is held by PayPal while you work. When you deliver, an AI checks the website against the
      checklist you both agreed on, and the client approves the payment with the evidence in front of them.</p>
    </section>
    <form class="card" method="post" action="/milestones" data-busy="The AI is drafting the checklist…">
      <div class="row"><h2>New milestone</h2>${demo ? "" : `<a class="small" href="/?demo">Fill in the demo example</a>`}</div>
      <label>What you'll deliver <input name="title" maxlength="127" required${value("title")} placeholder="Restaurant website: home, menu and contact"></label>
      <label>The client's brief <textarea name="brief" rows="5" minlength="10" maxlength="2000" required placeholder="Paste what the client asked for">${demo ? escapeHtml(DEMO.brief) : ""}</textarea></label>
      <label>Amount (USD) <input name="amount" inputmode="decimal" required${value("amount")} placeholder="150"></label>
      <button class="primary">Draft the checklist with AI</button>
      ${demo ? `<p class="muted small">Demo tip: when it's time to submit work, use <code>${escapeHtml(appUrl)}/demo/</code>, a sample site with deliberate gaps.</p>` : ""}
    </form>
    ${rows ? `<section class="card"><h2>Your milestones</h2><ul class="list">${rows}</ul></section>` : ""}`,
  );
}

export function freelancerPage(m: Milestone, appUrl: string, messages: Messages): string {
  const clientLink = `${appUrl}/c/${m.id}`;
  const lastChange = m.status === "FUNDS_HELD" ? m.changeRequests.at(-1) : undefined;
  let action = "";
  if (m.status === "AWAITING_HOLD") {
    action = `<section class="card">
      <h2>Send this link to your client</h2>
      <p>They review the checklist and hold the payment with PayPal. You start work once the money is held.</p>
      <div class="copy"><code>${escapeHtml(clientLink)}</code><a class="button" href="/c/${m.id}">Open as client</a></div>
    </section>`;
  } else if (m.status === "FUNDS_HELD") {
    action = `<form class="card" method="post" action="/m/${m.id}/submit" data-busy="Checking the website… this takes up to a minute">
      <h2>Submit your work</h2>
      ${lastChange ? `<p class="notice error">Your client asked for changes: “${escapeHtml(lastChange.note)}”</p>` : ""}
      <p>${heldUntil(m)} Enter the live website address. The app visits it, collects evidence and checks it against the checklist.</p>
      <label>Website address <input name="url" type="url" required placeholder="${escapeHtml(appUrl)}/demo/"></label>
      <button class="primary">Submit and run the checks</button>
    </form>`;
  }
  return layout(
    m.title,
    "freelancer",
    messages,
    `${header(m)}
    ${action}
    ${m.status === "IN_REVIEW" ? `<p class="notice">Your client is reviewing the report below. <a href="/c/${m.id}">Open as client</a></p>` : ""}
    ${outcome(m)}
    ${m.submission ? report(m) : checklist(m)}`,
  );
}

export function clientPage(m: Milestone, messages: Messages): string {
  let action = "";
  if (m.status === "AWAITING_HOLD") {
    action = `<form class="card" method="post" action="/c/${m.id}/hold" data-busy="Opening PayPal…">
      <h2>Hold the payment</h2>
      <p>PayPal holds <strong>$${m.amount}</strong> on your account. <strong>You're not charged yet.</strong>
      You pay only when you approve the finished work. If you reject it, the hold is released.</p>
      <p class="muted small">By holding the payment, you agree to the checklist below.</p>
      <button class="primary">Hold $${m.amount} with PayPal</button>
    </form>`;
  } else if (m.status === "FUNDS_HELD") {
    action = `<section class="card"><h2>Money held. Waiting for the work.</h2><p>${heldUntil(m)} You'll review the evidence report when the freelancer delivers.</p></section>`;
  } else if (m.status === "IN_REVIEW") {
    action = `<section class="card decide">
      <h2>Your decision</h2>
      <p>Read the evidence report below, then decide. The AI doesn't decide for you.</p>
      <form method="post" action="/c/${m.id}/approve" data-busy="Sending the payment…"><button class="primary">Approve and pay $${m.amount}</button></form>
      <form method="post" action="/c/${m.id}/changes" data-busy="Sending your note…" class="changes">
        <label>Or ask for changes <textarea name="note" rows="2" minlength="3" maxlength="1000" required placeholder="The booking form is missing"></textarea></label>
        <button>Request changes (money stays on hold)</button>
      </form>
      <form method="post" action="/c/${m.id}/reject" data-busy="Releasing the hold…" data-confirm="Reject the work and release the hold? You won't be charged."><button class="danger">Reject and release the hold</button></form>
    </section>`;
  }
  return layout(
    m.title,
    "client",
    messages,
    `${header(m)}
    <section class="card"><h2>What you asked for</h2><p class="brief">${escapeHtml(m.brief)}</p></section>
    ${action}
    ${outcome(m)}
    ${m.submission ? report(m) : checklist(m)}`,
  );
}

export function notFound(): string {
  return layout("Not found", undefined, {}, `<section class="card"><h1>Page not found</h1><p><a href="/">Back to the start</a></p></section>`);
}

// ---- Pieces ----

function header(m: Milestone): string {
  const reached = STEP_REACHED[m.status];
  const steps = STEPS.map((step, i) =>
    i < reached ? `<li class="done">✓ ${step}</li>` : `<li class="${i === reached ? "current" : ""}">${step}${i === reached ? " (next)" : ""}</li>`,
  ).join("");
  return `<section class="title">
    <div class="row"><h1>${escapeHtml(m.title)}</h1><span class="amount">$${m.amount}</span></div>
    ${statusPill(m.status)}
    <ol class="steps">${steps}</ol>
  </section>`;
}

function checklist(m: Milestone): string {
  const items = m.criteria
    .map((c) => `<li><span>${escapeHtml(c.text)}</span><span class="tag">${c.checkable ? "Checked automatically" : "Client checks"}</span></li>`)
    .join("");
  return `<section class="card"><h2>Agreed checklist</h2><p class="muted small">Drafted by AI (Gemini) from the brief.</p><ul class="checklist">${items}</ul></section>`;
}

function outcome(m: Milestone): string {
  if (m.status === "PAID") {
    return `<p class="notice ok">Approved. PayPal capture <code>${escapeHtml(m.capture?.id ?? "")}</code> is ${escapeHtml(m.capture?.status ?? "")}.</p>`;
  }
  if (m.status === "HOLD_RELEASED") return `<p class="notice error">The client rejected the work. The hold was released and nobody was charged.</p>`;
  if (m.status === "DECLINED") return `<p class="notice error">PayPal declined the hold.</p>`;
  return "";
}

function report(m: Milestone): string {
  const { url, evidence, verdict } = m.submission!;
  const results = m.criteria.map((criterion, index) => ({
    criterion,
    result: verdict.results.find((r) => r.index === index) ?? {
      index,
      verdict: "client_to_check" as const,
      evidence: "The AI didn't assess this one, so please check it yourself.",
    },
  }));
  const count = (v: keyof typeof VERDICT) => results.filter((r) => r.result.verdict === v).length;
  const items = results
    .map(({ criterion, result }) => `<li class="${result.verdict}">
      <span class="icon" aria-label="${VERDICT[result.verdict].label}">${VERDICT[result.verdict].icon}</span>
      <div><strong>${escapeHtml(criterion.text)}</strong><p>${escapeHtml(result.evidence)}</p></div>
    </li>`)
    .join("");
  return `<section class="card">
    <h2>Evidence report</h2>
    <p class="muted small">Checked <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
      on ${formatDate(evidence.checkedAt)}: ${evidence.pages.length} pages, ${evidence.linksChecked} links.</p>
    <div class="tally"><span class="met">${count("met")} met</span><span class="not_met">${count("not_met")} not met</span><span class="client_to_check">${count("client_to_check")} for you to check</span></div>
    <p>${escapeHtml(verdict.summary)}</p>
    <ul class="results">${items}</ul>
    <details><summary>What the AI was shown</summary>${evidenceTable(m)}</details>
  </section>`;
}

function evidenceTable(m: Milestone): string {
  const { evidence } = m.submission!;
  const rows = evidence.pages
    .map((p) => `<tr><td>${escapeHtml(p.url)}</td><td>${p.status}</td><td>${p.loadMs} ms</td><td>${p.hasMobileViewport ? "Yes" : "No"}</td>
      <td>${p.imagesMissingAlt}/${p.images}</td><td>${p.forms.length}</td></tr>`)
    .join("");
  const broken = evidence.brokenLinks.map((l) => `<li>${escapeHtml(l.url)}: ${escapeHtml(l.status)}</li>`).join("");
  return `<div class="scroll"><table>
      <tr><th>Page</th><th>Status</th><th>Load</th><th>Phone-ready</th><th>Images without alt text</th><th>Forms</th></tr>${rows}
    </table></div>
    <p class="small">HTTPS: ${evidence.https ? "yes" : "no"} · Contact links: ${escapeHtml(evidence.contactLinks.join(", ") || "none")}</p>
    <p class="small">Broken links: ${broken ? `</p><ul class="small">${broken}</ul>` : "none</p>"}
    ${evidence.errors.length ? `<p class="small">Couldn't load: ${escapeHtml(evidence.errors.join("; "))}</p>` : ""}`;
}

function heldUntil(m: Milestone): string {
  const created = m.authorization?.create_time;
  if (!created) return "";
  return `PayPal guarantees the held money until ${formatDate(new Date(Date.parse(created) + HONOR_PERIOD_MS).toISOString())}; after that the app renews the hold when work is submitted.`;
}

function statusPill(status: Status): string {
  return `<span class="pill ${STATUS[status].tone}">${STATUS[status].label}</span>`;
}

function layout(title: string, role: "freelancer" | "client" | undefined, messages: Messages, body: string): string {
  const roleLabel = role ? `<span class="role">Viewing as <strong>${role === "client" ? "Client" : "Freelancer"}</strong></span>` : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Proof-of-Done</title>
<style>${CSS}</style>
</head>
<body>
<header class="top"><a class="brand" href="/">Proof-of-Done</a>${roleLabel}</header>
<main>
${messages.error ? `<p class="notice error" role="alert">${escapeHtml(messages.error.slice(0, 400))}</p>` : ""}
${messages.notice ? `<p class="notice ok" role="status">${escapeHtml(messages.notice.slice(0, 400))}</p>` : ""}
${body}
<footer class="muted small">PayPal sandbox demo · AI checks by Gemini · The client always makes the final call.</footer>
</main>
<script>
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) return event.preventDefault();
  const button = form.querySelector("button");
  if (form.dataset.busy && button) {
    setTimeout(() => { for (const b of document.querySelectorAll("button")) b.disabled = true; }, 0);
    button.textContent = form.dataset.busy;
  }
});
</script>
</body>
</html>`;
}

const dateFormat = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });

function formatDate(iso: string): string {
  return `${dateFormat.format(new Date(iso))} SAST`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const CSS = `
:root { color-scheme: light; --bg: #f6f7f9; --card: #fff; --text: #16181d; --muted: #5b6270; --line: #e2e5ea;
  --accent: #0057d8; --ok: #12784a; --ok-bg: #e7f6ee; --bad: #c42b2b; --bad-bg: #fdecec; --held: #9a5b00; --held-bg: #fff4e0;
  --you: #5b4bc4; --you-bg: #efedfc; }
@media (prefers-color-scheme: dark) { :root { color-scheme: dark; --bg: #111317; --card: #1a1d23; --text: #eceef2; --muted: #a2a9b6;
  --line: #2c313a; --accent: #5b9bff; --ok: #4cc38a; --ok-bg: #12291f; --bad: #ff6b6b; --bad-bg: #331616; --held: #f0b45a;
  --held-bg: #2f2410; --you: #a99cff; --you-bg: #221e3d; } }
* { box-sizing: border-box; }
body { margin: 0; font: 16px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
main { max-width: 760px; margin: 0 auto; padding: 8px 16px 48px; }
a { color: var(--accent); }
h1 { font-size: 1.6rem; line-height: 1.25; margin: 0; }
h2 { font-size: 1.1rem; margin: 0 0 8px; }
.top { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 16px; max-width: 760px; margin: 0 auto; }
.brand { font-weight: 800; text-decoration: none; color: var(--text); }
.role { font-size: .875rem; color: var(--muted); }
.hero { padding: 16px 0 4px; }
.hero h1 { font-size: 2rem; }
.hero p { color: var(--muted); max-width: 60ch; }
.title { margin: 16px 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 18px; margin: 16px 0; }
.row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.row-end { display: flex; gap: 12px; align-items: baseline; }
.amount { font-size: 1.4rem; font-weight: 700; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
label { display: block; margin-bottom: 14px; font-weight: 600; }
input, textarea { display: block; width: 100%; margin-top: 6px; padding: 10px 12px; font: inherit; color: inherit;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px; }
button, .button { display: inline-block; padding: 10px 16px; font: inherit; font-weight: 600; color: var(--text); text-decoration: none;
  background: var(--card); border: 1px solid var(--line); border-radius: 10px; cursor: pointer; }
button:disabled { opacity: .6; cursor: wait; }
.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.danger { color: var(--bad); border-color: var(--bad); }
.pill { display: inline-block; margin: 8px 0; padding: 3px 10px; border-radius: 999px; font-size: .8rem; font-weight: 600; }
.pill.wait { background: var(--line); }
.pill.held { background: var(--held-bg); color: var(--held); }
.pill.review { background: var(--you-bg); color: var(--you); }
.pill.ok { background: var(--ok-bg); color: var(--ok); }
.pill.bad { background: var(--bad-bg); color: var(--bad); }
.list .pill { margin: 0 0 0 8px; }
.steps { display: flex; gap: 6px; padding: 0; margin: 8px 0 0; list-style: none; counter-reset: step; flex-wrap: wrap; }
.steps li { counter-increment: step; font-size: .8rem; color: var(--muted); padding: 4px 10px; border-radius: 999px; border: 1px solid var(--line); }
.steps li::before { content: counter(step) ". "; }
.steps li.done { color: var(--ok); border-color: var(--ok); }
.steps li.current { color: var(--text); border-style: dashed; }
.list, .checklist, .results { list-style: none; padding: 0; margin: 0; }
.list li { display: flex; justify-content: space-between; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.checklist li { display: flex; justify-content: space-between; gap: 12px; padding: 10px 0; border-top: 1px solid var(--line); }
.tag { flex: none; font-size: .75rem; color: var(--muted); }
.results li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--line); }
.results p { margin: 4px 0 0; color: var(--muted); font-size: .925rem; }
.icon { flex: none; width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-weight: 800; }
.met .icon { background: var(--ok-bg); color: var(--ok); }
.not_met .icon { background: var(--bad-bg); color: var(--bad); }
.client_to_check .icon { background: var(--you-bg); color: var(--you); }
.tally { display: flex; gap: 8px; flex-wrap: wrap; margin: 8px 0; }
.tally span { padding: 4px 10px; border-radius: 999px; font-size: .85rem; font-weight: 600; }
.tally .met { background: var(--ok-bg); color: var(--ok); }
.tally .not_met { background: var(--bad-bg); color: var(--bad); }
.tally .client_to_check { background: var(--you-bg); color: var(--you); }
.decide form { margin: 12px 0 0; }
.changes { padding-top: 12px; border-top: 1px solid var(--line); }
.copy { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.copy code { flex: 1; min-width: 0; overflow-wrap: anywhere; padding: 10px; background: var(--bg); border-radius: 8px; }
.brief { white-space: pre-wrap; margin: 0; }
.notice { padding: 12px 14px; border-radius: 10px; background: var(--you-bg); }
.notice.ok { background: var(--ok-bg); }
.notice.error { background: var(--bad-bg); }
details { margin-top: 12px; }
summary { cursor: pointer; font-weight: 600; }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; font-size: .8rem; margin-top: 8px; }
th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--line); vertical-align: top; }
td:first-child { overflow-wrap: anywhere; min-width: 160px; }
footer { margin-top: 32px; text-align: center; }
`;
