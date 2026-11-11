// Server-rendered HTML for the freelancer and client pages. Every dynamic value goes through escapeHtml.
// Design system (from the ui-ux-pro-max skill, "Trust & Authority" fintech profile): navy + trust blue,
// green/red/amber for verdicts, Plus Jakarta Sans, inline SVG icons, 44px targets, visible focus rings.
import { HONOR_PERIOD_MS } from "./paypal.ts";
import type { Milestone, Status } from "./store.ts";

export type Messages = { notice?: string | null; error?: string | null };

type Tone = "neutral" | "held" | "review" | "ok" | "bad";

const STATUS: Record<Status, { label: string; tone: Tone; icon: IconName }> = {
  AWAITING_HOLD: { label: "Waiting for the client to hold the payment", tone: "neutral", icon: "clock" },
  FUNDS_HELD: { label: "Money held · work in progress", tone: "held", icon: "lock" },
  IN_REVIEW: { label: "Work submitted · client reviewing", tone: "review", icon: "eye" },
  PAID: { label: "Paid", tone: "ok", icon: "checkCircle" },
  HOLD_RELEASED: { label: "Rejected · hold released", tone: "bad", icon: "xCircle" },
  DECLINED: { label: "PayPal declined the hold", tone: "bad", icon: "xCircle" },
};

const STEPS = ["Checklist agreed", "Money held", "Work checked", "Paid"];
const STEP_REACHED: Record<Status, number> = { AWAITING_HOLD: 1, FUNDS_HELD: 2, IN_REVIEW: 3, PAID: 4, HOLD_RELEASED: 3, DECLINED: 1 };
// What the freelancer can do next, shown as the button on each row of "Your milestones".
const NEXT_ACTION: Record<Status, string> = {
  AWAITING_HOLD: "Get the client link",
  FUNDS_HELD: "Submit your work",
  IN_REVIEW: "View the report",
  PAID: "View",
  HOLD_RELEASED: "View",
  DECLINED: "View",
};

const VERDICT = {
  met: { icon: "checkCircle", label: "Met" },
  not_met: { icon: "xCircle", label: "Not met" },
  client_to_check: { icon: "eye", label: "For you to check" },
} as const;

type Role = "freelancer" | "client";

/** Taste is the client's call, so only the client's page says "you". */
function verdictLabel(verdict: keyof typeof VERDICT, role: Role): string {
  return verdict === "client_to_check" && role === "freelancer" ? "For the client to check" : VERDICT[verdict].label;
}

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
  const how = [
    ["clipboard", "Agree on a checklist", "AI turns the client's brief into clear, checkable items."],
    ["lock", "Client holds the money", "PayPal holds the payment. Nothing is charged yet."],
    ["shieldCheck", "Work is checked", "The app visits the site and the AI cites evidence for each item."],
    ["checkCircle", "Client decides", "Approve and pay, ask for changes, or release the hold."],
  ] as const;
  const rows = milestones
    .map(
      (m) => `<li class="milestone-row">
        <a class="row-main" href="/m/${m.id}"><strong>${escapeHtml(m.title)}</strong>${statusBadge(m.status)}</a>
        <div class="row-side"><span class="money">$${m.amount}</span>
          <a class="button button-small${m.status === "FUNDS_HELD" ? " button-primary" : ""}" href="/m/${m.id}#next">${NEXT_ACTION[m.status]}</a></div>
      </li>`,
    )
    .join("");
  return layout(
    "Proof-of-Done",
    "freelancer",
    messages,
    `<section class="hero">
      <p class="eyebrow">${icon("shieldCheck", 16)} PayPal-held milestone payments</p>
      <h1>Get paid for finished work, <span class="accent">with proof.</span></h1>
      <p class="lede">Your client's money is held by PayPal while you work. When you deliver, the app checks the website against
      the checklist you both agreed on, and the client approves the payment with the evidence in front of them.</p>
    </section>
    <ol class="how">${how
      .map(([name, title, text], i) => `<li><span class="how-icon">${icon(name, 22)}</span><span class="how-step">Step ${i + 1}</span><strong>${title}</strong><span>${text}</span></li>`)
      .join("")}</ol>
    <div class="home-grid">
      <form class="card" method="post" action="/milestones" data-busy="The AI is drafting the checklist…">
        <div class="card-head">
          <h2>New milestone</h2>
          ${demo ? `<span class="badge tone-held">${icon("lightning", 14)} Example filled in</span>` : `<a class="button button-small" href="/?demo">${icon("lightning", 16)} Try an example</a>`}
        </div>
        <label for="title">What you'll deliver</label>
        <input id="title" name="title" maxlength="127" required${value("title")} placeholder="Restaurant website: home, menu and contact">
        <label for="brief">The client's brief</label>
        <textarea id="brief" name="brief" rows="5" minlength="10" maxlength="2000" required aria-describedby="brief-help" placeholder="Paste what the client asked for">${demo ? escapeHtml(DEMO.brief) : ""}</textarea>
        <p class="help" id="brief-help">The AI turns this into a checklist you'll both see before any money is held.</p>
        <label for="amount">Amount (USD)</label>
        <div class="input-money"><span aria-hidden="true">$</span><input id="amount" name="amount" inputmode="decimal" required${value("amount")} placeholder="150"></div>
        <button class="button button-primary button-block">${icon("clipboard", 18)} Draft the checklist with AI</button>      </form>
      <section class="card" id="milestones">
        <h2>Your milestones</h2>
        ${rows ? `<ul class="milestones">${rows}</ul>` : `<div class="empty">${icon("clipboard", 28)}<p>No milestones yet. The ones you create will appear here.</p></div>`}
      </section>
    </div>`,
  );
}

