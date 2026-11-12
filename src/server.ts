// PayWebbie (was Proof-of-Done): milestone payments where "done" is backed by evidence.
// Freelancer drafts an AI checklist → client holds the payment with PayPal → freelancer submits the live site →
// the crawler collects evidence and Gemini judges each criterion → client approves (capture) or rejects (void).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readdirSync, readFileSync } from "node:fs";
import * as paypal from "./paypal.ts";
import * as ai from "./ai.ts";
import { collectEvidence } from "./evidence.ts";
import * as store from "./store.ts";
import * as views from "./views.ts";

const PORT = Number(process.env.PORT || 3000);
// Render sets RENDER_EXTERNAL_URL; PayPal needs absolute return URLs.
const APP_URL = (process.env.APP_BASE_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, "");
const DEMO_DIR = new URL("../public/demo/", import.meta.url);
const DEMO_FILES = new Set(readdirSync(DEMO_DIR));

type Action = (milestone: store.Milestone, form: URLSearchParams) => Promise<string> | string;

// ---- Freelancer actions ----

async function createMilestone(form: URLSearchParams): Promise<string> {
  const title = text(form, "title", 1, 127, "The project name");
  const requirements = text(form, "requirements", 3, 1000, "The project requirements");
  const brief = text(form, "brief", 10, 1000, "The client's brief");
  const amount = parseAmount(form.get("amount"));
  // The AI sees both, so the checklist covers the features and the client's goals.
  const criteria = await ai.draftChecklist(title, `Requirements:
${requirements}

Client's brief:
${brief}`);
  const milestone: store.Milestone = {
    id: store.newId(),
    clientId: store.newId(),
    title,
    requirements,
    brief,
    freelancerName: optionalName(form, "freelancerName"),
    clientName: optionalName(form, "clientName"),
    amount,
    criteria,
    status: "AWAITING_HOLD",
    createdAt: new Date().toISOString(),
    changeRequests: [],
    messages: [],
    seen: { freelancer: 0, client: 0 },
  };
  store.add(milestone);
  return `/m/${milestone.id}`;
}

async function submitWork(milestone: store.Milestone, form: URLSearchParams): Promise<string> {
  expectStatus(milestone, "FUNDS_HELD");
  const url = (form.get("url") ?? "").trim();
  if (!url) throw new Error("Enter the address of the finished website.");

  await renewHoldIfNeeded(milestone);
  const evidence = await collectEvidence(url);
  const verdict = await ai.judgeDelivery(milestone.criteria, evidence);
  milestone.submission = { url: evidence.startUrl, submittedAt: new Date().toISOString(), evidence, verdict };
  milestone.status = "IN_REVIEW";
  store.save();
  return withMessage(`/m/${milestone.id}`, "notice", "Checks finished. Your client can now review the evidence report.");
}

/** PayPal only guarantees held money for 3 days, so renew an older hold before the client reviews. */
async function renewHoldIfNeeded(milestone: store.Milestone): Promise<void> {
  const created = milestone.authorization?.create_time;
  if (!milestone.authorization || !created || Date.now() < Date.parse(created) + paypal.HONOR_PERIOD_MS) return;
  milestone.authorization = await paypal.reauthorize(milestone.authorization.id);
  store.save();
}

// ---- Client actions ----

async function holdPayment(milestone: store.Milestone): Promise<string> {
  expectStatus(milestone, "AWAITING_HOLD");
  const order = await paypal.createHeldPaymentOrder({
    referenceId: milestone.id,
    description: milestone.title,
    amount: paypal.toUsd(milestone.amount),
    currency: "USD",
    returnUrl: `${APP_URL}/paypal/return`,
    cancelUrl: `${APP_URL}/paypal/cancel`,
  });
  milestone.orderId = order.id;
  store.save();
  return order.approveUrl;
}

async function clientApproved(orderId: string | null): Promise<string> {
  const milestone = store.findByOrder(orderId);
  // Refreshing PayPal's return page must not authorize twice.
  if (milestone.status === "AWAITING_HOLD") {
    milestone.authorization = await paypal.authorizeOrder(milestone.orderId!);
    milestone.status = milestone.authorization.status === "DENIED" ? "DECLINED" : "FUNDS_HELD";
    store.save();
  }
  return milestone.status === "DECLINED"
    ? withMessage(`/c/${milestone.clientId}`, "error", "PayPal declined the hold.")
    : withMessage(`/c/${milestone.clientId}`, "notice", `R${milestone.amount} is now held by PayPal. You haven't been charged.`);
}

function clientCancelled(orderId: string | null): string {
  const milestone = store.findByOrder(orderId);
  return withMessage(`/c/${milestone.clientId}`, "notice", "You cancelled at PayPal, so nothing is held.");
}

