// Collects facts about a delivered website with plain HTTP requests: no AI involved.
// The AI later judges the checklist against this evidence, so everything recorded here must be verifiable.
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parse } from "node-html-parser";

const MAX_PAGES = 8;
const MAX_LINKS_CHECKED = 25;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2_000_000;
// Local development serves the demo site from localhost, which the private-network guard would block.
const ALLOW_LOCAL_URLS = process.env.ALLOW_LOCAL_URLS === "true";

export type PageEvidence = {
  url: string;
  status: number;
  loadMs: number;
  title: string;
  headings: string[];
  hasMobileViewport: boolean;
  images: number;
  imagesMissingAlt: number;
  forms: { action: string; fields: string[] }[];
  text: string;
};

export type SiteEvidence = {
  startUrl: string;
  https: boolean;
  checkedAt: string;
  pages: PageEvidence[];
  contactLinks: string[];
  linksChecked: number;
  brokenLinks: { url: string; status: string }[];
  errors: string[];
};

export async function collectEvidence(rawUrl: string): Promise<SiteEvidence> {
  const start = await assertPublicUrl(rawUrl.trim());
  const evidence: SiteEvidence = {
    startUrl: start.href,
    https: start.protocol === "https:",
    checkedAt: new Date().toISOString(),
    pages: [],
    contactLinks: [],
    linksChecked: 0,
    brokenLinks: [],
    errors: [],
  };

  const home = await visitPage(start);
  evidence.pages.push(home.page);
  const internal = home.links.filter((link) => link.origin === start.origin && link.href !== home.page.url);
  const others = await Promise.allSettled(unique(internal).slice(0, MAX_PAGES - 1).map(visitPage));

  const allLinks = [...home.links];
  for (const result of others) {
    if (result.status === "fulfilled") {
      evidence.pages.push(result.value.page);
      allLinks.push(...result.value.links);
    } else {
      evidence.errors.push(describe(result.reason));
    }
  }

  const visited = new Set(evidence.pages.map((page) => page.url));
  evidence.contactLinks = unique(allLinks.filter((link) => /^(mailto|tel):|wa\.me/.test(link.href))).map((link) => link.href);
  const toCheck = unique(allLinks.filter((link) => /^https?:$/.test(link.protocol) && !visited.has(link.href)));
  const checks = await Promise.all(toCheck.slice(0, MAX_LINKS_CHECKED).map(checkLink));
  evidence.linksChecked = checks.length + evidence.pages.length;
  evidence.brokenLinks = [
    ...evidence.pages.filter((page) => page.status >= 400).map((page) => ({ url: page.url, status: String(page.status) })),
    ...checks.filter((check) => check !== undefined),
  ];
  return evidence;
}

async function visitPage(url: URL): Promise<{ page: PageEvidence; links: URL[] }> {
  const { res, finalUrl, ms } = await fetchSafely(url);
  const page: PageEvidence = {
    url: finalUrl.href,
    status: res.status,
    loadMs: ms,
    title: "",
    headings: [],
    hasMobileViewport: false,
    images: 0,
    imagesMissingAlt: 0,
    forms: [],
    text: "",
  };
  // An error page's links (e.g. "back to home") aren't part of the delivered site.
  if (res.status >= 400 || !(res.headers.get("content-type") ?? "").includes("text/html")) {
    await res.body?.cancel();
    return { page, links: [] };
  }

  const root = parse(await readText(res));
  for (const el of root.querySelectorAll("script, style, noscript, svg")) el.remove();
  const images = root.querySelectorAll("img");
  page.title = clean(root.querySelector("title")?.text ?? "");
  page.headings = root.querySelectorAll("h1, h2, h3").map((h) => clean(h.text)).filter(Boolean).slice(0, 20);
  page.hasMobileViewport = /width\s*=\s*device-width/i.test(root.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "");
  page.images = images.length;
  page.imagesMissingAlt = images.filter((img) => img.getAttribute("alt") === undefined).length;
  page.forms = root.querySelectorAll("form").map((form) => ({
    action: form.getAttribute("action") ?? "",
    fields: form.querySelectorAll("input, textarea, select, button").map((field) =>
      [field.tagName.toLowerCase(), field.getAttribute("type"), field.getAttribute("name") ?? field.getAttribute("placeholder") ?? clean(field.text)]
        .filter(Boolean)
        .join(" "),
    ),
  }));
  // structuredText keeps a break between blocks and table cells; plain .text runs "Thursday" into "11:00".
  // Links are inline, so nav menus would still read "HomeMenuContact" without an explicit space.
  for (const a of root.querySelectorAll("a")) a.insertAdjacentHTML("afterend", " ");
  page.text = clean((root.querySelector("body") ?? root).structuredText).slice(0, 1500);

  const links = root
    .querySelectorAll("a[href]")
    .map((a) => {
      try {
        const link = new URL(a.getAttribute("href") ?? "", finalUrl);
        link.hash = "";
        return link;
      } catch {
        return undefined;
      }
    })
    .filter((link) => link !== undefined);
  return { page, links };
}

async function checkLink(url: URL): Promise<{ url: string; status: string } | undefined> {
  try {
    let { res } = await fetchSafely(url, "HEAD");
    // Many servers answer HEAD wrongly, so confirm any failure with a normal GET before calling a link broken.
    if (res.status >= 400) {
      await res.body?.cancel();
      ({ res } = await fetchSafely(url, "GET"));
    }
    await res.body?.cancel();
    return res.status >= 400 ? { url: url.href, status: String(res.status) } : undefined;
  } catch (err) {
    return { url: url.href, status: describe(err) };
  }
}

/** Fetches a URL, following redirects by hand so every hop passes the private-network guard. */
async function fetchSafely(url: URL, method = "GET"): Promise<{ res: Response; finalUrl: URL; ms: number }> {
  const started = performance.now();
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicUrl(current.href);
    const res = await fetch(current, {
      method,
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "ProofOfDone/0.1 (deliverable check)" },
    });
    const location = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current);
      continue;
    }
    return { res, finalUrl: current, ms: Math.round(performance.now() - started) };
  }
  throw new Error(`Too many redirects from ${url.href}`);
}

async function readText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Blocks addresses on private networks, so a submitted URL can't make the server probe its own network. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That isn't a valid website address. It should start with https://");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https websites can be checked.");
  if (ALLOW_LOCAL_URLS) return url;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  let addresses: string[];
  try {
    addresses = isIP(host) ? [host] : (await lookup(host, { all: true })).map((entry) => entry.address);
  } catch {
    throw new Error(`Couldn't find the website ${url.hostname}. Check the address.`);
  }
  if (addresses.some(isPrivateAddress)) throw new Error(`${url.hostname} is on a private network, so it can't be checked.`);
  return url;
}

function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^::ffff:/, "");
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return ip === "::" || ip === "::1" || ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80");
}

function unique(links: URL[]): URL[] {
  return [...new Map(links.map((link) => [link.href, link])).values()];
}

function clean(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function describe(err: unknown): string {
  return err instanceof Error ? (err.name === "TimeoutError" ? "timed out" : err.message) : String(err);
}