export function freelancerPage(m: Milestone, appUrl: string, messages: Messages): string {
  const clientLink = `${appUrl}/c/${m.clientId}`;
  // The freelancer only ever shares the client link. There is deliberately no button into the client side.
  const copyLink = `<div class="copy-field"><code id="client-link">${escapeHtml(clientLink)}</code>
        <button type="button" class="button button-small" data-copy="client-link">${icon("copy", 16)} Copy</button></div>`;
  const lastChange = m.status === "FUNDS_HELD" ? m.changeRequests.at(-1) : undefined;
  let action = "";
  if (m.status === "AWAITING_HOLD") {
    action = `<section class="card card-action" id="next">
      <p class="step-kicker">Your next step</p>
      <h2>${icon("send", 20)} Send this link to your client</h2>
      <p>They review the checklist and hold the payment with PayPal. Start work once the money is held.</p>
      ${copyLink}
      ${waiting("Waiting for your client. This page updates by itself when the money is held.")}
    </section>
    <section class="card card-locked" aria-label="Coming up">
      <p class="step-kicker">${icon("lock", 14)} Coming up</p>
      <h2>Done with the website?</h2>
      <p>Once the money is held, a box appears here to submit the finished website and run the checks.</p>
    </section>`;
  } else if (m.status === "FUNDS_HELD") {
    action = `<form class="card card-action" id="next" method="post" action="/m/${m.id}/submit" data-busy="Checking the website…">
      <p class="step-kicker">Your next step</p>
      <h2>${icon("globe", 20)} Done with the website? Submit it</h2>
      ${lastChange ? `<div class="notice tone-bad" role="status">${icon("message", 18)}<div><strong>Your client asked for changes</strong><p>“${escapeHtml(lastChange.note)}”</p></div></div>` : ""}
      <p>${heldUntil(m)}</p>
      <label for="url">Live website address</label>
      <input id="url" name="url" type="url" required placeholder="https://www.your-clients-site.com">
      <p class="help">The app visits the site, collects evidence and checks it against the checklist. This takes up to a minute.</p>
      <p class="help">No site ready yet? <button type="button" class="link-button" data-fill="url" data-value="${escapeHtml(appUrl)}/demo/">Use the sample restaurant site</button></p>
      <button class="button button-primary button-block">${icon("shieldCheck", 18)} Submit and run the checks</button>
    </form>`;
  } else if (m.status === "IN_REVIEW") {
    action = `<section class="card card-action" id="next">
      <p class="step-kicker">Nothing for you to do right now</p>
      <h2>${icon("eye", 20)} Your client is reviewing</h2>
      <p>They can approve and pay, ask for changes, or release the hold. The money stays held until they decide.</p>
      <p class="help">Their page already shows this report, so there's nothing to send.</p>
      ${waiting("Waiting for your client. This page updates by itself when they decide.")}
    </section>`;
  } else {
    action = `<section class="card card-action" id="next">
      <h2>${m.status === "PAID" ? "This milestone is finished" : "This milestone is closed"}</h2>
      <p>${m.status === "PAID" ? "The payment has been captured. Ready for the next job?" : "No money moved. You can agree a new milestone with your client."}</p>
      <a class="button button-primary button-block" href="/">${icon("clipboard", 18)} Start a new milestone</a>
    </section>`;
  }
  const back = `<a class="back-link" href="/#milestones">${icon("arrowLeft", 16)} Your milestones</a>`;
  return milestonePage(m, "freelancer", messages, m.submission ? report(m, "freelancer") : checklist(m), action, back);
}