async function approve(milestone: store.Milestone): Promise<string> {
  expectStatus(milestone, "IN_REVIEW");
  milestone.capture = await paypal.captureAuthorization(heldAuthorization(milestone).id);
  milestone.status = "PAID";
  store.save();
  // No flash message: the page's "Approved and paid" card already says it.
  return `/c/${milestone.clientId}`;
}

async function reject(milestone: store.Milestone): Promise<string> {
  expectStatus(milestone, "IN_REVIEW");
  await paypal.voidAuthorization(heldAuthorization(milestone).id);
  milestone.status = "HOLD_RELEASED";
  store.save();
  return `/c/${milestone.clientId}`;
}

function requestChanges(milestone: store.Milestone, form: URLSearchParams): string {
  expectStatus(milestone, "IN_REVIEW");
  milestone.changeRequests.push({ note: text(form, "note", 3, 1000, "Your note"), at: new Date().toISOString() });
  milestone.status = "FUNDS_HELD";
  store.save();
  return withMessage(`/c/${milestone.clientId}`, "notice", "The freelancer has your note. Your money stays on hold.");
}

function sendMessage(role: store.Role): Action {
  return (milestone, form) => {
    const body = text(form, "text", 1, 1000, "Your message");
    milestone.messages.push({ from: role, text: body, at: new Date().toISOString() });
    // Sending a message means the sender has read everything so far.
    milestone.seen[role] = milestone.messages.length;
    store.save();
    return `${role === "client" ? `/c/${milestone.clientId}` : `/m/${milestone.id}`}/chat`;
  };
}

const FREELANCER_ACTIONS = new Map<string, Action>([["submit", submitWork], ["message", sendMessage("freelancer")]]);
const CLIENT_ACTIONS = new Map<string, Action>([
  ["hold", holdPayment],
  ["approve", approve],
  ["reject", reject],
  ["changes", requestChanges],
  ["message", sendMessage("client")],
]);

// ---- Helpers ----

function text(form: URLSearchParams, name: string, min: number, max: number, label: string): string {
  const value = (form.get(name) ?? "").trim();
  if (value.length < min || value.length > max) throw new Error(`${label} must be ${min}–${max} characters.`);
  return value;
}

function optionalName(form: URLSearchParams, name: string): string | undefined {
  const value = (form.get(name) ?? "").trim().slice(0, 40);
  return value || undefined;
}

function parseAmount(raw: string | null): string {
  const amount = (raw ?? "").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
    throw new Error("The amount must be a positive rand value such as 800 or 799.99.");
  }
  return Number(amount).toFixed(2);
}

function expectStatus(milestone: store.Milestone, status: store.Status): void {
  if (milestone.status !== status) throw new Error("That step isn't available any more. The page has been refreshed.");
}

function heldAuthorization(milestone: store.Milestone): paypal.Authorization {
  if (!milestone.authorization) throw new Error("There's no PayPal hold on this milestone.");
  return milestone.authorization;
}

function withMessage(path: string, kind: "notice" | "error", message: string): string {
  return `${path}?${kind}=${encodeURIComponent(message)}`;
}

function describeError(err: unknown): string {
  if (err instanceof paypal.PayPalError) {
    return `PayPal: ${err.message} (${err.issue ?? `HTTP ${err.status}`}${err.debugId ? `, debug id ${err.debugId}` : ""})`;
  }
  return err instanceof Error ? err.message : String(err);
}

/** Where to send someone after an error: back to the page they acted from. */
function backTo(pathname: string): string {
  if (pathname === "/milestones") return "/new";
  return pathname.match(/^\/[mc]\/[\w-]+/)?.[0] ?? "/";
}

// ---- HTTP ----

async function readForm(req: IncomingMessage): Promise<URLSearchParams> {
  req.setEncoding("utf8");
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 20_000) throw new Error("Form too large.");
  }
  return new URLSearchParams(raw);
}

// The home page lists only the milestones created in this browser, not every visitor's.
const MINE_COOKIE = "pod_mine";

function myMilestones(req: IncomingMessage): string[] {
  const cookie = (req.headers.cookie ?? "").split(/;\s*/).find((c) => c.startsWith(`${MINE_COOKIE}=`));
  return (cookie?.slice(MINE_COOKIE.length + 1) ?? "").split(".").filter((id) => /^[\w-]{12}$/.test(id));
}

function rememberMilestone(req: IncomingMessage, id: string): string {
  const ids = [id, ...myMilestones(req).filter((other) => other !== id)].slice(0, 20);
  const secure = APP_URL.startsWith("https:") ? "; Secure" : "";
  return `${MINE_COOKIE}=${ids.join(".")}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax${secure}`;
}

