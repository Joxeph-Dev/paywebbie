// Milestones live in memory and are mirrored to data/milestones.json, so a restart doesn't lose the demo.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import type { Authorization, Capture } from "./paypal.ts";
import type { Criterion, Verdict } from "./ai.ts";
import type { SiteEvidence } from "./evidence.ts";

export type Status = "AWAITING_HOLD" | "FUNDS_HELD" | "IN_REVIEW" | "PAID" | "HOLD_RELEASED" | "DECLINED";

export type Milestone = {
  id: string;
  title: string;
  brief: string;
  amount: string;
  criteria: Criterion[];
  status: Status;
  createdAt: string;
  orderId?: string;
  authorization?: Authorization;
  submission?: { url: string; submittedAt: string; evidence: SiteEvidence; verdict: Verdict };
  changeRequests: { note: string; at: string }[];
  capture?: Capture;
};

const DIR = "data";
const FILE = `${DIR}/milestones.json`;
const milestones = new Map<string, Milestone>(load().map((m) => [m.id, m]));

function load(): Milestone[] {
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as Milestone[];
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

export function all(): Milestone[] {
  return [...milestones.values()].reverse();
}

export function findByOrder(orderId: string | null): Milestone {
  const milestone = [...milestones.values()].find((m) => m.orderId !== undefined && m.orderId === orderId);
  if (!milestone) throw new Error("PayPal sent back an order this app doesn't know.");
  return milestone;
}
