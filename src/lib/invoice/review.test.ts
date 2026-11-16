import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOverrides, autoRepriceInputs, canResend, needsAutoReprice, partnerDiscount, clientInvoiceState, isFrozen, reviewable, STUCK_SEND_MS, type ReviewStatus } from "./review";
import type { EngineInputs } from "../pricing/types";

const row = (version: number, status: string, review_status: ReviewStatus, extra: Record<string, unknown> = {}) => ({ version, status, review_status, ...extra });

test("clients see nothing priced before approval", () => {
  assert.deepEqual(clientInvoiceState([], false), { state: "not_submitted", sent: null, updatePending: false });
  for (const s of ["pending_review", "rejected", "approved", "send_failed"] as ReviewStatus[]) {
    const v = clientInvoiceState([row(1, "current", s)], true);
    assert.equal(v.state, "in_review", s);
    assert.equal(v.sent, null, s);
  }
});

test("clients see the latest sent version, and are told when an update is in review", () => {
  const v1 = row(1, "superseded", "sent");
  const v2 = row(2, "current", "pending_review");
  const v = clientInvoiceState([v2, v1], true);
  assert.equal(v.state, "sent");
  assert.equal(v.sent, v1);
  assert.equal(v.updatePending, true);
  const only = row(1, "current", "sent");
  assert.equal(clientInvoiceState([only], true).updatePending, false);
  const v3 = row(3, "current", "sent");
  assert.equal(clientInvoiceState([v1, row(2, "superseded", "sent"), v3], true).sent, v3);
});

test("approved, sent or Zoho-created versions are frozen and not reviewable", () => {
  assert.equal(isFrozen({ review_status: "pending_review" }), false);
  assert.equal(isFrozen({ review_status: "rejected" }), false);
  assert.equal(isFrozen({ review_status: "approved" }), true);
  assert.equal(isFrozen({ review_status: "sent" }), true);
  assert.equal(isFrozen({ review_status: "send_failed" }), true);
  assert.equal(isFrozen({ review_status: "pending_review", zoho_invoice_id: "123" }), true);
  assert.equal(reviewable({ status: "current", review_status: "pending_review" }), true);
  assert.equal(reviewable({ status: "current", review_status: "rejected" }), true);
  assert.equal(reviewable({ status: "superseded", review_status: "pending_review" }), false);
  assert.equal(reviewable({ status: "current", review_status: "sent" }), false);
});

test("resend: failed or sent always; an in-flight send only once it is stuck", () => {
  const now = Date.now();
  assert.equal(canResend({ review_status: "send_failed", send_started_at: null }, now), true);
  assert.equal(canResend({ review_status: "sent", send_started_at: null }, now), true);
  assert.equal(canResend({ review_status: "approved", send_started_at: new Date(now - 1000).toISOString() }, now), false);
  assert.equal(canResend({ review_status: "approved", send_started_at: new Date(now - STUCK_SEND_MS - 1).toISOString() }, now), true);
  assert.equal(canResend({ review_status: "pending_review", send_started_at: null }, now), false);
});

test("overrides replace partner and margin only", () => {
  const base = { partner: "Recommended", margin: 0.2, termMonths: 12 } as unknown as EngineInputs;
  assert.deepEqual(applyOverrides(base, {}), base);
  assert.deepEqual(applyOverrides(base, { partner: "Unitellas", margin: 0.35 }), { ...base, partner: "Unitellas", margin: 0.35 });
  assert.equal(applyOverrides(base, { margin: Number.NaN }).margin, 0.2);
});

test("settings change: discounts/margin/VAT trigger a re-price, FX and display settings don't", () => {
  assert.equal(needsAutoReprice(["unitellas_discount"]), true);
  assert.equal(needsAutoReprice(["default_margin", "show_partner"]), true);
  assert.equal(needsAutoReprice(["fx_mode", "fx_buffer_pct", "show_partner", "quote_validity_days"]), false);
});

test("auto re-price uses the new default margin unless the admin set one on the invoice", () => {
  const base = { margin: 0.2, partner: "Recommended" } as unknown as EngineInputs;
  assert.equal(autoRepriceInputs(base, {}, 0.25).margin, 0.25);
  assert.equal(autoRepriceInputs(base, null, 0.25).margin, 0.25);
  const kept = autoRepriceInputs(base, { margin: 0.3, partner: "UniCloud" }, 0.25);
  assert.equal(kept.margin, 0.3);
  assert.equal(kept.partner, "UniCloud");
});

test("partner discount lookup", () => {
  const s = { unicloudDiscount: 0.1, unitellasDiscount: 0.45 };
  assert.equal(partnerDiscount("Unitellas", s), 0.45);
  assert.equal(partnerDiscount("UniCloud", s), 0.1);
  assert.equal(partnerDiscount("UniCloud", null), undefined);
});