export function clientPage(m: Milestone, messages: Messages): string {
  let action = "";
  if (m.status === "AWAITING_HOLD") {
    action = `<form class="card card-action" method="post" action="/c/${m.clientId}/hold" data-busy="Opening PayPal…">
      <h2>${icon("lock", 20)} Hold the payment</h2>
      <p>PayPal holds <strong>$${m.amount}</strong> on your account. <strong>You're not charged yet.</strong>
      You pay only when you approve the finished work. If you reject it, the hold is released.</p>
      <button class="button button-primary button-block">${icon("lock", 18)} Hold $${m.amount} with PayPal</button>
      <p class="help">By holding the payment, you agree to the checklist.</p>
    </form>`;
  } else if (m.status === "FUNDS_HELD") {
    action = `<section class="card card-action">
      <h2>${icon("lock", 20)} Money held</h2>
      <p>${heldUntil(m)}</p>
      <p class="help">You'll review an evidence report before any money moves.</p>
      ${waiting("Waiting for the freelancer to deliver. This page updates by itself when the work is submitted.")}
    </section>`;
  } else if (m.status === "IN_REVIEW") {
    action = `<section class="card card-action">
      <h2>Your decision</h2>
      <p>Read the evidence report, then decide. The AI doesn't decide for you.</p>
      <form method="post" action="/c/${m.clientId}/approve" data-busy="Sending the payment…">
        <button class="button button-primary button-block">${icon("checkCircle", 18)} Approve and pay $${m.amount}</button>
      </form>
      <form method="post" action="/c/${m.clientId}/changes" data-busy="Sending your note…" class="stack-top">
        <label for="note">Or ask for changes</label>
        <textarea id="note" name="note" rows="3" minlength="3" maxlength="1000" required placeholder="The booking form is missing"></textarea>
        <button class="button button-block">${icon("message", 18)} Request changes</button>
        <p class="help">The money stays on hold while the freelancer fixes it.</p>
      </form>
      <form method="post" action="/c/${m.clientId}/reject" data-busy="Releasing the hold…" data-confirm="Reject the work and release the hold? You won't be charged." class="stack-top">
        <button class="button button-danger button-block">${icon("xCircle", 18)} Reject and release the hold</button>
      </form>
    </section>`;
  }
  const brief = `<section class="card"><h2>What you asked for</h2><p class="brief">${escapeHtml(m.brief)}</p></section>`;
  return milestonePage(m, "client", messages, `${brief}${m.submission ? report(m, "client") : checklist(m)}`, action);
}

// A milestone link that no longer resolves is almost always the free demo server having restarted,
// so say that plainly instead of leaving a judge at a dead end.
export function notFound(milestoneLink = false): string {
  const body = milestoneLink
    ? `<h1>This milestone is no longer saved</h1><p>The server restarted after being idle and cleared its saved milestones. Nothing was charged. Start a new milestone to try again: it takes about a minute.</p>
    <a class="button button-primary" href="/">Start a new milestone</a>`
    : `<h1>Page not found</h1><p>The link may be wrong.</p>
    <a class="button button-primary" href="/">Back to the start</a>`;
  return layout(milestoneLink ? "Milestone not saved" : "Not found", undefined, {}, `<section class="card empty-page">${body}</section>`);
}

// ---- Pieces ----

function milestonePage(m: Milestone, role: "freelancer" | "client", messages: Messages, main: string, action: string, back = ""): string {
  // While the other person still has a move to make, the page watches for it and refreshes itself,
  // so nobody has to reload or go hunting for the next step.
  const open = m.status === "AWAITING_HOLD" || m.status === "FUNDS_HELD" || m.status === "IN_REVIEW";
  const watch = open ? { url: `/${role === "client" ? `c/${m.clientId}` : `m/${m.id}`}/state`, state: stateOf(m) } : undefined;
  // The outcome sits right under the summary so phones see it first, not after the whole report.
  return layout(
    m.title,
    role,
    messages,
    `${back}${summary(m)}
    ${outcome(m)}
    <div class="page-grid${action ? " has-side" : ""}">
      <div class="page-main">${main}</div>
      ${action ? `<aside class="page-side">${action}</aside>` : ""}
    </div>`,
    watch,
  );
}

/** Changes whenever either side moves the milestone forward. Pages compare it to know when to refresh. */
export function stateOf(m: Milestone): string {
  return `${m.status}:${m.changeRequests.length}:${m.submission?.submittedAt ?? ""}`;
}

function waiting(text: string): string {
  return `<p class="waiting" role="status"><span class="pulse" aria-hidden="true"></span>${text}</p>`;
}

