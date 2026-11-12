// Server-rendered HTML for PayWebbie. Every dynamic value goes through escapeHtml.
// Design: Joseph's own Figma screens (PayWebbie review dashboard + collaboration dashboard + new project):
// dark navy sidebar, white cards, one strong blue, green/red/amber for verdicts, Inter.
import { HONOR_PERIOD_MS, ZAR_PER_USD, toUsd } from "./paypal.ts";
import type { Milestone, Role, Status } from "./store.ts";

export type Messages = { notice?: string | null; error?: string | null };

const APP_NAME = "PayWebbie";

type Tone = "neutral" | "held" | "review" | "ok" | "bad" | "warn";

const STATUS: Record<Status, { label: string; tone: Tone; icon: IconName }> = {
  AWAITING_HOLD: { label: "Awaiting payment", tone: "warn", icon: "clock" },
  FUNDS_HELD: { label: "In Progress", tone: "ok", icon: "dot" },
  IN_REVIEW: { label: "In Review", tone: "review", icon: "clock" },
  PAID: { label: "Paid", tone: "ok", icon: "checkCircle" },
  HOLD_RELEASED: { label: "Closed", tone: "bad", icon: "xCircle" },
  DECLINED: { label: "Declined", tone: "bad", icon: "xCircle" },
};

const PAYMENT: Record<Status, { label: string; tone: Tone }> = {
  AWAITING_HOLD: { label: "Not held yet", tone: "warn" },
  FUNDS_HELD: { label: "Held (Sandbox)", tone: "review" },
  IN_REVIEW: { label: "Pending Approval", tone: "review" },
  PAID: { label: "Released", tone: "ok" },
  HOLD_RELEASED: { label: "Hold released", tone: "bad" },
  DECLINED: { label: "Declined", tone: "bad" },
};

const STEPS: { title: string; short: string; text: string }[] = [
  { title: "Add Requirements & Brief", short: "Requirements", text: "Define what you will build and the client's goals." },
  { title: "Client Confirmation", short: "Payment Held", text: "The client confirms the project and PayPal holds the payment." },
  { title: "Build & Submit", short: "Delivery & AI Check", text: "Develop the website and submit the live link for the AI check." },
  { title: "Review & Payment", short: "Review & Payment", text: "The client verifies the work and releases payment." },
];
/** How many steps are finished in each status. */
const STEP_REACHED: Record<Status, number> = { AWAITING_HOLD: 1, FUNDS_HELD: 2, IN_REVIEW: 3, PAID: 4, HOLD_RELEASED: 3, DECLINED: 1 };

const NEXT_ACTION: Record<Status, string> = {
  AWAITING_HOLD: "Share client link",
  FUNDS_HELD: "Submit website",
  IN_REVIEW: "View report",
  PAID: "View",
  HOLD_RELEASED: "View",
  DECLINED: "View",
};

const VERDICT = {
  met: { icon: "checkCircle", label: "Met", tone: "ok" },
  not_met: { icon: "xCircle", label: "Not met", tone: "bad" },
  client_to_check: { icon: "eye", label: "For you to check", tone: "warn" },
} as const;

/** Taste is the client's call, so only the client's page says "you". */
function verdictLabel(verdict: keyof typeof VERDICT, role: Role): string {
  return verdict === "client_to_check" && role === "freelancer" ? "For the client to check" : VERDICT[verdict].label;
}

export const DEMO = {
  title: "Mama Thandi's Kitchen website",
  requirements:
    "Homepage with our opening hours\nMenu page with every dish and its price\nContact page with our phone number\nA form to book a table\nWorks well on phones",
  brief:
    "Mama Thandi's Kitchen is a family restaurant in East London. The website should feel warm and welcoming, " +
    "help new customers find us, and let people book a table without phoning.",
  amount: "800",
  freelancerName: "JoxephCode",
  clientName: "Mama Thandi",
};

const DEMO_2 = {
  title: "Nomsa's Table restaurant website",
  requirements:
    "Homepage with opening hours\nMenu page with every dish and its price\nContact page with the phone number and address\nA form to book a table\nWorks well on phones",
  brief:
    "Nomsa's Table is a family restaurant in Quigney, East London. The owner wants customers to find the opening hours and the menu with prices, " +
    "call the restaurant, and book a table online.",
  amount: "1500",
  freelancerName: "JoxephCode",
  clientName: "Nomsa Dlamini",
};

/** The two examples on the New Project page. The first sample site has deliberate gaps, the second passes every check. */
const EXAMPLES = [
  { label: "Mama Thandi's Kitchen", data: DEMO, site: "demo/" },
  { label: "Nomsa's Table", data: DEMO_2, site: "demo/nomsa.html" },
];

/** Who is looking at the page, so the shell can draw the right sidebar. */
export type Viewer =
  | { role: "freelancer"; unread: number; name?: string }
  | { role: "client"; milestone: Milestone };

type NavKey = "dashboard" | "new" | "messages" | "payments" | "project";

// ---- Freelancer pages ----

export function home(milestones: Milestone[], viewer: Viewer, messages: Messages): string {
  const active = milestones.filter((m) => m.status === "AWAITING_HOLD" || m.status === "FUNDS_HELD" || m.status === "IN_REVIEW");
  const held = milestones.filter((m) => m.status === "FUNDS_HELD" || m.status === "IN_REVIEW");
  const paid = milestones.filter((m) => m.status === "PAID");
  const sum = (list: Milestone[]) => list.reduce((total, m) => total + Number(m.amount), 0).toFixed(2);
  const rows = milestones
    .map(
      (m) => `<li class="project-row">
        <span class="row-icon">${icon("code", 20)}</span>
        <a class="row-main" href="/m/${m.id}"><strong>${escapeHtml(m.title)}</strong>
          <span class="muted">${projectNumber(m)} · Client: ${escapeHtml(clientName(m))}</span></a>
        ${pill(STATUS[m.status].label, STATUS[m.status].tone, STATUS[m.status].icon)}
        <span class="money">R${m.amount}</span>
        <a class="button button-small${m.status === "FUNDS_HELD" ? " button-primary" : ""}" href="/m/${m.id}#next">${NEXT_ACTION[m.status]}</a>
      </li>`,
    )
    .join("");
  const stats = [
    ["folder", "Active projects", String(active.length)],
    ["lock", "Held by PayPal", `R${sum(held)}`],
    ["wallet", "Paid out", `R${sum(paid)}`],
  ] as const;
  return layout({
    title: "Dashboard",
    viewer,
    nav: "dashboard",
    messages,
    body: `${breadcrumb([["Dashboard"]])}
    <div class="page-head">
      <div><h1>Dashboard</h1><p class="sub">Your projects, the money PayPal is holding, and what to do next.</p></div>
      <a class="button button-primary" href="/new">${icon("plusCircle", 18)} New Project</a>
    </div>
    <div class="stats">${stats
      .map(([name, label, value]) => `<div class="card stat"><span class="stat-icon">${icon(name, 20)}</span><div><span class="muted">${label}</span><strong>${value}</strong></div></div>`)
      .join("")}</div>
    <div class="two-col even">
      <section class="card" id="projects">
        <div class="card-head"><div class="card-title">${icon("folder", 20, "plain")}<div><h2>My Projects</h2><p class="muted">Projects you created in this browser.</p></div></div></div>
        ${
          rows
            ? `<ul class="projects">${rows}</ul>`
            : `<div class="empty">${icon("folder", 28)}<p>No projects yet. Start one and your client's payment will be held by PayPal while you build.</p>
               <a class="button button-primary" href="/new">${icon("plusCircle", 18)} Start a New Project</a></div>`
        }
      </section>
      ${howItWorks(-1)}
    </div>`,
  });
}

