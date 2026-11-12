// Milestones live in memory and are mirrored to data/milestones.json, so a restart doesn't lose the demo.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { Authorization, Capture } from "./paypal.ts";
import type { Criterion, Verdict } from "./ai.ts";
import type { SiteEvidence } from "./evidence.ts";

export type Status = "AWAITING_HOLD" | "FUNDS_HELD" | "IN_REVIEW" | "PAID" | "HOLD_RELEASED" | "DECLINED";

export type Role = "freelancer" | "client";
export type ChatMessage = { from: Role; text: string; at: string };

export type Milestone = {
  /** The freelancer's private key: /m/<id>. Never shown to the client. */
  id: string;
  /** The client's private key: /c/<clientId>. A separate random value, so the client's link can't be edited into the freelancer's. */
  clientId: string;
  title: string;
  /** What the freelancer will deliver, in their own words. */
  requirements?: string;
  brief: string;
  freelancerName?: string;
  clientName?: string;
  amount: string;
  criteria: Criterion[];
  status: Status;
  createdAt: string;
  orderId?: string;
  authorization?: Authorization;
  submission?: { url: string; submittedAt: string; evidence: SiteEvidence; verdict: Verdict };
  changeRequests: { note: string; at: string }[];
  /** The project chat between the two sides. */
  messages: ChatMessage[];
  /** How many chat messages each side has seen, for the unread badges. */
  seen: { freelancer: number; client: number };
  capture?: Capture;
};

const DIR = "data";
const FILE = `${DIR}/milestones.json`;
const milestones = new Map<string, Milestone>(load().map((m) => [m.id, m]));

function load(): Milestone[] {
  try {
    const saved = JSON.parse(readFileSync(FILE, "utf8")) as Milestone[];
    // Milestones saved before client links existed get one now.
    for (const m of saved) {
      m.clientId ??= newId();
      m.messages ??= [];
      m.seen ??= { freelancer: 0, client: 0 };
    }
    return saved;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`Couldn't read ${FILE}, starting empty:`, err);
    return [];
  }
}

export function save(): void {
  mkdirSync(DIR, { recursive: true });
  // Write to a temp file first so a crash mid-write can't corrupt the data.
  writeFileSync(`${FILE}.tmp`, JSON.stringify([...milestones.values()], null, 2));
  renameSync(`${FILE}.tmp`, FILE);
}

/** Unguessable, because the ID is the only thing protecting a milestone's pages. */
export function newId(): string {
  return randomBytes(9).toString("base64url");
}

export function add(milestone: Milestone): void {
  milestones.set(milestone.id, milestone);
  save();
}

export function get(id: string): Milestone | undefined {
  return milestones.get(id);
}

export function getByClient(clientId: string): Milestone | undefined {
  return [...milestones.values()].find((m) => m.clientId === clientId);
}

/** The milestones with these freelancer IDs, newest first. */
export function some(ids: string[]): Milestone[] {
  return ids.flatMap((id) => milestones.get(id) ?? []).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function findByOrder(orderId: string | null): Milestone {
  const milestone = [...milestones.values()].find((m) => m.orderId !== undefined && m.orderId === orderId);
  if (!milestone) throw new Error("PayPal sent back an order this app doesn't know.");
  return milestone;
}