function summary(m: Milestone): string {
  const reached = STEP_REACHED[m.status];
  const steps = STEPS.map((step, i) => {
    const state = i < reached ? "done" : i === reached ? "current" : "todo";
    return `<li class="step-${state}"${state === "current" ? ' aria-current="step"' : ""}>
      <span class="step-dot">${state === "done" ? icon("check", 14) : i + 1}</span>
      <span class="step-label">${step}${state === "current" ? '<span class="visually-hidden"> (next)</span>' : ""}</span></li>`;
  }).join("");
  return `<section class="summary card">
    <div class="summary-head">
      <div><h1>${escapeHtml(m.title)}</h1>${statusBadge(m.status)}</div>
      <div class="summary-amount"><span class="money-label">Milestone</span><span class="money-big">$${m.amount}</span></div>
    </div>
    <ol class="stepper" aria-label="Progress">${steps}</ol>
  </section>`;
}

function checklist(m: Milestone): string {
  const items = m.criteria
    .map((c) => `<li><span class="check-text">${escapeHtml(c.text)}</span>
      <span class="badge ${c.checkable ? "tone-neutral" : "tone-review"}">${c.checkable ? icon("shieldCheck", 14) : icon("eye", 14)}${c.checkable ? "Checked automatically" : "Client checks"}</span></li>`)
    .join("");
  return `<section class="card"><div class="card-head"><h2>Agreed checklist</h2><span class="help">Drafted by AI (Gemini) from the brief</span></div>
    <ul class="checklist">${items}</ul></section>`;
}

function outcome(m: Milestone): string {
  if (m.status === "PAID") {
    return `<section class="card card-outcome tone-ok">${icon("checkCircle", 28)}<div><h2>Approved and paid</h2>
      <p>PayPal capture <code>${escapeHtml(m.capture?.id ?? "")}</code> is ${escapeHtml(m.capture?.status ?? "")}.</p></div></section>`;
  }
  if (m.status === "HOLD_RELEASED") {
    return `<section class="card card-outcome tone-bad">${icon("xCircle", 28)}<div><h2>Hold released</h2><p>The client rejected the work. Nobody was charged.</p></div></section>`;
  }
  if (m.status === "DECLINED") {
    return `<section class="card card-outcome tone-bad">${icon("xCircle", 28)}<div><h2>Hold declined</h2><p>PayPal declined the hold.</p></div></section>`;
  }
  return "";
}