/** `example` is the index of the example to fill in, or -1 for an empty form. */
export function newProject(viewer: Viewer, example: number, messages: Messages): string {
  const chosen = EXAMPLES[example]?.data;
  const value = (field: keyof typeof DEMO) => (chosen ? ` value="${escapeHtml(chosen[field])}"` : "");
  const area = (field: "requirements" | "brief") => (chosen ? escapeHtml(chosen[field]) : "");
  const tips = [
    "Be specific with all website features.",
    "Include the client's business goals and design style.",
    "Add any references, content, or branding if available.",
  ];
  return layout({
    title: "New Project",
    viewer,
    nav: "new",
    messages,
    body: `${breadcrumb([["Projects", "/#projects"], ["New Project"]])}
    <div class="page-head">
      <div class="head-with-icon"><span class="head-icon">${icon("monitor", 30)}</span>
        <div><h1>Start a New Project</h1><p class="sub">Add the project requirements and client brief to create a secure, verifiable project.</p></div></div>
      <div class="examples" role="group" aria-label="Try an example"><span class="muted">Try an example:</span>${EXAMPLES.map(
        (e, i) => `<a class="button button-small${i === example ? " button-primary" : ""}" href="/new?demo=${i + 1}"${i === example ? ' aria-current="true"' : ""}>${icon("lightning", 14)} ${e.label}</a>`,
      ).join("")}</div>
    </div>
    <div class="two-col">
      <form class="stack" method="post" action="/milestones" data-busy="AI is drafting the checklist…">
        ${chosen ? `<input type="hidden" name="example" value="${example + 1}">` : ""}
        <section class="card">
          <div class="card-title">${icon("list", 22, "tile")}<div><h2><label for="requirements">Project Requirements <span class="req" aria-hidden="true">*</span></label></h2>
            <p class="muted">List the key features and deliverables for the website.</p></div></div>
          <textarea id="requirements" name="requirements" rows="5" minlength="3" maxlength="1000" required data-count="requirements-count"
            placeholder="e.g. Responsive design, homepage, contact form, admin dashboard, etc.">${area("requirements")}</textarea>
          <p class="counter" id="requirements-count">0 / 1,000</p>
        </section>
        <section class="card">
          <div class="card-title">${icon("file", 22, "tile")}<div><h2><label for="brief">Client's Brief <span class="req" aria-hidden="true">*</span></label></h2>
            <p class="muted">Describe the client's goals, target audience, and any additional context.</p></div></div>
          <textarea id="brief" name="brief" rows="4" minlength="10" maxlength="1000" required data-count="brief-count"
            placeholder="e.g. Build a modern business website for a fitness brand, with service pages, booking, and a clean, professional look.">${area("brief")}</textarea>
          <p class="counter" id="brief-count">0 / 1,000</p>
        </section>
        <section class="card">
          <div class="card-title">${icon("tag", 22, "tile")}<div><h2>Project Details</h2><p class="muted">The client sees these on their page before PayPal holds the money.</p></div></div>
          <div class="field-grid">
            <div><label for="title">Project name <span class="req" aria-hidden="true">*</span></label>
              <input id="title" name="title" maxlength="127" required${value("title")} placeholder="Mama Thandi Website"></div>
            <div><label for="amount">Amount (ZAR) <span class="req" aria-hidden="true">*</span></label>
              <div class="input-money"><span aria-hidden="true">R</span><input id="amount" name="amount" inputmode="decimal" required${value("amount")} placeholder="800"></div></div>
            <div><label for="freelancerName">Your name</label>
              <input id="freelancerName" name="freelancerName" maxlength="40"${value("freelancerName")} placeholder="JoxephCode"></div>
            <div><label for="clientName">Client's name</label>
              <input id="clientName" name="clientName" maxlength="40"${value("clientName")} placeholder="Mama Thandi"></div>
          </div>
          <p class="help">PayPal's sandbox doesn't support rand, so the hold is made in dollars at a fixed demo rate (R${ZAR_PER_USD} = $1).</p>
        </section>
        <div class="form-actions">
          <a class="button" href="/">Cancel</a>
          <button class="button button-primary">${icon("upload", 18)} Upload Project</button>
        </div>
      </form>
      <div class="stack">
        ${howItWorks(0, "Project Creation")}
        <section class="card">
          <div class="card-title">${icon("bulb", 22, "plain")}<h2 class="h3">Tips for a Clear Project</h2></div>
          <ul class="ticks">${tips.map((tip) => `<li>${icon("check", 18)}${tip}</li>`).join("")}</ul>
        </section>
      </div>
    </div>`,
  });
}

export function messagesList(milestones: Milestone[], viewer: Viewer, messages: Messages): string {
  const rows = milestones
    .map((m) => {
      const last = m.messages.at(-1);
      const unread = unreadFor(m, "freelancer");
      return `<li class="project-row">
        <span class="avatar">${initial(clientName(m))}</span>
        <a class="row-main" href="/m/${m.id}/chat"><strong>${escapeHtml(clientName(m))} · ${escapeHtml(m.title)}</strong>
          <span class="muted">${last ? `${last.from === "freelancer" ? "You: " : ""}${escapeHtml(last.text.slice(0, 90))}` : "No messages yet"}</span></a>
        ${unread ? `<span class="count-badge">${unread}<span class="visually-hidden"> unread</span></span>` : ""}
        <a class="button button-small" href="/m/${m.id}/chat">Open chat</a>
      </li>`;
    })
    .join("");
  return layout({
    title: "Messages",
    viewer,
    nav: "messages",
    messages,
    body: `${breadcrumb([["Messages"]])}
    <div class="page-head"><div><h1>Messages</h1><p class="sub">Each project has its own chat with the client.</p></div></div>
    <section class="card">${rows ? `<ul class="projects">${rows}</ul>` : `<div class="empty">${icon("message", 28)}<p>No conversations yet. Each project you create gets a chat with the client.</p></div>`}</section>`,
  });
}

export function payments(milestones: Milestone[], viewer: Viewer, messages: Messages): string {
  const rows = milestones
    .map(
      (m) => `<tr><td><a href="/m/${m.id}">${escapeHtml(m.title)}</a><span class="muted block">${projectNumber(m)}</span></td>
        <td>${escapeHtml(clientName(m))}</td><td class="money">R${m.amount}</td>
        <td>${pill(PAYMENT[m.status].label, PAYMENT[m.status].tone)}</td>
        <td>${m.capture ? `<code>${escapeHtml(m.capture.id)}</code>` : m.authorization ? `<code>${escapeHtml(m.authorization.id)}</code>` : "—"}</td></tr>`,
    )
    .join("");
  return layout({
    title: "Payments",
    viewer,
    nav: "payments",
    messages,
    body: `${breadcrumb([["Payments"]])}
    <div class="page-head"><div><h1>Payments</h1><p class="sub">Every PayPal hold and payment for your projects. Sandbox only: no real money moves.</p></div></div>
    <section class="card">${
      rows
        ? `<div class="table-scroll" tabindex="0" role="region" aria-label="Payments"><table>
            <thead><tr><th>Project</th><th>Client</th><th>Amount</th><th>Status</th><th>PayPal reference</th></tr></thead><tbody>${rows}</tbody></table></div>`
        : `<div class="empty">${icon("wallet", 28)}<p>No payments yet.</p></div>`
    }</section>`,
  });
}

// ---- Project pages (the review dashboard) ----

export function freelancerPage(m: Milestone, appUrl: string, viewer: Viewer, messages: Messages): string {
  return projectPage(m, "freelancer", appUrl, viewer, messages);
}

export function clientPage(m: Milestone, appUrl: string, messages: Messages): string {
  return projectPage(m, "client", appUrl, { role: "client", milestone: m }, messages);
}

function projectPage(m: Milestone, role: Role, appUrl: string, viewer: Viewer, messages: Messages): string {
  const crumbs: [string, string?][] =
    role === "freelancer" ? [["My Projects", "/#projects"], [projectNumber(m)], [STATUS[m.status].label]] : [[projectNumber(m)], [STATUS[m.status].label]];
  const action = actionCard(m, role, appUrl);
  return layout({
    title: m.title,
    viewer,
    nav: role === "client" ? "dashboard" : "project",
    messages,
    watch: watchFor(m, role),
    paymentStatus: m,
    body: `${breadcrumb(crumbs)}
    <div class="page-head">
      <div><h1>${escapeHtml(m.title)}</h1><p class="sub">${escapeHtml(firstLine(m.brief))}</p></div>
      ${pill(STATUS[m.status].label, STATUS[m.status].tone, STATUS[m.status].icon, "pill-lg")}
    </div>
    ${outcome(m)}
    ${stepper(m)}
    <div class="project-layout">
      ${action ? `<div class="action-slot">${action}</div>` : ""}
      <div class="dash-grid">${deliveryCard(m, role)}${verificationCard(m, role)}${requirementsCard(m, role)}<div class="stack">${paymentCard(m)}${detailsCard(m, role)}</div></div>
    </div>`,
  });
}

