// Server-only: review-gate emails. Every attempt is written to the `notifications` outbox.
//  - notifyReviewNeeded: to OPEX (EMAIL.alertTo) when a version needs review. Never throws.
//  - sendInvoiceToClient: the approved invoice PDF to the client contact, CC list from /admin/reviews. Throws on failure so the
//    caller can mark the version 'send_failed'.
import { db } from "../server/db";
import { isEmail } from "../requirements/logic";
import { COMPANY, EMAIL } from "./company";
import { amountDue } from "./due";
import { clientCc, reviewCc } from "./cc";
import { cleanAddress, esc, smtpHost, smtpReady, smtpTransport } from "./email";
import { loadPaymentDetails } from "./payment";
import { paymentConfigured } from "./payment-shared";
import type { InvoiceRow } from "./service";
import { naira } from "./view";

const DEBOUNCE_MS = 10 * 60 * 1000;

async function outbox(row: Record<string, unknown>) {
  const { data } = await db().from("notifications").insert(row).select("id").single();
  return (data?.id as string | undefined) ?? undefined;
}

export async function notifyReviewNeeded(args: { invoice: InvoiceRow; customerName: string; projectName: string; adminUrl: string }) {
  const { invoice } = args;
  const to = cleanAddress(EMAIL.alertTo);
  const c = invoice.comparison;
  const subject = `Invoice to review: ${args.customerName || "client"} · ${invoice.number} v${invoice.version} · ${naira(Number(invoice.monthly_total))}/month`;
  const base = { kind: "invoice_review", project_id: invoice.project_id, invoice_id: invoice.id, to_address: to, subject };
  try {
    const since = new Date(Date.now() - DEBOUNCE_MS).toISOString();
    const { data: recent } = await db()
      .from("notifications")
      .select("id")
      .eq("invoice_id", invoice.id)
      .eq("kind", "invoice_review")
      .in("status", ["pending", "sent"])
      .gte("created_at", since)
      .limit(1);
    if (recent?.length) return void (await outbox({ ...base, status: "debounced" }));
    if (!smtpReady()) return void (await outbox({ ...base, status: "skipped_no_provider", error: "SMTP_HOST / SMTP_USER / SMTP_PASS not set" }));
    const cc = (await reviewCc().catch(() => [] as string[])).filter((a) => a !== to.toLowerCase());
    const id = await outbox({ ...base, status: "pending" });
    const rows: [string, string][] = [
      ["Client", args.customerName || "—"],
      ["Project", args.projectName || "—"],
      ["Invoice", `${invoice.number} (version ${invoice.version})`],
      ["Monthly total (incl. VAT)", naira(Number(invoice.monthly_total))],
      ["Partner (internal)", invoice.chosen_partner],
      ["Partner cost / month (internal)", naira(Number(c?.partnerCostChosen ?? 0))],
      ["Profit / month excl. VAT (internal)", `${naira(Number(c?.marginNgn ?? 0))} (${((c?.marginPctOfPrice ?? 0) * 100).toFixed(1)}%)`],
    ];
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#07152f">
<p>A client submitted requirements. The invoice below is <b>waiting for review</b> and has <b>not</b> been sent to the client.</p>
<table cellpadding="4" style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="color:#5f6b7a">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join("")}</table>
<p><a href="${esc(args.adminUrl)}">Review and approve or reject</a></p></div>`;
    const text = `Invoice waiting for review (not sent to the client).\n\n${rows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n\nReview: ${args.adminUrl}`;
    try {
      const info = await smtpTransport(smtpHost()).sendMail({ from: EMAIL.from, to, ...(cc.length ? { cc } : {}), subject, html, text });
      await db().from("notifications").update({ status: "sent", provider_id: info.messageId ?? null, sent_at: new Date().toISOString() }).eq("id", id);
    } catch (err) {
      await db().from("notifications").update({ status: "failed", error: `SMTP: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500) }).eq("id", id);
    }
  } catch (e) {
    console.error("[review email] failed", e);
  }
}

export async function sendInvoiceToClient(args: {
  invoice: InvoiceRow;
  pdf: Uint8Array;
  filename: string;
  zohoNumber?: string;
  zohoTotal: number | null;
  projectName: string;
}): Promise<{ to: string; messageId?: string }> {
  const { invoice } = args;
  const bill = invoice.inputs_snapshot.billTo;
  const to = (bill.contactEmail || "").trim();
  if (!isEmail(to)) throw new Error(`the client contact email "${to || "(blank)"}" is not a valid address`);
  if (!smtpReady()) throw new Error("email is not configured (SMTP_HOST / SMTP_USER / SMTP_PASS)");
  const cc = (await clientCc()).filter((a) => a !== to.toLowerCase());
  const replyTo = cleanAddress(EMAIL.alertTo);
  const number = args.zohoNumber || invoice.number;
  const due = amountDue({ ...invoice, zoho_total: args.zohoTotal });
  const pay = await loadPaymentDetails();
  const subject = `Your ${COMPANY.tradingName} invoice ${number}`;
  const id = await outbox({ kind: "invoice_client", project_id: invoice.project_id, invoice_id: invoice.id, to_address: to, subject, status: "pending" });

  const first = (bill.contactName || "").trim().split(/\s+/)[0];
  const payRows: [string, string][] = paymentConfigured(pay)
    ? ([
        ["Bank", pay.bankName],
        ["Account name", pay.accountName],
        ["Account number", pay.accountNumber],
        ["Sort code", pay.sortCode],
        ["Payment reference", number],
      ] as [string, string][]).filter(([, v]) => v)
    : [];
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#07152f">
<p>${first ? `Dear ${esc(first)},` : "Hello,"}</p>
<p>Thank you for sharing your requirements${args.projectName ? ` for <b>${esc(args.projectName)}</b>` : ""}. Please find your invoice <b>${esc(number)}</b> attached.</p>
<p><b>${esc(due.label)}: ${esc(naira(due.amount))}</b></p>
${
  payRows.length
    ? `<p><b>Payment details</b></p><table cellpadding="3" style="border-collapse:collapse">${payRows
        .map(([k, v]) => `<tr><td style="color:#5f6b7a">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`)
        .join("")}</table>`
    : ""
}
<p>If you have any questions, reply to this email or contact us at ${esc(COMPANY.email)}${COMPANY.phone ? ` or ${esc(COMPANY.phone)}` : ""}.</p>
<p>Kind regards,<br/>${esc(COMPANY.tradingName)} · ${esc(COMPANY.legalName)}</p></div>`;
  const text = `${first ? `Dear ${first},` : "Hello,"}\n\nPlease find your invoice ${number} attached.\n${due.label}: ${naira(due.amount)}\n${
    payRows.length ? `\nPayment details\n${payRows.map(([k, v]) => `${k}: ${v}`).join("\n")}\n` : ""
  }\nQuestions: ${COMPANY.email}\n\n${COMPANY.tradingName}`;
  try {
    const info = await smtpTransport(smtpHost()).sendMail({
      from: EMAIL.from,
      to,
      ...(cc.length ? { cc } : {}),
      replyTo,
      subject,
      html,
      text,
      attachments: [{ filename: args.filename, content: Buffer.from(args.pdf), contentType: "application/pdf" }],
    });
    await db().from("notifications").update({ status: "sent", provider_id: info.messageId ?? null, sent_at: new Date().toISOString() }).eq("id", id);
    return { to, messageId: info.messageId };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await db().from("notifications").update({ status: "failed", error: `SMTP: ${msg}`.slice(0, 500) }).eq("id", id);
    throw new Error(`email failed: ${msg}`);
  }
}