function report(m: Milestone, role: Role): string {
  const { url, evidence, verdict } = m.submission!;
  const results = m.criteria.map((criterion, index) => ({
    criterion,
    result: verdict.results.find((r) => r.index === index) ?? {
      index,
      verdict: "client_to_check" as const,
      evidence: "The AI didn't assess this one, so the client checks it on the site.",
    },
  }));
  const count = (v: keyof typeof VERDICT) => results.filter((r) => r.result.verdict === v).length;
  const tones = { met: "ok", not_met: "bad", client_to_check: "review" } as const;
  const items = results
    .map(({ criterion, result }) => `<li class="result tone-${tones[result.verdict]}">
      <span class="result-icon">${icon(VERDICT[result.verdict].icon, 20)}</span>
      <div><div class="result-head"><strong>${escapeHtml(criterion.text)}</strong><span class="result-label">${verdictLabel(result.verdict, role)}</span></div>
      <p>${escapeHtml(result.evidence)}</p></div>
    </li>`)
    .join("");
  return `<section class="card">
    <div class="card-head"><h2>Evidence report</h2>
      <a class="link-quiet" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${icon("external", 14)} Open the site</a></div>
    <p class="help">Checked ${escapeHtml(url)} on ${formatDate(evidence.checkedAt)} · ${evidence.pages.length} pages · ${evidence.linksChecked} links</p>
    <div class="tally">
      <div class="tally-item tone-ok"><span class="tally-num">${count("met")}</span><span>Met</span></div>
      <div class="tally-item tone-bad"><span class="tally-num">${count("not_met")}</span><span>Not met</span></div>
      <div class="tally-item tone-review"><span class="tally-num">${count("client_to_check")}</span><span>${verdictLabel("client_to_check", role)}</span></div>
    </div>
    <p class="summary-text">${escapeHtml(verdict.summary)}</p>
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
  return `<div class="table-scroll" tabindex="0" role="region" aria-label="Pages the crawler visited"><table>
      <thead><tr><th>Page</th><th>Status</th><th>Load</th><th>Phone-ready</th><th>Images without alt text</th><th>Forms</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
    <p class="help">HTTPS: ${evidence.https ? "yes" : "no"} · Contact links: ${escapeHtml(evidence.contactLinks.join(", ") || "none")}</p>
    <p class="help">Broken links: ${broken ? "" : "none"}</p>${broken ? `<ul class="help">${broken}</ul>` : ""}
    ${evidence.errors.length ? `<p class="help">Couldn't load: ${escapeHtml(evidence.errors.join("; "))}</p>` : ""}`;
}

function heldUntil(m: Milestone): string {
  const created = m.authorization?.create_time;
  if (!created) return "";
  return `PayPal guarantees the held money until ${formatDate(new Date(Date.parse(created) + HONOR_PERIOD_MS).toISOString())}; after that the hold is renewed when work is submitted.`;
}

function statusBadge(status: Status): string {
  const { label, tone, icon: name } = STATUS[status];
  return `<span class="badge tone-${tone}">${icon(name, 14)}${label}</span>`;
}

function layout(
  title: string,
  role: "freelancer" | "client" | undefined,
  messages: Messages,
  body: string,
  watch?: { url: string; state: string },
): string {
  const roleLabel = role ? `<span class="role-pill">Viewing as <strong>${role === "client" ? "Client" : "Freelancer"}</strong></span>` : "";
  const notice = (kind: "ok" | "bad", text: string) =>
    `<div class="notice tone-${kind}" role="${kind === "bad" ? "alert" : "status"}">${icon(kind === "ok" ? "checkCircle" : "xCircle", 20)}<p>${escapeHtml(text.slice(0, 400))}</p></div>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · Proof-of-Done</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">
<style>${CSS}</style>
</head>
<body${watch ? ` data-watch="${watch.url}" data-state="${escapeHtml(watch.state)}"` : ""}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="topbar"><div class="topbar-inner">
  ${
    // The client's pages have no way into the freelancer side, so for them the logo is just a logo.
    role === "client"
      ? `<span class="brand"><span class="brand-mark">${icon("shieldCheck", 18)}</span>Proof-of-Done</span>`
      : `<a class="brand" href="/"><span class="brand-mark">${icon("shieldCheck", 18)}</span>Proof-of-Done</a>`
  }${roleLabel}
</div></header>
<main id="main">
${messages.error ? notice("bad", messages.error) : ""}
${messages.notice ? notice("ok", messages.notice) : ""}
${body}
</main>
<footer class="footer">PayPal sandbox: no real money moves · AI checks by Gemini · The client always makes the final call.</footer>
<script>
document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.dataset.confirm && !confirm(form.dataset.confirm)) return event.preventDefault();
  const button = form.querySelector("button:not([type=button])");
  if (form.dataset.busy && button) {
    button.innerHTML = '<span class="spinner" aria-hidden="true"></span>' + form.dataset.busy;
    form.setAttribute("aria-busy", "true");
    setTimeout(() => { for (const b of document.querySelectorAll("button")) b.disabled = true; }, 0);
  }
});
const watch = document.body.dataset.watch;
if (watch) {
  const check = async () => {
    if (document.hidden || document.querySelector("form[aria-busy]")) return;
    try {
      const res = await fetch(watch, { cache: "no-store" });
      if (res.ok && (await res.text()) !== document.body.dataset.state) location.replace(location.pathname);
    } catch {}
  };
  setInterval(check, 4000);
  document.addEventListener("visibilitychange", check);
}
document.addEventListener("click", (event) => {
  const fill = event.target.closest("[data-fill]");
  if (fill) { const input = document.getElementById(fill.dataset.fill); input.value = fill.dataset.value; input.focus(); }
});
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  const text = document.getElementById(button.dataset.copy).textContent;
  try { await navigator.clipboard.writeText(text); button.lastChild.textContent = " Copied"; } catch { button.lastChild.textContent = " Select and copy"; }
});
</script>
</body>
</html>`;
}

// ---- Icons: inline SVG (24px grid, 1.8 stroke), hidden from screen readers because text always sits beside them ----

const ICONS = {
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  checkCircle: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.5 2.5 2.5 4.5-5"/>',
  xCircle: '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  shieldCheck: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  send: '<path d="m21 3-9.5 9.5M21 3l-6.5 18-3-8.5L3 9.5 21 3Z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  message: '<path d="M20 15a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrowLeft: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  lightning: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
} as const;

type IconName = keyof typeof ICONS;

function icon(name: IconName, size = 20): string {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

const dateFormat = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });

function formatDate(iso: string): string {
  return `${dateFormat.format(new Date(iso))} SAST`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const CSS = `