export function chatPage(m: Milestone, role: Role, viewer: Viewer, messages: Messages): string {
  const base = role === "client" ? `/c/${m.clientId}` : `/m/${m.id}`;
  const other = role === "client" ? { name: freelancerName(m), role: "Web Developer" } : { name: clientName(m), role: "Client" };
  let day = "";
  const bubbles = m.messages
    .map((msg) => {
      const label = dayLabel(msg.at);
      const divider = label !== day ? `<li class="chat-day"><span>${label}</span></li>` : "";
      day = label;
      return `${divider}<li class="bubble ${msg.from === role ? "mine" : "theirs"}">
        <span class="visually-hidden">${msg.from === role ? "You" : escapeHtml(other.name)}:</span>
        <p>${escapeHtml(msg.text)}</p><time datetime="${msg.at}">${timeFormat.format(new Date(msg.at))}</time></li>`;
    })
    .join("");
  const quick: string[] = [];
  if (role === "client" && m.status === "IN_REVIEW") {
    quick.push(`<a class="button button-primary button-block" href="${base}#next">${icon("refresh", 18)} Request Revision</a>`);
    quick.push(`<a class="button button-block" href="${base}#next">${icon("check", 18)} Approve & Release</a>`);
  }
  if (role === "client" && m.status === "AWAITING_HOLD") {
    quick.push(`<a class="button button-primary button-block" href="${base}#next">${icon("lock", 18)} Hold the payment</a>`);
  }
  if (role === "freelancer" && m.status === "FUNDS_HELD") {
    quick.push(`<a class="button button-primary button-block" href="${base}#next">${icon("upload", 18)} ${m.submission ? "Submit New Version" : "Submit Website"}</a>`);
  }
  if (role === "freelancer" && m.status === "AWAITING_HOLD") {
    quick.push(`<a class="button button-primary button-block" href="${base}#next">${icon("send", 18)} Share client link</a>`);
  }
  quick.push(`<a class="button button-block" href="${base}">${icon("eye", 18)} View project</a>`);
  return layout({
    title: `Messages · ${m.title}`,
    viewer,
    nav: "messages",
    messages,
    watch: watchFor(m, role, true),
    paymentStatus: m,
    body: `${breadcrumb(role === "client" ? [[projectNumber(m), base], ["Messages"]] : [["Messages", "/messages"], [m.title]])}
    <div class="page-head">
      <div class="head-with-icon"><span class="head-icon dark">${icon("code", 26)}</span>
        <div><h1>${escapeHtml(m.title)} ${pill(STATUS[m.status].label, STATUS[m.status].tone, STATUS[m.status].icon)}</h1>
        <p class="sub">${projectNumber(m)} · Freelancer: ${escapeHtml(freelancerName(m))}</p></div></div>
    </div>
    <div class="chat-layout">
      <section class="card chat" aria-label="Chat with ${escapeHtml(other.name)}">
        <header class="chat-head"><span class="avatar">${initial(other.name)}</span><div><strong>${escapeHtml(other.name)}</strong><span class="muted">${other.role}</span></div></header>
        <ol class="chat-body" id="chat-body">${bubbles || `<li class="chat-empty">${icon("message", 26)}<p>No messages yet. Say hello to ${escapeHtml(other.name)}.</p></li>`}</ol>
        <form class="chat-form" method="post" action="${base}/message">
          <label class="visually-hidden" for="text">Message</label>
          <textarea id="text" name="text" rows="2" maxlength="1000" required placeholder="Type a message…"></textarea>
          <button class="button button-primary icon-button" aria-label="Send message">${icon("send", 20)}</button>
        </form>
      </section>
      <aside class="stack">
        <section class="card">
          <div class="card-title">${icon("target", 20, "plain")}<h2 class="h3">Project Context</h2></div>
          <dl class="details">
            <div><dt>${icon("file", 16)} Project</dt><dd>${escapeHtml(m.title)}</dd></div>
            <div><dt>${icon("clock", 16)} Status</dt><dd>${pill(STATUS[m.status].label, STATUS[m.status].tone)}</dd></div>
            <div><dt>${icon("layers", 16)} Project Value</dt><dd><strong>R${m.amount}</strong></dd></div>
          </dl>
        </section>
        <section class="card">
          <h2 class="h3">Quick Actions</h2>
          <div class="stack-tight">${quick.join("")}</div>
        </section>
      </aside>
    </div>`,
  });
}

// A link that no longer resolves is almost always the free demo server having restarted,
// so say that plainly instead of leaving a judge at a dead end.
export function notFound(milestoneLink = false): string {
  const body = milestoneLink
    ? `<h1>This project is no longer saved</h1><p>The free demo server restarted after being idle and cleared its saved projects. Nothing was charged. Start a new project to try again: it takes about a minute.</p>
    <a class="button button-primary" href="/new">Start a New Project</a>`
    : `<h1>Page not found</h1><p>The link may be wrong.</p><a class="button button-primary" href="/">Back to the dashboard</a>`;
  return layout({ title: milestoneLink ? "Project not saved" : "Not found", messages: {}, body: `<section class="card empty-page">${body}</section>` });
}

/** Changes whenever either side moves the project forward or sends a message. Pages compare it to know when to refresh. */
export function stateOf(m: Milestone): string {
  return `${m.status}:${m.changeRequests.length}:${m.submission?.submittedAt ?? ""}:${m.messages.length}`;
}

export function unreadFor(m: Milestone, role: Role): number {
  return m.messages.slice(m.seen[role]).filter((msg) => msg.from !== role).length;
}

// ---- Project page pieces ----

function watchFor(m: Milestone, role: Role, chat = false): { url: string; state: string } | undefined {
  // Pages keep watching after the project closes only for chat, which can carry on.
  const open = m.status === "AWAITING_HOLD" || m.status === "FUNDS_HELD" || m.status === "IN_REVIEW";
  if (!open && !chat) return undefined;
  return { url: `/${role === "client" ? `c/${m.clientId}` : `m/${m.id}`}/state`, state: stateOf(m) };
}

function stepper(m: Milestone): string {
  const reached = STEP_REACHED[m.status];
  const items = STEPS.map((step, i) => {
    const state = i < reached ? "done" : i === reached ? "current" : "todo";
    return `<li class="step-${state}"${state === "current" ? ' aria-current="step"' : ""}>
      ${state === "done" ? icon("check", 16) : `<span class="step-num">${i + 1}</span>`}<span>${state === "done" ? `${i + 1} ` : ""}${step.short}</span></li>`;
  }).join("");
  return `<ol class="stepper" aria-label="Progress">${items}</ol>`;
}

function deliveryCard(m: Milestone, role: Role): string {
  const head = `<div class="card-head"><div class="card-title">${icon("link", 22, "plain")}<div><h2 class="h3">Delivered Website</h2><p class="muted">Live link submitted by the freelancer.</p></div></div>
    ${m.submission ? `<a class="icon-link" href="${escapeHtml(m.submission.url)}" target="_blank" rel="noopener noreferrer" aria-label="Open the delivered website in a new tab">${icon("external", 20)}</a>` : ""}</div>`;
  if (!m.submission) {
    const text =
      role === "freelancer" ? "When the website is live, submit its link and the AI checks it against the requirements." : "The freelancer submits the live link here when the work is done.";
    return `<section class="card">${head}<div class="preview-empty">${icon("monitor", 34)}<p>${text}</p></div></section>`;
  }
  const { url, evidence } = m.submission;
  return `<section class="card">${head}
    <div class="preview" aria-hidden="true"><iframe src="${escapeHtml(url)}" title="Preview of the delivered website" loading="lazy" tabindex="-1" sandbox="allow-same-origin"></iframe></div>
    <div class="url-row">
      <div class="copy-field">${icon("link", 16)}<a id="site-url" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>
        <button type="button" class="icon-button-quiet" data-copy="site-url" aria-label="Copy the website link">${icon("copy", 16)}</button></div>
      <a class="button button-small" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Open in New Tab ${icon("external", 14)}</a>
    </div>
    <p class="help">Checked ${formatDate(evidence.checkedAt)} · ${evidence.pages.length} pages · ${evidence.linksChecked} links · HTTPS ${evidence.https ? "yes" : "no"}</p>
  </section>`;
}

function results(m: Milestone) {
  const verdict = m.submission?.verdict;
  return m.criteria.map((criterion, index) => ({
    criterion,
    result: verdict?.results.find((r) => r.index === index) ?? {
      index,
      verdict: "client_to_check" as const,
      evidence: "The AI didn't assess this one, so the client checks it on the site.",
    },
  }));
}

function verificationCard(m: Milestone, role: Role): string {
  const title = `<div class="card-title">${icon("sparkle", 22, "plain")}<div><h2 class="h3">AI Verification</h2>
    <p class="muted">${m.submission ? "AI checked the website against the requirements. Tap a line for its evidence." : "Runs when the freelancer submits the website."}</p></div></div>`;
  if (!m.submission) {
    return `<section class="card">${title}
      <ol class="mini-steps"><li>${icon("globe", 18)} The app visits every page of the live site.</li>
      <li>${icon("shieldCheck", 18)} It collects evidence: pages, links, forms, phone layout.</li>
      <li>${icon("sparkle", 18)} Gemini checks each requirement and cites the evidence.</li></ol></section>`;
  }
  const list = results(m);
  const count = (v: keyof typeof VERDICT) => list.filter((r) => r.result.verdict === v).length;
  const rows = list
    .map(
      ({ criterion, result }) => `<li><details>
        <summary><span class="v-icon tone-${VERDICT[result.verdict].tone}">${icon(VERDICT[result.verdict].icon, 20)}</span>
          <span class="v-text">${escapeHtml(criterion.text)}<span class="visually-hidden"> (${verdictLabel(result.verdict, role)})</span></span>${icon("chevron", 16)}</summary>
        <p><strong>${verdictLabel(result.verdict, role)}.</strong> ${escapeHtml(result.evidence)}</p></details></li>`,
    )
    .join("");
  return `<section class="card">${title}
    <div class="tally">
      <span class="tally-item tone-ok"><strong>${count("met")}</strong> Met</span>
      <span class="tally-item tone-bad"><strong>${count("not_met")}</strong> Not met</span>
      <span class="tally-item tone-warn"><strong>${count("client_to_check")}</strong> ${verdictLabel("client_to_check", role)}</span>
    </div>
    <p class="summary-text">${escapeHtml(m.submission.verdict.summary)}</p>
    <ul class="verdicts">${rows}</ul>
    <details class="evidence"><summary>What the AI was shown</summary>${evidenceTable(m)}</details>
  </section>`;
}

