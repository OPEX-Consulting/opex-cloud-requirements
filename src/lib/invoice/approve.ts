// Server-only: admin actions of the review gate (approve, reject, re-price, resend).
// Every action is audited in pricing_audit. Approval is tied to the exact revision the admin looked at.
import { audit } from "../admin/auth";
import { db } from "../server/db";
import { loadPricing } from "../pricing/data";
import { priceQuote } from "../pricing/engine";
import type { PartnerChoice } from "../pricing/types";
import { INVOICE_TEXT } from "./company";
import { sendInvoiceToClient } from "./clientmail";
import { issuedPdf } from "./issue";
import { autoRepriceInputs, canResend, reviewable, type ReviewOverrides } from "./review";
import { getInvoice, pricedFields, type InvoiceRow } from "./service";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

async function projectName(projectId: string) {
  const { data } = await db().from("projects").select("project_name, customer_name").eq("id", projectId).maybeSingle();
  return { projectName: (data?.project_name as string) ?? "", customerName: (data?.customer_name as string) ?? "" };
}

/** Create/reuse the Zoho invoice, then email it to the client. Marks the row 'sent' or 'send_failed'. */
async function deliver(row: InvoiceRow): Promise<ActionResult> {
  const { projectName: pn } = await projectName(row.project_id);
  try {
    const out = await issuedPdf(row, pn);
    // Zoho is connected but failed: don't send a portal-numbered PDF in its place; let the admin retry.
    if (out.zohoStatus.startsWith("failed")) throw new Error(`Zoho Books ${out.zohoStatus}`);
    const sent = await sendInvoiceToClient({ invoice: row, pdf: out.pdf, filename: out.filename, zohoNumber: out.zohoNumber, zohoTotal: out.zohoTotal, projectName: pn });
    const now = new Date().toISOString();
    await db().from("invoices").update({ review_status: "sent", sent_at: now, sent_to: sent.to, send_error: out.warning ?? null }).eq("id", row.id);
    return { ok: true, message: `Approved and emailed to ${sent.to}${out.zohoNumber ? ` as Zoho ${out.zohoNumber}` : " (portal PDF: Zoho not connected)"}.` };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await db().from("invoices").update({ review_status: "send_failed", send_error: msg }).eq("id", row.id);
    return { ok: false, message: `Approved, but not sent: ${msg}. Fix it and press Resend.` };
  }
}

export async function approveInvoice(id: string, revision: number, reviewer: string, note: string): Promise<ActionResult> {
  const row = await getInvoice(id);
  if (!row) return { ok: false, message: "Invoice not found." };
  if (!reviewable(row)) return { ok: false, message: "This version can't be approved (already approved, superseded or in Zoho)." };
  if (row.revision !== revision) return { ok: false, message: "The client changed their answers since you opened this page. Review the new figures." };
  const now = new Date().toISOString();
  // Conditional update = lock: a double click or a second admin can't approve (and send) twice.
  const { data, error } = await db()
    .from("invoices")
    .update({ review_status: "approved", reviewed_by: reviewer, reviewed_at: now, review_note: note || null, issued_at: now, send_started_at: now, send_error: null })
    .eq("id", id)
    .eq("status", "current")
    .eq("revision", revision)
    .in("review_status", ["pending_review", "rejected"])
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "Someone else acted on this invoice, or it changed. Reload the page." };
  await audit("invoices", `${row.number} v${row.version}`, "update", { review_status: row.review_status }, { review_status: "approved", by: reviewer, note });
  return deliver(data as InvoiceRow);
}

export async function rejectInvoice(id: string, revision: number, reviewer: string, reason: string): Promise<ActionResult> {
  if (!reason) return { ok: false, message: "Give a reason for rejecting (internal only)." };
  const row = await getInvoice(id);
  if (!row) return { ok: false, message: "Invoice not found." };
  if (!reviewable(row) || row.review_status !== "pending_review") return { ok: false, message: "Only a pending version can be rejected." };
  const { data, error } = await db()
    .from("invoices")
    .update({ review_status: "rejected", reviewed_by: reviewer, reviewed_at: new Date().toISOString(), review_note: reason })
    .eq("id", id)
    .eq("revision", revision)
    .eq("review_status", "pending_review")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "The invoice changed since you opened it. Reload the page." };
  await audit("invoices", `${row.number} v${row.version}`, "update", { review_status: "pending_review" }, { review_status: "rejected", by: reviewer, reason });
  return { ok: true, message: "Rejected. Nothing was sent to the client." };
}