:root {
  color-scheme: light;
  --font: "Plus Jakarta Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --bg: #f5f7fb; --surface: #ffffff; --surface-2: #f1f5f9; --text: #0f172a; --muted: #475569; --border: #e2e8f0;
  --primary: #1d4ed8; --primary-hover: #1e40af; --on-primary: #ffffff; --ring: #2563eb;
  --ok: #15803d; --ok-bg: #dcfce7; --bad: #b91c1c; --bad-bg: #fee2e2;
  --review: #a16207; --review-bg: #fef3c7; --held: #1e40af; --held-bg: #dbeafe; --neutral: #334155; --neutral-bg: #e2e8f0;
  --radius: 16px; --radius-sm: 10px; --shadow: 0 1px 2px rgb(15 23 42 / .04), 0 4px 16px rgb(15 23 42 / .06);
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px; --space-7: 48px;
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #0b1120; --surface: #111a2e; --surface-2: #0f172a; --text: #e2e8f0; --muted: #a3b1c6; --border: #24324a;
    --primary: #3b82f6; --primary-hover: #60a5fa; --on-primary: #ffffff; --ring: #93c5fd;
    --ok: #4ade80; --ok-bg: #052e1a; --bad: #f87171; --bad-bg: #3b0d0d;
    --review: #fbbf24; --review-bg: #3a2604; --held: #93c5fd; --held-bg: #172554; --neutral: #cbd5e1; --neutral-bg: #1e293b;
    --shadow: 0 1px 2px rgb(0 0 0 / .3);
  }
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 400 16px/1.6 var(--font); background: var(--bg); color: var(--text); }
a { color: var(--primary); text-underline-offset: 3px; }
h1, h2 { line-height: 1.25; letter-spacing: -0.01em; margin: 0; text-wrap: balance; }
h1 { font-size: clamp(1.4rem, 1.1rem + 1.4vw, 1.9rem); font-weight: 800; }
h2 { font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: var(--space-2); }
p { margin: 0 0 var(--space-3); }
code { font-size: .9em; overflow-wrap: anywhere; }
.icon { flex: none; }
:focus-visible { outline: 3px solid var(--ring); outline-offset: 2px; border-radius: 6px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: absolute; left: var(--space-4); top: -56px; min-height: 44px; display: inline-flex; align-items: center; padding: var(--space-2) var(--space-3); background: var(--surface); border-radius: var(--radius-sm); z-index: 10; }
.skip-link:focus { top: var(--space-2); }

.topbar { position: sticky; top: 0; z-index: 5; background: color-mix(in srgb, var(--bg) 85%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid var(--border); }
.topbar-inner { max-width: 1080px; margin: 0 auto; padding: var(--space-3) var(--space-4); display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); }
.brand { display: inline-flex; align-items: center; gap: var(--space-2); font-weight: 800; color: var(--text); text-decoration: none; min-height: 44px; }
.brand-mark { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--primary); color: var(--on-primary); }
.role-pill { font-size: .85rem; color: var(--muted); background: var(--surface); border: 1px solid var(--border); padding: var(--space-1) var(--space-3); border-radius: 999px; }
.role-pill strong { color: var(--text); }

main { max-width: 1080px; margin: 0 auto; padding: var(--space-5) var(--space-4) var(--space-7); }
.footer { text-align: center; color: var(--muted); font-size: .85rem; padding: 0 var(--space-4) var(--space-6); }

.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-5); box-shadow: var(--shadow); margin-bottom: var(--space-4); }
.card-head { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); flex-wrap: wrap; margin-bottom: var(--space-3); }
.card-action h2 { margin-bottom: var(--space-3); }
#next { scroll-margin-top: 96px; }
.step-kicker { display: flex; align-items: center; gap: 6px; margin: 0 0 var(--space-1); font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--primary); }
.card-locked { border-style: dashed; box-shadow: none; background: transparent; }
.card-locked .step-kicker, .card-locked h2, .card-locked p { color: var(--muted); }
.card-locked h2 { margin-bottom: var(--space-2); }
.card-locked p:last-child { margin-bottom: 0; }
.waiting { display: flex; align-items: flex-start; gap: var(--space-2); margin: var(--space-4) 0 0; padding-top: var(--space-3); border-top: 1px solid var(--border); font-size: .875rem; color: var(--muted); }
.pulse { flex: none; width: 10px; height: 10px; margin-top: 6px; border-radius: 50%; background: var(--primary); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: .35; transform: scale(.8); } }
.back-link { display: inline-flex; align-items: center; gap: var(--space-1); min-height: 44px; margin-bottom: var(--space-2); font-weight: 600; font-size: .9rem; text-decoration: none; }
.back-link:hover { text-decoration: underline; }
.stack-top { margin-top: var(--space-4); padding-top: var(--space-4); border-top: 1px solid var(--border); }

