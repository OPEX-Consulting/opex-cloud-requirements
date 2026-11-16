/* Review gate: pure rules shared by the portal API, the admin and the tests (no database access). */
import type { EngineInputs, Partner, PartnerChoice } from "../pricing/types";

export type ReviewStatus = "pending_review" | "rejected" | "approved" | "sent" | "send_failed";

/** Per-invoice admin choices applied on top of the client's answers when pricing. */
export type ReviewOverrides = { partner?: PartnerChoice; margin?: number };

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  pending_review: "Pending review",
  rejected: "Rejected",
  approved: "Approved · sending",
  sent: "Sent to client",
  send_failed: "Approved · email failed",
};

/** A frozen version is never re-priced in place: a change creates a new version instead. */
export function isFrozen(row: { review_status: ReviewStatus; zoho_invoice_id?: string | null }) {
  return row.review_status === "approved" || row.review_status === "sent" || row.review_status === "send_failed" || Boolean(row.zoho_invoice_id);
}

/** Admin may re-price (override partner / margin) and approve or reject only these. */
export const reviewable = (row: { status: string; review_status: ReviewStatus; zoho_invoice_id?: string | null }) =>
  row.status === "current" && (row.review_status === "pending_review" || row.review_status === "rejected") && !isFrozen(row);

/** An "approved" row whose send started this long ago is treated as stuck and may be retried. */
export const STUCK_SEND_MS = 3 * 60 * 1000;

export function canResend(row: { review_status: ReviewStatus; send_started_at: string | null }, now = Date.now()) {
  if (row.review_status === "send_failed" || row.review_status === "sent") return true;
  if (row.review_status === "approved") return !row.send_started_at || now - new Date(row.send_started_at).getTime() > STUCK_SEND_MS;
  return false;
}

export function applyOverrides(inputs: EngineInputs, o: ReviewOverrides | null | undefined): EngineInputs {
  if (!o) return inputs;
  return {
    ...inputs,
    ...(o.partner ? { partner: o.partner } : {}),
    ...(typeof o.margin === "number" && Number.isFinite(o.margin) ? { margin: o.margin } : {}),
  };
}

export type ClientInvoiceState = "not_submitted" | "in_review" | "sent";

/**
 * What the client may see. Prices are shown only for a version OPEX approved and emailed;
 * anything else is "in review" (rejections are internal and never shown to the client).
 */
export function clientInvoiceState<R extends { status: string; review_status: ReviewStatus; version: number }>(
  rows: R[],
  submitted: boolean,
): { state: ClientInvoiceState; sent: R | null; updatePending: boolean } {
  const sent = [...rows].filter((r) => r.review_status === "sent").sort((a, b) => b.version - a.version)[0] ?? null;
  const current = rows.find((r) => r.status === "current") ?? null;
  if (sent) return { state: "sent", sent, updatePending: Boolean(current && current !== sent && submitted) };
  return { state: submitted ? "in_review" : "not_submitted", sent: null, updatePending: false };
}

export const partnerName = (p: Partner) => p;