/** Re-price this version with the admin's partner / margin choice, at the FX rate already locked on it. */
export async function repriceInvoice(id: string, revision: number, reviewer: string, o: ReviewOverrides): Promise<ActionResult> {
  const row = await getInvoice(id);
  if (!row) return { ok: false, message: "Invoice not found." };
  if (!reviewable(row)) return { ok: false, message: "This version can no longer be re-priced." };
  if (row.revision !== revision) return { ok: false, message: "The invoice changed since you opened it. Reload the page." };
  const pricing = await loadPricing();
  const base = row.inputs_snapshot.inputs;
  const overrides: ReviewOverrides = {
    partner: (o.partner ?? "Recommended") as PartnerChoice,
    margin: typeof o.margin === "number" ? o.margin : pricing.settings.defaultMargin,
  };
  const inputs = { ...base, partner: overrides.partner!, margin: overrides.margin! };
  const fx = { rate: Number(row.fx_rate_used), source: row.fx_source };
  const result = priceQuote(inputs, pricing, fx.rate, INVOICE_TEXT.clientNote);
  const fields = pricedFields(result, fx, inputs, { assumptions: row.inputs_snapshot.assumptions }, row.inputs_snapshot.billTo, pricing, row.inputs_hash);
  const { data, error } = await db()
    .from("invoices")
    .update({ ...fields, review_overrides: overrides, revision: revision + 1, review_status: "pending_review" })
    .eq("id", id)
    .eq("revision", revision)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, message: error.message };
  if (!data) return { ok: false, message: "The invoice changed since you opened it. Reload the page." };
  await audit(
    "invoices",
    `${row.number} v${row.version}`,
    "update",
    { partner: row.chosen_partner, margin: base.margin, monthly_total: row.monthly_total },
    { ...overrides, chosen: result.comparison.chosen, monthly_total: result.quote.monthlyTotal, by: reviewer },
  );
  return { ok: true, message: `Re-priced on ${result.comparison.chosen} at ${(overrides.margin! * 100).toFixed(1)}% margin. Review the figures, then approve.` };
}

export async function resendInvoice(id: string, reviewer: string): Promise<ActionResult> {
  const row = await getInvoice(id);
  if (!row) return { ok: false, message: "Invoice not found." };
  if (row.status !== "current") return { ok: false, message: "Only the current version can be sent." };
  if (!canResend(row)) return { ok: false, message: "This invoice is being sent right now, or hasn't been approved." };
  const now = new Date().toISOString();
  const { data } = await db()
    .from("invoices")
    .update({ review_status: "approved", send_started_at: now, send_error: null })
    .eq("id", id)
    .eq("review_status", row.review_status)
    .select("*")
    .maybeSingle();
  if (!data) return { ok: false, message: "Someone else is sending this invoice. Reload the page." };
  await audit("invoices", `${row.number} v${row.version}`, "update", { review_status: row.review_status }, { review_status: "resend", by: reviewer });
  return deliver(data as InvoiceRow);
}

/**
 * After a pricing-settings change (discounts, margin, VAT…), re-price every version still waiting for review
 * with the new settings. Sent / approved / Zoho versions are frozen and untouched. FX stays as locked on each version.
 * A margin or partner the admin set on an invoice is kept. Each re-price bumps the revision (so a review page
 * opened before the change can't approve stale figures) and is audited.
 */
export async function repriceUnsentAfterSettings(by: string, changedKeys: string[]): Promise<{ repriced: number; failed: number }> {
  const { data, error } = await db()
    .from("invoices")
    .select("*")
    .eq("status", "current")
    .in("review_status", ["pending_review", "rejected"])
    .is("zoho_invoice_id", null)
    .limit(500);
  if (error) throw new Error(`unsent invoices lookup failed: ${error.message}`);
  const pricing = await loadPricing();
  let repriced = 0;
  let failed = 0;
  for (const row of (data ?? []) as InvoiceRow[]) {
    if (!reviewable(row)) continue;
    try {
      const inputs = autoRepriceInputs(row.inputs_snapshot.inputs, row.review_overrides, pricing.settings.defaultMargin);
      const fx = { rate: Number(row.fx_rate_used), source: row.fx_source };
      const result = priceQuote(inputs, pricing, fx.rate, INVOICE_TEXT.clientNote);
      const fields = pricedFields(result, fx, inputs, { assumptions: row.inputs_snapshot.assumptions }, row.inputs_snapshot.billTo, pricing, row.inputs_hash);
      const rev = row.revision ?? 1;
      const { data: upd } = await db()
        .from("invoices")
        .update({ ...fields, revision: rev + 1 })
        .eq("id", row.id)
        .eq("revision", rev)
        .in("review_status", ["pending_review", "rejected"])
        .select("id")
        .maybeSingle();
      if (!upd) continue; // changed meanwhile (client resubmitted or an admin acted): leave it
      await audit(
        "invoices",
        `${row.number} v${row.version}`,
        "update",
        { partner: row.chosen_partner, monthly_total: row.monthly_total },
        { reason: "settings changed", keys: changedKeys, chosen: result.comparison.chosen, monthly_total: result.quote.monthlyTotal, by },
      );
      repriced++;
    } catch (e) {
      console.error("[reprice-after-settings]", row.id, e);
      failed++;
    }
  }
  return { repriced, failed };
}

/** Re-price waiting invoices after a pricing change and return a sentence for the admin's flash message. */
export async function repriceNote(changed: string[]): Promise<string> {
  try {
    const r = await repriceUnsentAfterSettings("pricing change", changed);
    return ` Re-priced ${r.repriced} invoice(s) awaiting review${r.failed ? `; ${r.failed} failed (see logs)` : ""}. Sent invoices are unchanged.`;
  } catch (e) {
    return ` Saved, but re-pricing waiting invoices failed: ${e instanceof Error ? e.message : String(e)}.`;
  }
}