.hero { padding: var(--space-4) 0 var(--space-5); max-width: 720px; }
.eyebrow { display: inline-flex; align-items: center; gap: var(--space-2); font-size: .85rem; font-weight: 600; color: var(--held); background: var(--held-bg); padding: var(--space-1) var(--space-3); border-radius: 999px; }
.hero h1 { font-size: clamp(1.9rem, 1.3rem + 2.6vw, 2.9rem); margin: var(--space-3) 0; }
.accent { color: var(--primary); }
.lede { font-size: 1.05rem; color: var(--muted); max-width: 62ch; }

.how { list-style: none; margin: 0 0 var(--space-5); padding: 0; display: grid; gap: var(--space-3); grid-template-columns: 1fr; }
.how li { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-3) var(--space-4);
  display: grid; grid-template-columns: 40px 1fr; column-gap: var(--space-3); row-gap: 2px; align-content: start; }
.how li > :not(.how-icon) { grid-column: 2; }
.how-icon { grid-row: span 3; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 12px; background: var(--held-bg); color: var(--held); }
.how-step { font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.how li > span:last-child { color: var(--muted); font-size: .92rem; }
.home-grid { display: grid; gap: var(--space-4); }

label { display: block; font-weight: 600; margin: var(--space-4) 0 var(--space-2); }
label:first-of-type { margin-top: 0; }
input, textarea { width: 100%; min-height: 48px; padding: var(--space-3); font: inherit; color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
input:focus-visible, textarea:focus-visible { outline: 3px solid var(--ring); outline-offset: 0; }
textarea { resize: vertical; }
.input-money { position: relative; }
.input-money span { position: absolute; left: var(--space-3); top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 600; }
.input-money input { padding-left: 28px; }
.help { color: var(--muted); font-size: .875rem; margin: var(--space-2) 0 0; }

.button { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2); min-height: 48px; padding: var(--space-2) var(--space-4);
  font: 600 1rem var(--font); color: var(--text); text-decoration: none; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-sm);
  cursor: pointer; transition: background-color .15s, border-color .15s, transform .1s; }