function paymentCard(m: Milestone): string {
  const held = m.status === "FUNDS_HELD" || m.status === "IN_REVIEW" || m.status === "PAID";
  const note: Record<Status, string> = {
    AWAITING_HOLD: "Waiting for the client to hold the payment with PayPal.",
    FUNDS_HELD: "Held securely via PayPal until the client approves.",
    IN_REVIEW: "Held securely via PayPal until the client approves.",
    PAID: `Released to the freelancer. PayPal capture ${m.capture?.status ?? ""}.`,
    HOLD_RELEASED: "The hold was released. Nobody was charged.",
    DECLINED: "PayPal declined the hold.",
  };
  return `<section class="card" id="payment">
    <div class="card-head"><div class="card-title">${icon("wallet", 22, "plain")}<div><h2 class="h3">Payment Status</h2><p class="muted">${note[m.status]}</p></div></div>
      ${pill(PAYMENT[m.status].label, PAYMENT[m.status].tone)}</div>
    <dl class="amounts">
      <div><dt>Agreed Amount</dt><dd>R${m.amount}</dd></div>
      <div><dt>${m.status === "PAID" ? "Paid" : "Held Amount"}</dt><dd>R${held ? m.amount : "0.00"}</dd></div>
      <div><dt>Release To</dt><dd class="handle">@${escapeHtml(freelancerName(m))}</dd></div>
    </dl>
    ${m.status === "FUNDS_HELD" || m.status === "IN_REVIEW" || m.status === "PAID" ? `<p class="help">PayPal's sandbox uses dollars, so it holds $${toUsd(m.amount)} (demo rate R${ZAR_PER_USD} = $1).</p>` : ""}${m.status === "FUNDS_HELD" || m.status === "IN_REVIEW" ? `<p class="help">${heldUntil(m)}</p>` : ""}
  </section>`;
}

function requirementsCard(m: Milestone, role: Role): string {
  const items = results(m)
    .map(({ criterion, result }) => {
      if (m.submission) {
        const v = VERDICT[result.verdict];
        return `<li><span class="v-icon tone-${v.tone}">${icon(v.icon, 20)}</span><span>${escapeHtml(criterion.text)}<span class="visually-hidden"> (${verdictLabel(result.verdict, role)})</span></span></li>`;
      }
      return `<li><span class="v-icon tone-neutral">${icon(criterion.checkable ? "shieldCheck" : "eye", 20)}</span>
        <span>${escapeHtml(criterion.text)}<span class="tag">${criterion.checkable ? "AI checks" : "Client checks"}</span></span></li>`;
    })
    .join("");
  return `<section class="card">
    <div class="card-title">${icon("clipboard", 22, "plain")}<div><h2 class="h3">Project Requirements</h2>
      <p class="muted">${role === "client" ? "Your request, turned into a checklist by AI." : "The agreed checklist, drafted by AI from the brief."}</p></div></div>
    <ul class="req-list">${items}</ul>
    <details class="evidence"><summary>${role === "client" ? "Your original request" : "Original requirements and brief"}</summary>
      ${m.requirements ? `<p class="brief"><strong>Requirements</strong><br>${escapeHtml(m.requirements)}</p>` : ""}
      <p class="brief"><strong>Brief</strong><br>${escapeHtml(m.brief)}</p></details>
  </section>`;
}

function detailsCard(m: Milestone, role: Role): string {
  return `<section class="card">
    <div class="card-title">${icon("info", 22, "plain")}<h2 class="h3">Project Details</h2></div>
    <dl class="details">
      <div><dt>${icon("user", 16)} Freelancer</dt><dd class="handle">@${escapeHtml(freelancerName(m))}</dd></div>
      <div><dt>${icon("user", 16)} Client</dt><dd>${escapeHtml(clientName(m))}</dd></div>
      <div><dt>${icon("calendar", 16)} Created</dt><dd>${formatDate(m.createdAt)}</dd></div>
      <div><dt>${icon("calendar", 16)} Delivered</dt><dd>${m.submission ? formatDate(m.submission.submittedAt) : "Not yet"}</dd></div>
      <div><dt>${icon("tag", 16)} Project ID</dt><dd>${projectNumber(m)}</dd></div>
    </dl>
    <a class="button button-block" href="${role === "client" ? `/c/${m.clientId}` : `/m/${m.id}`}/chat">${icon("message", 18)} Message ${escapeHtml(role === "client" ? freelancerName(m) : clientName(m))}</a>
  </section>`;
}

function actionCard(m: Milestone, role: Role, appUrl: string): string {
  const card = (iconName: IconName, title: string, text: string, inner: string, kicker = "") =>
    `<section class="card action-card" id="next">
      <div class="action-head"><span class="action-icon">${icon(iconName, 22)}</span><div>${kicker ? `<p class="kicker">${kicker}</p>` : ""}<h2>${title}</h2><p>${text}</p></div></div>
      ${inner}</section>`;
  if (role === "freelancer") {
    if (m.status === "AWAITING_HOLD") {
      const link = `${appUrl}/c/${m.clientId}`;
      return card(
        "send",
        "Send this link to your client",
        "They review the requirements and hold the payment with PayPal. Start work once the money is held.",
        `<div class="copy-field wide">${icon("link", 16)}<code id="client-link">${escapeHtml(link)}</code>
          <button type="button" class="button button-small" data-copy="client-link">${icon("copy", 16)} Copy</button></div>
        ${waiting("Waiting for your client. This page updates by itself when the money is held.")}`,
        "Your next step",
      );
    }
    if (m.status === "FUNDS_HELD") {
      const sample = m.example ? EXAMPLES[m.example - 1] : undefined;
      const lastChange = m.changeRequests.at(-1);
      return `<form class="card action-card" id="next" method="post" action="/m/${m.id}/submit" data-busy="Checking the website… (up to a minute)">
        <div class="action-head"><span class="action-icon">${icon("upload", 22)}</span><div><p class="kicker">Your next step</p>
          <h2>${m.submission ? "Submit a new version" : "Done with the website? Submit it"}</h2>
          <p>The money is held. The app visits the live site, collects evidence and checks it against the requirements.</p></div></div>
        ${lastChange ? `<div class="notice tone-bad" role="status">${icon("message", 18)}<div><strong>Your client asked for revisions</strong><p>“${escapeHtml(lastChange.note)}”</p></div></div>` : ""}
        <div class="inline-form">
          <div class="grow"><label for="url">Live website address</label>
            <input id="url" name="url" type="url" required placeholder="https://clients-website.com"></div>
          <button class="button button-primary">${icon("shieldCheck", 18)} Submit & run AI checks</button>
        </div>
        ${sample ? `<p class="help"><button type="button" class="link-button" data-fill="url" data-value="${escapeHtml(appUrl)}/${sample.site}">Use the example restaurant site</button></p>` : ""}
      </form>`;
    }
    if (m.status === "IN_REVIEW") {
      return card(
        "eye",
        "Your client is reviewing",
        "They can approve and release the payment, or ask for revisions. The money stays held until they decide.",
        waiting("Waiting for your client. This page updates by itself when they decide."),
        "Nothing for you to do right now",
      );
    }
    return card(
      m.status === "PAID" ? "checkCircle" : "folder",
      m.status === "PAID" ? "This project is finished" : "This project is closed",
      m.status === "PAID" ? "The payment has been released to you. Ready for the next job?" : "No money moved. You can agree a new project with your client.",
      `<a class="button button-primary" href="/new">${icon("plusCircle", 18)} Start a New Project</a>`,
    );
  }
  if (m.status === "AWAITING_HOLD") {
    return `<form class="card action-card" id="next" method="post" action="/c/${m.clientId}/hold" data-busy="Opening PayPal…">
      <div class="action-head"><span class="action-icon">${icon("lock", 22)}</span><div><p class="kicker">Your next step</p><h2>Confirm the project and hold the payment</h2>
        <p>PayPal holds <strong>R${m.amount}</strong> (about $${toUsd(m.amount)}: PayPal's sandbox uses dollars) on your account. <strong>You're not charged yet.</strong> You pay only when you approve the finished website.</p></div></div>
      <div class="action-buttons single"><button class="button button-primary">${icon("lock", 18)} Hold R${m.amount} with PayPal</button></div>
      <p class="help">By holding the payment, you agree to the requirements below.</p>
    </form>`;
  }
  if (m.status === "FUNDS_HELD") {
    return card(
      "lock",
      "Money held. The website is being built",
      "You'll see the delivered website and an AI evidence report here before any money moves.",
      waiting("Waiting for the freelancer to deliver. This page updates by itself when the work is submitted."),
    );
  }
  if (m.status === "IN_REVIEW") {
    return `<section class="card action-card" id="next">
      <div class="action-head"><span class="action-icon solid">${icon("check", 22)}</span><div><h2>Review the work and take action</h2>
        <p>Approve to release the payment, or request revisions if anything needs to be changed. The AI doesn't decide for you.</p></div></div>
      <div class="action-buttons">
        <button type="button" class="button" data-toggle="revise" aria-expanded="false" aria-controls="revise">${icon("message", 18)} Request Revisions</button>
        <form method="post" action="/c/${m.clientId}/approve" data-busy="Releasing the payment…">
          <button class="button button-primary">${icon("check", 18)} Approve & Release Payment</button></form>
      </div>
      <form id="revise" class="revise" method="post" action="/c/${m.clientId}/changes" data-busy="Sending your request…" hidden>
        <label for="note">What needs to change?</label>
        <textarea id="note" name="note" rows="3" minlength="3" maxlength="1000" required placeholder="The booking form is missing"></textarea>
        <button class="button button-primary">${icon("send", 18)} Send revision request</button>
        <p class="help">The money stays on hold while the freelancer fixes it.</p>
      </form>
      <form method="post" action="/c/${m.clientId}/reject" data-busy="Releasing the hold…" data-confirm="Reject the work and release the hold? You won't be charged." class="reject">
        <button class="link-button danger">Reject the work and release the hold</button></form>
    </section>`;
  }
  return "";
}

function outcome(m: Milestone): string {
  if (m.status === "PAID") {
    return `<section class="banner tone-ok" role="status">${icon("checkCircle", 26)}<div><h2>Approved and paid</h2>
      <p>PayPal capture <code>${escapeHtml(m.capture?.id ?? "")}</code> is ${escapeHtml(m.capture?.status ?? "")}.</p></div></section>`;
  }
  if (m.status === "HOLD_RELEASED") {
    return `<section class="banner tone-bad" role="status">${icon("xCircle", 26)}<div><h2>Hold released</h2><p>The client rejected the work. Nobody was charged.</p></div></section>`;
  }
  if (m.status === "DECLINED") {
    return `<section class="banner tone-bad" role="status">${icon("xCircle", 26)}<div><h2>Hold declined</h2><p>PayPal declined the hold.</p></div></section>`;
  }
  return "";
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

function howItWorks(current: number, title = "How PayWebbie works"): string {
  const items = STEPS.map(
    (step, i) => `<li class="${i === current ? "is-current" : ""}"><span class="flow-num">${i + 1}</span><div><strong>${step.title}</strong><span>${step.text}</span></div></li>`,
  ).join("");
  return `<section class="card"><h2>${title}</h2><ol class="flow">${items}</ol></section>`;
}

// ---- Small helpers ----

function waiting(text: string): string {
  return `<p class="waiting" role="status"><span class="pulse" aria-hidden="true"></span>${text}</p>`;
}

function pill(label: string, tone: Tone, iconName?: IconName, extra = ""): string {
  return `<span class="pill tone-${tone}${extra ? ` ${extra}` : ""}">${iconName ? icon(iconName, iconName === "dot" ? 8 : 16) : ""}${label}</span>`;
}

function breadcrumb(items: [string, string?][]): string {
  const parts = items
    .map(([label, href], i) =>
      i === items.length - 1 ? `<li aria-current="page">${escapeHtml(label)}</li>` : `<li>${href ? `<a href="${href}">${escapeHtml(label)}</a>` : escapeHtml(label)}</li>`,
    )
    .join("");
  return `<nav class="breadcrumb" aria-label="Breadcrumb"><ol><li><span class="crumb-home">${icon("home", 16)}<span class="visually-hidden">Home</span></span></li>${parts}</ol></nav>`;
}

function projectNumber(m: Milestone): string {
  let hash = 0;
  for (const ch of m.id) hash = (hash * 31 + ch.charCodeAt(0)) % 9000;
  return `#PW-${hash + 1000}`;
}

function freelancerName(m: Milestone): string {
  return m.freelancerName || "Freelancer";
}

function clientName(m: Milestone): string {
  return m.clientName || "Client";
}

function initial(name: string): string {
  return escapeHtml(name.trim().charAt(0).toUpperCase() || "?");
}

function firstLine(text: string): string {
  const sentence = text.split(/(?<=[.!?])\s/)[0];
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

function heldUntil(m: Milestone): string {
  const created = m.authorization?.create_time;
  if (!created) return "";
  return `PayPal guarantees the held money until ${formatDate(new Date(Date.parse(created) + HONOR_PERIOD_MS).toISOString())}; after that the hold is renewed when work is submitted.`;
}

// ---- Shell ----

function layout(opts: {
  title: string;
  viewer?: Viewer;
  nav?: NavKey;
  messages: Messages;
  body: string;
  watch?: { url: string; state: string };
  paymentStatus?: Milestone;
}): string {
  const { title, viewer, nav, messages, body, watch, paymentStatus } = opts;
  const notice = (kind: "ok" | "bad", text: string) =>
    `<div class="notice tone-${kind}" role="${kind === "bad" ? "alert" : "status"}">${icon(kind === "ok" ? "checkCircle" : "xCircle", 20)}<p>${escapeHtml(text.slice(0, 400))}</p></div>`;
  const link = (key: NavKey, href: string, iconName: IconName, label: string, badge = 0) =>
    `<li><a href="${href}"${nav === key ? ' class="active" aria-current="page"' : ""}>${icon(iconName, 20)}<span>${label}</span>${
      badge ? `<span class="nav-badge">${badge}<span class="visually-hidden"> unread</span></span>` : ""
    }</a></li>`;
  let links = "";
  let user = { name: "Freelancer", role: "Freelancer" };
  let bell = "/messages";
  let unread = 0;
  if (viewer?.role === "freelancer") {
    unread = viewer.unread;
    user = { name: viewer.name || "Freelancer", role: "Freelancer" };
    links =
      link("dashboard", "/", "home", "Dashboard") +
      link("new", "/new", "plusCircle", "New Project") +
      link("messages", "/messages", "message", "Messages", unread) +
      link("payments", "/payments", "wallet", "Payments");
  } else if (viewer?.role === "client") {
    const m = viewer.milestone;
    const base = `/c/${m.clientId}`;
    unread = unreadFor(m, "client");
    user = { name: clientName(m), role: "Client" };
    bell = `${base}/chat`;
    links =
      link("dashboard", base, "home", "Dashboard") + link("messages", `${base}/chat`, "message", "Messages", unread) + link("payments", `${base}#payment`, "wallet", "Payments");
  }
  // The client's pages have no way into the freelancer side, so for them the logo is just a logo.
  const brandInner = `<span>Pay<span class="accent">Webbie</span></span>`;
  const brand = viewer?.role === "client" ? `<span class="brand">${brandInner}</span>` : `<a class="brand" href="/">${brandInner}</a>`;
  const payment = paymentStatus
    ? `<div class="pay-status"><span>Payment Status</span>${pill(PAYMENT[paymentStatus.status].label, PAYMENT[paymentStatus.status].tone)}</div>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${APP_NAME}</title>
<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(FAVICON)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<style>${CSS}</style>
</head>
<body${watch ? ` data-watch="${watch.url}" data-state="${escapeHtml(watch.state)}"` : ""}>
<a class="skip-link" href="#main">Skip to content</a>
<div class="shell">
<aside class="sidebar">
  ${brand}
  ${links ? `<nav aria-label="Main"><ul class="nav">${links}</ul></nav>` : ""}
</aside>
<div class="content">
<header class="topbar">
  ${payment || `<span class="sandbox-note">${icon("shieldCheck", 16)} PayPal sandbox · no real money moves</span>`}
  ${
    viewer
      ? `<div class="topbar-right">
    <a class="bell" href="${bell}" aria-label="Messages${unread ? `, ${unread} unread` : ""}">${icon("bell", 22)}${unread ? '<span class="bell-dot"></span>' : ""}</a>
    <span class="divider" aria-hidden="true"></span>
    <span class="user"><span class="avatar">${initial(user.name)}</span><span><strong>${escapeHtml(user.name)}</strong><span class="muted">${user.role}</span></span></span>
  </div>`
      : ""
  }
</header>
<main id="main">
${messages.error ? notice("bad", messages.error) : ""}
${messages.notice ? notice("ok", messages.notice) : ""}
${body}
</main>
<footer class="footer">${APP_NAME} · PayPal sandbox: no real money moves · AI checks by Gemini · The client always makes the final call.</footer>
</div>
</div>
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
// Refresh when the other side acts, but never while someone is typing.
const watch = document.body.dataset.watch;
if (watch) {
  const typing = () => document.querySelector("form[aria-busy]") ||
    [...document.querySelectorAll("textarea, input[type=url]")].some((el) => el.value.trim());
  const check = async () => {
    if (document.hidden || typing()) return;
    try {
      const res = await fetch(watch, { cache: "no-store" });
      if (res.ok && (await res.text()) !== document.body.dataset.state) location.replace(location.pathname + location.hash);
    } catch {}
  };
  setInterval(check, 4000);
  document.addEventListener("visibilitychange", check);
}
const chat = document.getElementById("chat-body");
if (chat) chat.scrollTop = chat.scrollHeight;
const chatInput = document.querySelector(".chat-form textarea");
if (chatInput) chatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey && chatInput.value.trim()) { event.preventDefault(); chatInput.form.requestSubmit(); }
});
for (const area of document.querySelectorAll("[data-count]")) {
  const out = document.getElementById(area.dataset.count);
  const update = () => { out.textContent = area.value.length.toLocaleString("en-US") + " / " + Number(area.maxLength).toLocaleString("en-US"); };
  area.addEventListener("input", update); update();
}
document.addEventListener("click", async (event) => {
  const fill = event.target.closest("[data-fill]");
  if (fill) { const input = document.getElementById(fill.dataset.fill); input.value = fill.dataset.value; input.focus(); }
  const toggle = event.target.closest("[data-toggle]");
  if (toggle) {
    const target = document.getElementById(toggle.dataset.toggle);
    target.hidden = !target.hidden;
    toggle.setAttribute("aria-expanded", String(!target.hidden));
    if (!target.hidden) target.querySelector("textarea").focus();
  }
  const copy = event.target.closest("[data-copy]");
  if (copy) {
    const text = document.getElementById(copy.dataset.copy).textContent;
    const isButton = copy.classList.contains("button");
    try { await navigator.clipboard.writeText(text); copy.dataset.copied = "true"; if (isButton) copy.lastChild.textContent = " Copied"; }
    catch { if (isButton) copy.lastChild.textContent = " Select and copy"; }
  }
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
  lightning: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  home: '<path d="M3.5 10.5 12 4l8.5 6.5V20a1 1 0 0 1-1 1h-5v-6h-5v6h-5a1 1 0 0 1-1-1v-9.5Z"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  folder: '<path d="M3.5 7a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V7Z"/>',
  wallet: '<rect x="3" y="5.5" width="18" height="14" rx="2"/><path d="M3 9.5h18M16 14.5h2"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  calendar: '<rect x="4" y="5" width="16" height="15.5" rx="2"/><path d="M4 10h16M8.5 3v4M15.5 3v4"/>',
  tag: '<path d="M3.5 12.5V4.5a1 1 0 0 1 1-1h8l8 8-9 9-8-8Z"/><circle cx="8" cy="8" r="1.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  monitor: '<rect x="3" y="4" width="18" height="12.5" rx="1.5"/><path d="M8.5 20.5h7M12 16.5v4M6.5 8h11M6.5 11.5h7"/>',
  list: '<path d="M9.5 6.5h11M9.5 12h11M9.5 17.5h11"/><rect x="3.5" y="5" width="3" height="3" rx=".6"/><rect x="3.5" y="10.5" width="3" height="3" rx=".6"/><rect x="3.5" y="16" width="3" height="3" rx=".6"/>',
  file: '<path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M8.5 13h7M8.5 17h7"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M4.5 15v4a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-4"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.3 1 2.1h5c0-.8.4-1.6 1-2.1A6 6 0 0 0 12 3Z"/>',
  sparkle: '<path d="M12 3c.5 4.5 2.5 6.5 7 7-4.5.5-6.5 2.5-7 7-.5-4.5-2.5-6.5-7-7 4.5-.5 6.5-2.5 7-7Z"/><path d="M19 15.5c.2 1.6.9 2.3 2.5 2.5-1.6.2-2.3.9-2.5 2.5-.2-1.6-.9-2.3-2.5-2.5 1.6-.2 2.3-.9 2.5-2.5Z"/>',
  chevron: '<path d="m7 9.5 5 5 5-5"/>',
  code: '<path d="m8.5 8-4 4 4 4M15.5 8l4 4-4 4M13.5 5.5l-3 13"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6 6.5L4 8.5M4 4.5v4h4M4 12.5a8 8 0 0 0 14 5l2-2M20 19.5v-4h-4"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12.5 9 5 9-5M3 16.5l9 5 9-5"/>',
  dot: '<circle cx="12" cy="12" r="8" fill="currentColor" stroke="none"/>',
} as const;

type IconName = keyof typeof ICONS;

function icon(name: IconName, size = 20, wrap?: "tile" | "plain"): string {
  const svg = `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
  if (wrap === "tile") return `<span class="tile">${svg}</span>`;
  if (wrap === "plain") return `<span class="title-icon">${svg}</span>`;
  return svg;
}

const FAVICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="24" height="24" rx="6" fill="#0A5CFF"/><path d="m6.5 12.5 3.5 3.5 7.5-8" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const dateFormat = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" });
const timeFormat = new Intl.DateTimeFormat("en-ZA", { timeStyle: "short", timeZone: "Africa/Johannesburg" });
const dayFormat = new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" });

function formatDate(iso: string): string {
  return `${dateFormat.format(new Date(iso))} SAST`;
}

function dayLabel(iso: string): string {
  const day = dayFormat.format(new Date(iso));
  return day === dayFormat.format(new Date()) ? "Today" : day;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

const CSS = `
:root {
  --blue: #0a5cff; --blue-dark: #0848cc; --blue-soft: #e8efff; --blue-line: #c7d7ff;
  --navy: #0b1533; --navy-2: #0b1533;
  --ink: #0f172a; --text: #1e293b; --muted: #5b6475; --line: #e5e8ef; --bg: #f6f8fc; --card: #ffffff; --inset: #f3f5f9;
  --ok: #15803d; --ok-bg: #dcfce7; --ok-line: #a7e8bf;
  --bad: #c81e1e; --bad-bg: #fde8e8; --bad-line: #f6b9b9;
  --warn: #8a5000; --warn-bg: #fff4d6; --warn-icon: #e09b00;
  --radius: 12px; --radius-sm: 8px; --shadow: 0 1px 2px rgba(15, 23, 42, .05), 0 2px 8px rgba(15, 23, 42, .04);
  --font: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font: 400 15px/1.55 var(--font); color: var(--text); background: var(--bg); }
h1, h2, h3 { color: var(--ink); margin: 0; letter-spacing: -.01em; }
h1 { font-size: 1.85rem; font-weight: 800; line-height: 1.2; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
h2 { font-size: 1.2rem; font-weight: 700; line-height: 1.3; }
h2.h3, .h3 { font-size: 1.08rem; }
p { margin: 0; }
a { color: var(--blue); }
code { font: 500 .85em/1.4 ui-monospace, "Cascadia Code", Consolas, monospace; word-break: break-all; }
.icon { flex: none; }
.muted { color: var(--muted); font-size: .86rem; }
.block { display: block; }
.req { color: var(--bad); }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.skip-link { position: absolute; left: -999px; top: 8px; z-index: 10; background: var(--blue); color: #fff; padding: 10px 14px; border-radius: 8px; }
.skip-link:focus { left: 8px; }
:focus-visible { outline: 3px solid var(--blue); outline-offset: 2px; border-radius: 4px; }
.sidebar :focus-visible { outline-color: #fff; }

/* Shell */
.shell { overflow-x: clip; display: grid; grid-template-columns: 250px minmax(0, 1fr); min-height: 100vh; }
.sidebar { position: sticky; top: 0; height: 100vh; display: flex; flex-direction: column; gap: 28px; padding: 26px 16px 20px;
  color: #fff; background: var(--navy); }
.brand { display: flex; align-items: center; gap: 10px; padding: 0 8px; color: #fff; text-decoration: none; font-size: 1.55rem; font-weight: 800; letter-spacing: -.02em; }
.brand .accent { color: #3d85ff; }
.nav { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.nav a { display: flex; align-items: center; gap: 14px; min-height: 48px; padding: 0 14px; border-radius: 10px; color: #e6ebf5; text-decoration: none; font-weight: 500; }
.nav a:hover { background: rgba(255, 255, 255, .08); }
.nav a.active { background: var(--blue); color: #fff; font-weight: 600; box-shadow: 0 6px 18px rgba(10, 92, 255, .35); }
.nav-badge { margin-left: auto; min-width: 24px; height: 24px; padding: 0 7px; display: inline-grid; place-items: center; border-radius: 999px; background: var(--blue); color: #fff; font-size: .78rem; font-weight: 700; }
.nav a.active .nav-badge { background: #fff; color: var(--blue); }
.content { display: flex; flex-direction: column; min-width: 0; overflow-x: clip; }
.topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 72px; padding: 12px 32px; background: #fff; border-bottom: 1px solid var(--line); }
.sandbox-note { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: .86rem; }
.pay-status { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 10px; background: var(--inset); font-size: .86rem; font-weight: 600; color: var(--text); }
.topbar-right { display: flex; align-items: center; gap: 18px; margin-left: auto; }
.bell { position: relative; display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 10px; color: var(--ink); }
.bell:hover { background: var(--inset); }
.bell-dot { position: absolute; top: 9px; right: 10px; width: 9px; height: 9px; border-radius: 50%; background: var(--blue); border: 2px solid #fff; }
.divider { width: 1px; height: 32px; background: var(--line); }
.user { display: flex; align-items: center; gap: 10px; }
.user strong, .user .muted { display: block; line-height: 1.25; }
.user .muted { font-size: .78rem; }
.avatar { flex: none; display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 50%; background: var(--navy-2); color: #fff; font-weight: 700; }
main { flex: 1; width: 100%; max-width: 1520px; padding: 22px 32px 40px; }
.footer { padding: 18px 32px 26px; color: var(--muted); font-size: .8rem; }

/* Page heading */
.breadcrumb ol { list-style: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin: 0 0 14px; padding: 0; font-size: .86rem; color: var(--muted); }
.breadcrumb li + li::before { content: "›"; margin-right: 8px; color: #8d96a8; }
.breadcrumb a { color: var(--muted); text-decoration: none; }
.breadcrumb a:hover { color: var(--blue); text-decoration: underline; }
.breadcrumb [aria-current] { color: var(--ink); font-weight: 600; }
.crumb-home { display: inline-flex; color: var(--ink); }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
.sub { color: var(--muted); margin-top: 4px; font-size: 1rem; }
.examples { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.head-with-icon { display: flex; gap: 18px; align-items: center; }
.head-icon { flex: none; display: grid; place-items: center; width: 64px; height: 64px; border-radius: 14px; background: var(--blue); color: #fff; }
.head-icon.dark { width: 54px; height: 54px; background: var(--navy-2); }

/* Cards */
.card { background: var(--card); border: 1px solid var(--line); border-radius: var(--radius); padding: 20px; box-shadow: var(--shadow); min-width: 0; }
.card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
.card-title { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
.card-head .card-title { margin-bottom: 0; }
.card-title .muted { margin-top: 2px; }
.title-icon { display: inline-flex; color: var(--blue); padding-top: 2px; }
.tile { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: var(--inset); color: var(--ink); flex: none; }
.stack { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-content: start; min-width: 0; }
.stack-tight { display: grid; gap: 10px; margin-top: 12px; }
.two-col.even { align-items: stretch; }
.two-col { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 22px; align-items: start; }
.empty, .preview-empty { display: grid; justify-items: center; gap: 12px; text-align: center; padding: 28px 12px; color: var(--muted); }
.preview-empty { border: 1.5px dashed var(--line); border-radius: var(--radius-sm); background: var(--inset); }
.empty-page { max-width: 560px; display: grid; gap: 14px; }

/* Pills */
.pill { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: .78rem; font-weight: 600; line-height: 1.4; white-space: nowrap; letter-spacing: 0; }
.pill-lg { padding: 9px 18px; font-size: 1rem; }
.pill.tone-review.pill-lg { background: var(--blue); color: #fff; }
.tone-neutral { background: var(--inset); color: var(--muted); }
.tone-review, .tone-held { background: var(--blue-soft); color: var(--blue-dark); }
.tone-ok { background: var(--ok-bg); color: var(--ok); }
.tone-bad { background: var(--bad-bg); color: var(--bad); }
.tone-warn { background: var(--warn-bg); color: var(--warn); }

/* Buttons */
.button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: 10px;
  border: 1.5px solid #cdd3df; background: #fff; color: var(--ink); font: 600 .95rem/1.2 var(--font); text-decoration: none; cursor: pointer; transition: background .15s, border-color .15s, box-shadow .15s; }
.button:hover { border-color: var(--ink); }
.button-primary { background: var(--blue); border-color: var(--blue); color: #fff; box-shadow: 0 4px 14px rgba(10, 92, 255, .28); }
.button-primary:hover { background: var(--blue-dark); border-color: var(--blue-dark); }
.button-small { min-height: 38px; padding: 0 14px; font-size: .86rem; }
.button-block { width: 100%; }
.button:disabled { opacity: .7; cursor: progress; }
.icon-button { width: 44px; padding: 0; flex: none; }
.icon-button-quiet { flex: none; display: inline-grid; place-items: center; width: 34px; height: 34px; border: 0; border-radius: 8px; background: transparent; color: var(--blue); cursor: pointer; }
.icon-button-quiet:hover { background: #d6e3ff; }
.icon-button-quiet[data-copied] { color: var(--ok); }
.icon-link { flex: none; display: inline-grid; place-items: center; width: 40px; height: 40px; border-radius: 8px; color: var(--blue); }
.icon-link:hover { background: var(--blue-soft); }
.link-button { border: 0; background: none; padding: 4px 0; color: var(--blue); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; min-height: 32px; }
.link-button.danger { color: var(--bad); }
.spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid currentColor; border-right-color: transparent; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Forms */
label { display: block; font-weight: 600; color: var(--ink); margin-bottom: 6px; font-size: .92rem; }
h2 label { font-size: inherit; margin: 0; display: inline; }
input, textarea { width: 100%; font: inherit; color: var(--ink); background: #fff; border: 1.5px solid #cfd5e1; border-radius: 10px; padding: 11px 14px; min-height: 46px; }
textarea { resize: vertical; line-height: 1.5; }
input::placeholder, textarea::placeholder { color: #7c8597; }
input:focus, textarea:focus { outline: none; border-color: var(--blue); box-shadow: 0 0 0 3px rgba(10, 92, 255, .18); }
.counter { text-align: right; color: var(--muted); font-size: .84rem; margin-top: 8px; }
.help { color: var(--muted); font-size: .84rem; margin-top: 10px; }
.field-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.input-money { position: relative; }
.input-money span { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--muted); font-weight: 600; }
.input-money input { padding-left: 28px; }
.form-actions { display: flex; justify-content: space-between; gap: 12px; }
.form-actions .button-primary { min-width: 220px; min-height: 50px; }
.ticks { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.ticks li { display: flex; gap: 10px; align-items: flex-start; }
.ticks .icon { color: var(--blue); margin-top: 2px; }

/* Flow (project creation steps) */
.flow { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 6px; }
.flow li { display: flex; gap: 14px; align-items: flex-start; padding: 10px; border-radius: 12px; position: relative; }
.flow li:not(:last-child)::after { content: ""; position: absolute; left: 30px; top: 52px; bottom: -16px; width: 2px; background: var(--line); }
.flow li.is-current { background: var(--blue-soft); }
.flow strong { display: block; color: var(--ink); }
.flow div span { display: block; color: var(--muted); font-size: .88rem; }
.flow-num { flex: none; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; background: var(--inset); color: var(--ink); font-weight: 700; position: relative; z-index: 1; border: 2px solid #fff; }
.is-current .flow-num { background: var(--blue); color: #fff; }

/* Dashboard */
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 22px; }
.stat { display: flex; align-items: center; gap: 14px; }
.stat strong { display: block; font-size: 1.45rem; color: var(--ink); }
.stat-icon { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 12px; background: var(--blue-soft); color: var(--blue); }
.projects { list-style: none; margin: 0; padding: 0; }
.project-row { display: flex; align-items: center; gap: 14px; padding: 14px 0; border-top: 1px solid var(--line); flex-wrap: wrap; }
.project-row:first-child { border-top: 0; }
.row-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 10px; background: var(--navy-2); color: #fff; flex: none; }
.row-main { flex: 1 1 200px; min-width: 0; color: var(--ink); text-decoration: none; }
.row-main strong { display: block; }
.row-main .muted { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-main:hover strong { color: var(--blue); text-decoration: underline; }
.money { font-weight: 700; color: var(--ink); white-space: nowrap; }
.count-badge { min-width: 24px; height: 24px; padding: 0 7px; display: inline-grid; place-items: center; border-radius: 999px; background: var(--blue); color: #fff; font-size: .78rem; font-weight: 700; }

/* Project page */
.stepper { list-style: none; display: grid; grid-template-columns: repeat(4, 1fr); gap: 2px; margin: 0 0 20px; padding: 4px; background: #fff; border: 1px solid var(--line); border-radius: 12px; box-shadow: var(--shadow); }
.stepper li { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 46px; padding: 6px 20px; font-weight: 600; font-size: .92rem; color: var(--muted); text-align: center;
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 14px 50%); }
.stepper li:first-child { clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%); border-radius: 9px 0 0 9px; }
.stepper li:last-child { clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 14px 50%); border-radius: 0 9px 9px 0; }
.stepper .step-done { color: var(--ink); background: var(--inset); }
.stepper .step-done .icon { color: var(--blue); }
.stepper .step-current { background: var(--blue); color: #fff; }
.step-num { flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid currentColor; font-size: .78rem; }
.project-layout { display: flex; flex-direction: column; gap: 20px; }
.action-slot { display: flex; justify-content: center; }
.dash-grid { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 18px; align-items: stretch; }
.dash-grid > .card { display: flex; flex-direction: column; }
.dash-grid > :nth-child(1) { grid-column: span 7; }
.dash-grid > :nth-child(2) { grid-column: span 5; }
.dash-grid > :nth-child(n+3) { grid-column: span 6; }
.dash-grid > .stack { grid-template-rows: auto 1fr; }
.dash-grid > .stack > .card { display: flex; flex-direction: column; }
.dash-grid .card > .button-block:last-child { margin-top: auto; }
.dash-grid .preview-empty { flex: 1; align-content: center; }
.banner { display: flex; gap: 14px; align-items: center; padding: 16px 20px; border-radius: var(--radius); margin-bottom: 18px; border: 1px solid; }
.banner.tone-ok { border-color: var(--ok-line); }
.banner.tone-bad { border-color: var(--bad-line); }
.banner h2 { color: inherit; }
.banner p { color: var(--text); }

.preview { position: relative; flex: 1; min-height: 280px; overflow: hidden; border-radius: 10px; border: 1px solid var(--line); background: var(--inset); }
.preview iframe { position: absolute; top: 0; left: 0; width: 200%; height: 200%; border: 0; transform: scale(.5); transform-origin: 0 0; pointer-events: none; background: #fff; }
.url-row { display: flex; gap: 10px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
.copy-field { flex: 1 1 200px; min-width: 0; display: flex; align-items: center; gap: 8px; padding: 4px 4px 4px 12px; border-radius: 10px; background: var(--blue-soft); color: var(--blue); }
.copy-field a, .copy-field code { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .86rem; }
.copy-field.wide { background: var(--inset); color: var(--ink); padding: 8px 8px 8px 14px; }
.copy-field.wide code { white-space: normal; }

.tally { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.tally-item { padding: 5px 10px; border-radius: 8px; font-size: .82rem; font-weight: 600; }
.summary-text { color: var(--text); font-size: .92rem; margin-bottom: 8px; }
.verdicts, .req-list { list-style: none; margin: 0; padding: 0; }
.verdicts > li { border-top: 1px solid var(--line); }
.verdicts summary { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 0; cursor: pointer; list-style: none; font-size: .92rem; color: var(--ink); }
.verdicts summary::-webkit-details-marker { display: none; }
.verdicts summary > .icon { margin-left: auto; color: var(--muted); transition: transform .2s; }
.verdicts details[open] summary > .icon { transform: rotate(180deg); }
.verdicts details p { padding: 0 0 12px 30px; color: var(--text); font-size: .88rem; }
.v-text { flex: 1; min-width: 0; }
.v-icon { flex: none; display: inline-flex; background: none !important; }
.v-icon.tone-ok { color: #16a34a; }
.v-icon.tone-bad { color: var(--bad); }
.v-icon.tone-warn { color: var(--warn-icon); }
.v-icon.tone-neutral { color: var(--blue); }
.req-list { display: grid; gap: 10px; }
.req-list li { display: flex; gap: 10px; align-items: flex-start; font-size: .92rem; color: var(--ink); }
.tag { display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 6px; background: var(--inset); color: var(--muted); font-size: .75rem; font-weight: 600; vertical-align: 1px; }
details.evidence { margin-top: 14px; border-top: 1px solid var(--line); padding-top: 6px; }
details.evidence > summary { cursor: pointer; font-weight: 600; color: var(--blue); min-height: 40px; display: flex; align-items: center; font-size: .9rem; }
.brief { margin-top: 10px; white-space: pre-line; font-size: .9rem; }
.mini-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 12px; }
.mini-steps li { display: flex; gap: 10px; align-items: flex-start; font-size: .92rem; }
.mini-steps .icon { color: var(--blue); margin-top: 1px; }

.amounts { display: grid; grid-template-columns: 1fr 1fr 1.35fr; margin: 0; }
.amounts div { padding: 0 12px; border-left: 1px solid var(--line); min-width: 0; }
.amounts div:first-child { padding-left: 0; border-left: 0; }
.amounts dt { color: var(--muted); font-size: .8rem; }
.amounts dd { margin: 4px 0 0; font-weight: 800; color: var(--ink); font-size: 1.05rem; overflow-wrap: anywhere; }
.amounts dd.handle { font-size: .9rem; overflow-wrap: normal; word-break: normal; }
.details { margin: 0 0 14px; display: grid; gap: 10px; }
.details div { display: flex; justify-content: space-between; align-items: center; gap: 12px; font-size: .88rem; }
.details dt { display: flex; align-items: center; gap: 8px; color: var(--muted); white-space: nowrap; }
.details dd { margin: 0; color: var(--ink); font-weight: 500; text-align: right; }
.handle { color: var(--blue) !important; font-weight: 600; }

.action-card { width: 100%; max-width: none; background: linear-gradient(180deg, #f3f7ff, #fff); border-color: var(--blue-line); }
.action-head { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 16px; }
.action-head p { color: var(--text); margin-top: 4px; }
.action-icon { flex: none; display: grid; place-items: center; width: 48px; height: 48px; border-radius: 50%; background: var(--blue-soft); color: var(--blue); }
.action-icon.solid { background: var(--blue); color: #fff; }
.kicker { font-size: .78rem !important; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--blue) !important; margin: 0 0 2px !important; }
.action-buttons { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.action-buttons:has(> :only-child) { grid-template-columns: 1fr; }
.action-buttons .button { width: 100%; min-height: 50px; }
.action-buttons form { margin: 0; }
.action-buttons.single { display: flex; }
.action-buttons.single .button { width: auto; min-width: 280px; min-height: 46px; }
.inline-form { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
.inline-form .grow { flex: 1 1 260px; }
.inline-form .button { min-height: 46px; }
.revise { margin-top: 16px; display: grid; gap: 10px; }
.revise[hidden] { display: none; }
.revise label { margin: 0; }
.reject { margin-top: 12px; text-align: center; }
.waiting { display: flex; align-items: center; gap: 10px; margin-top: 14px; color: var(--muted); font-size: .9rem; }
.pulse { flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--blue); animation: pulse 1.6s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: .3; transform: scale(.8); } }
.notice { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; border-radius: 10px; margin-bottom: 16px; }
.notice p { color: var(--text); }

/* Chat */
.chat-layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 22px; align-items: start; }
.chat { display: flex; flex-direction: column; padding: 0; height: min(68vh, 640px); min-height: 440px; overflow: hidden; }
.chat-head { display: flex; align-items: center; gap: 12px; padding: 14px 18px; border-bottom: 1px solid var(--line); }
.chat-head strong, .chat-head .muted { display: block; line-height: 1.3; }
.chat-head .avatar { background: #5b6475; }
.chat-body { list-style: none; margin: 0; padding: 18px; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
.chat-day { align-self: center; }
.chat-day span { display: inline-block; padding: 3px 12px; border-radius: 8px; background: var(--inset); color: var(--muted); font-size: .78rem; font-weight: 600; }
.chat-empty { margin: auto; display: grid; justify-items: center; gap: 10px; color: var(--muted); text-align: center; }
.bubble { max-width: min(78%, 480px); padding: 10px 14px 6px; border-radius: 14px; font-size: .93rem; }
.bubble p { white-space: pre-line; overflow-wrap: anywhere; }
.bubble time { display: block; text-align: right; font-size: .72rem; margin-top: 4px; opacity: .8; }
.bubble.theirs { align-self: flex-start; background: #eceff4; color: var(--ink); border-bottom-left-radius: 4px; }
.bubble.mine { align-self: flex-end; background: var(--blue); color: #fff; border-bottom-right-radius: 4px; }
.chat-form { display: flex; gap: 10px; align-items: flex-end; margin: 0 14px 14px; padding: 8px; border: 1.5px solid #cfd5e1; border-radius: 12px; }
.chat-form:focus-within { border-color: var(--blue); box-shadow: 0 0 0 3px rgba(10, 92, 255, .18); }
.chat-form textarea { border: 0; padding: 6px 8px; min-height: 44px; resize: none; }
.chat-form textarea:focus { box-shadow: none; }

/* Tables */
.table-scroll { overflow-x: auto; margin-top: 10px; }
table { width: 100%; border-collapse: collapse; font-size: .86rem; }
th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { background: var(--inset); font-size: .78rem; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
td a { font-weight: 600; }

/* Responsive */
@media (max-width: 1180px) {
  .dash-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-grid > :nth-child(n) { grid-column: span 1; }
  .dash-grid > :nth-child(1), .dash-grid > :nth-child(2) { grid-column: 1 / -1; }
}
@media (max-width: 960px) {
  .shell { grid-template-columns: minmax(0, 1fr); }
  .sidebar { position: static; height: auto; flex-direction: row; flex-wrap: wrap; align-items: center; gap: 10px 16px; padding: 12px 16px; }
  .brand { font-size: 1.3rem; padding: 0; }
  .sidebar nav { width: 100%; overflow-x: auto; scrollbar-width: none; }
  .sidebar nav::-webkit-scrollbar { display: none; }
  .nav { display: flex; gap: 4px; }
  .nav a { min-height: 44px; padding: 0 12px; gap: 8px; white-space: nowrap; font-size: .9rem; }
  .two-col, .chat-layout { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 680px) {
  main { padding: 16px 16px 32px; }
  .topbar { padding: 10px 16px; min-height: 60px; }
  .user > span:last-child, .divider { display: none; }
  .footer { padding: 14px 16px 22px; }
  h1 { font-size: 1.45rem; }
  .head-icon { width: 48px; height: 48px; }
  .stats, .dash-grid, .field-grid { grid-template-columns: minmax(0, 1fr); }
  .dash-grid > :nth-child(n) { grid-column: auto; }
  .stepper { grid-template-columns: 1fr 1fr; gap: 4px; }
  .stepper li, .stepper li:first-child, .stepper li:last-child { clip-path: none; border-radius: 8px; font-size: .82rem; padding: 6px 8px; }
  .action-buttons { grid-template-columns: 1fr; }
  .amounts { grid-template-columns: 1fr 1fr; gap: 12px; }
  .amounts div:nth-child(3) { grid-column: 1 / -1; padding-left: 0; border-left: 0; }
  .form-actions { flex-direction: column-reverse; }
  .form-actions .button { width: 100%; }
  .chat { height: 70vh; }
  .pay-status > span:first-child { display: none; }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