function freelancerViewer(req: IncomingMessage): views.Viewer {
  const unread = store.some(myMilestones(req)).reduce((total, m) => total + views.unreadFor(m, "freelancer"), 0);
  return { role: "freelancer", unread, name: store.some(myMilestones(req))[0]?.freelancerName };
}

function redirect(res: ServerResponse, location: string): void {
  res.writeHead(303, { Location: location }).end();
}

function html(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, { "Content-Type": "text/html; charset=utf-8" }).end(body);
}

function serveDemo(res: ServerResponse, pathname: string): void {
  const name = pathname.slice("/demo/".length) || "index.html";
  if (!DEMO_FILES.has(name)) return html(res, views.notFound(), 404);
  const type = name.endsWith(".svg") ? "image/svg+xml" : "text/html; charset=utf-8";
  res.writeHead(200, { "Content-Type": type }).end(readFileSync(new URL(name, DEMO_DIR)));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", APP_URL);
  const method = req.method ?? "GET";
  const messages = { notice: url.searchParams.get("notice"), error: url.searchParams.get("error") };
  try {
    if (method === "GET" && url.pathname === "/") {
      return html(res, views.home(store.some(myMilestones(req)), freelancerViewer(req), messages));
    }
    if (method === "GET" && url.pathname === "/new") {
      return html(res, views.newProject(freelancerViewer(req), url.searchParams.has("demo"), messages));
    }
    if (method === "GET" && url.pathname === "/messages") {
      return html(res, views.messagesList(store.some(myMilestones(req)), freelancerViewer(req), messages));
    }
    if (method === "GET" && url.pathname === "/payments") {
      return html(res, views.payments(store.some(myMilestones(req)), freelancerViewer(req), messages));
    }
    if (method === "GET" && url.pathname === "/demo") return redirect(res, "/demo/");
    if (method === "GET" && url.pathname.startsWith("/demo/")) return serveDemo(res, url.pathname);
    if (method === "POST" && url.pathname === "/milestones") {
      const location = await createMilestone(await readForm(req));
      res.setHeader("Set-Cookie", rememberMilestone(req, location.slice("/m/".length)));
      return redirect(res, location);
    }
    if (method === "GET" && url.pathname === "/paypal/return") return redirect(res, await clientApproved(url.searchParams.get("token")));
    if (method === "GET" && url.pathname === "/paypal/cancel") return redirect(res, clientCancelled(url.searchParams.get("token")));

    // Freelancer and client pages use different random IDs, so neither link leads to the other side.
    const match = url.pathname.match(/^\/(m|c)\/([\w-]+)(?:\/(\w+))?$/);
    const milestone = match ? (match[1] === "m" ? store.get(match[2]) : store.getByClient(match[2])) : undefined;
    if (match && milestone) {
      const [, view, , action] = match;
      // Open pages poll this to notice when the other side has acted.
      if (method === "GET" && action === "state") {
        return void res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end(views.stateOf(milestone));
      }
      const role: store.Role = view === "m" ? "freelancer" : "client";
      if (method === "GET" && action === "chat") {
        // Opening the chat marks everything so far as read.
        milestone.seen[role] = milestone.messages.length;
        store.save();
        const viewer: views.Viewer = role === "client" ? { role, milestone } : freelancerViewer(req);
        return html(res, views.chatPage(milestone, role, viewer, messages));
      }
      if (method === "GET" && !action) {
        return html(
          res,
          role === "freelancer"
            ? views.freelancerPage(milestone, APP_URL, freelancerViewer(req), messages)
            : views.clientPage(milestone, APP_URL, messages),
        );
      }
      const handler = action ? (view === "m" ? FREELANCER_ACTIONS : CLIENT_ACTIONS).get(action) : undefined;
      if (method === "POST" && handler) return redirect(res, await handler(milestone, await readForm(req)));
    }
    html(res, views.notFound(Boolean(match && !milestone)), 404);
  } catch (err) {
    console.error(`${method} ${url.pathname} failed:`, err);
    redirect(res, withMessage(backTo(url.pathname), "error", describeError(err)));
  }
});

server.listen(PORT, () => {
  console.log(`PayWebbie running at ${APP_URL}`);
  if (!paypal.hasCredentials()) console.log("Missing PayPal credentials: add them to .env.");
  // Check the PayPal login once at startup so a bad key shows up in the server log, not mid-demo.
  else
    paypal.requestToken().then(
      (t) => console.log(`PayPal sandbox login OK (app ${t.app_id ?? "unknown"}).`),
      (err) =>
        console.log(`PayPal sandbox login FAILED: ${err instanceof Error ? err.message : err} (${paypal.credentialFingerprint()})`),
    );
  if (!ai.hasApiKey()) console.log("Missing GEMINI_API_KEY: add it to .env.");
});