.button:hover { border-color: var(--muted); }
.button:active { transform: translateY(1px); }
.button:disabled { opacity: .65; cursor: progress; }
.button-small { min-height: 44px; padding: var(--space-1) var(--space-3); font-size: .9rem; }
.button-block { width: 100%; margin-top: var(--space-4); }
.button-primary { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
.button-primary:hover { background: var(--primary-hover); border-color: var(--primary-hover); }
.button-danger { color: var(--bad); border-color: color-mix(in srgb, var(--bad) 45%, var(--border)); }
.button-danger:hover { background: var(--bad-bg); border-color: var(--bad); }
.spinner { width: 16px; height: 16px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.badge { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; font-weight: 600; padding: 3px 10px; border-radius: 999px; white-space: nowrap; }
.tone-neutral { color: var(--neutral); background: var(--neutral-bg); }
.tone-held { color: var(--held); background: var(--held-bg); }
.tone-review { color: var(--review); background: var(--review-bg); }
.tone-ok { color: var(--ok); background: var(--ok-bg); }
.tone-bad { color: var(--bad); background: var(--bad-bg); }

.notice { display: flex; gap: var(--space-3); align-items: flex-start; padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); margin-bottom: var(--space-4); }
.notice p { margin: 0; color: var(--text); }
.notice strong { color: var(--text); }

.milestones, .checklist, .results { list-style: none; margin: 0; padding: 0; }
.milestone-row { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.milestone-row:first-child { border-top: 0; }
.row-main { display: grid; gap: var(--space-1); justify-items: start; color: var(--text); text-decoration: none; min-height: 44px; }
.row-main:hover strong { text-decoration: underline; }
.row-side { display: flex; align-items: center; gap: var(--space-4); }
.money { font-weight: 700; }
.link-button { background: none; border: 0; padding: 0; font: inherit; font-weight: 600; color: var(--primary); text-decoration: underline; text-underline-offset: 3px; cursor: pointer; }
.link-quiet { display: inline-flex; align-items: center; gap: var(--space-1); font-weight: 600; font-size: .9rem; min-height: 44px; }
.empty { display: grid; justify-items: center; gap: var(--space-2); text-align: center; color: var(--muted); padding: var(--space-5) 0; }

.summary-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-4); flex-wrap: wrap; }
.summary-head h1 { margin-bottom: var(--space-2); }
.summary-amount { display: grid; text-align: right; }
.money-label { font-size: .75rem; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.money-big { font-size: 1.75rem; font-weight: 800; font-variant-numeric: tabular-nums; }
.stepper { list-style: none; margin: var(--space-5) 0 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.stepper li { position: relative; display: grid; justify-items: center; gap: var(--space-2); text-align: center; font-size: .8rem; color: var(--muted); }
.stepper li + li::before { content: ""; position: absolute; top: 15px; right: 50%; width: 100%; height: 2px; background: var(--border); z-index: 0; }
.stepper li.step-done + li::before { background: var(--ok); }
.step-dot { position: relative; z-index: 1; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; font-weight: 700; background: var(--surface); border: 2px solid var(--border); }
.step-done .step-dot { background: var(--ok); border-color: var(--ok); color: var(--surface); }
.step-done { color: var(--text); }
.step-current .step-dot { border-color: var(--primary); color: var(--primary); box-shadow: 0 0 0 4px var(--held-bg); }
.step-current { color: var(--text); font-weight: 700; }

.page-grid { display: grid; gap: var(--space-4); }
.brief { white-space: pre-wrap; margin: var(--space-2) 0 0; color: var(--muted); }
.checklist li { display: flex; justify-content: space-between; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; border-top: 1px solid var(--border); flex-wrap: wrap; }
.checklist li:first-child { border-top: 0; }
.card-outcome { display: flex; gap: var(--space-3); align-items: flex-start; }
.card-outcome h2 { color: inherit; margin-bottom: var(--space-1); }
.card-outcome p { color: var(--text); margin: 0; }

.tally { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); margin: var(--space-4) 0; }
.tally-item { display: grid; gap: 2px; padding: var(--space-3); border-radius: var(--radius-sm); font-size: .8rem; font-weight: 600; }
.tally-num { font-size: 1.6rem; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
.summary-text { color: var(--text); }
.result { display: flex; gap: var(--space-3); padding: var(--space-4) 0; border-top: 1px solid var(--border); background: none; color: inherit; }
.result-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; flex: none; }
.tone-ok .result-icon { background: var(--ok-bg); color: var(--ok); }
.tone-bad .result-icon { background: var(--bad-bg); color: var(--bad); }
.tone-review .result-icon { background: var(--review-bg); color: var(--review); }
.result-head { display: flex; justify-content: space-between; gap: var(--space-2); flex-wrap: wrap; }
.result-label { font-size: .75rem; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
.tone-ok .result-label { color: var(--ok); }
.tone-bad .result-label { color: var(--bad); }
.tone-review .result-label { color: var(--review); }
.result p { margin: var(--space-1) 0 0; color: var(--muted); font-size: .93rem; overflow-wrap: anywhere; }

details { margin-top: var(--space-4); border-top: 1px solid var(--border); padding-top: var(--space-3); }
summary { cursor: pointer; font-weight: 600; min-height: 44px; display: flex; align-items: center; }
.table-scroll { overflow-x: auto; margin-top: var(--space-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
table { border-collapse: collapse; font-size: .82rem; width: 100%; }
th, td { text-align: left; padding: var(--space-2) var(--space-3); border-bottom: 1px solid var(--border); vertical-align: top; }
th { background: var(--surface-2); font-weight: 600; }
td:first-child { overflow-wrap: anywhere; min-width: 180px; }

.copy-field { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); }
.copy-field code { flex: 1; min-width: 0; padding: 0 var(--space-2); }
.empty-page { text-align: center; max-width: 520px; margin: var(--space-7) auto; display: grid; gap: var(--space-3); justify-items: center; }

@media (min-width: 640px) {
  .how { grid-template-columns: repeat(2, 1fr); }
  .how li { grid-template-columns: 1fr; padding: var(--space-4); }
  .how li > :not(.how-icon) { grid-column: 1; }
  .how-icon { grid-row: auto; margin-bottom: var(--space-2); }
}
@media (min-width: 960px) {
  main { padding-top: var(--space-6); }
  .how { grid-template-columns: repeat(4, 1fr); }
  .home-grid { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); align-items: start; }
  /* Without a side card, the boxes run full width so they line up with the summary and outcome above. */
  .page-grid.has-side { grid-template-columns: minmax(0, 1fr) 340px; align-items: start; }
  .page-side { position: sticky; top: 88px; }
}
@media (max-width: 480px) {
  .card { padding: var(--space-4); }
  .summary-amount { text-align: left; }
  .stepper li { font-size: .72rem; }
  .tally-item { padding: var(--space-2); }
  .tally-num { font-size: 1.35rem; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`;
