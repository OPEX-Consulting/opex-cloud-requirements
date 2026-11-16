import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/server/db";
import { loadPricing } from "@/lib/pricing/data";
import { priceQuote } from "@/lib/pricing/engine";
import type { Partner } from "@/lib/pricing/types";
import { INVOICE_TEXT } from "@/lib/invoice/company";
import { amountDue } from "@/lib/invoice/due";
import { canResend, REVIEW_LABELS, reviewable } from "@/lib/invoice/review";
import { getInvoice } from "@/lib/invoice/service";
import { AdminShell, Card, Flash, btn, btnLight, input, ngn, when, type SP } from "../../_ui";

export const dynamic = "force-dynamic";

const PARTNERS: Partner[] = ["UniCloud", "Unitellas"];

export default async function ReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  await requireAdmin();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const row = await getInvoice(id);
  if (!row) notFound();
  const [{ data: p }, pricing] = await Promise.all([db().from("projects").select("id, customer_name, project_name, status").eq("id", row.project_id).maybeSingle(), loadPricing()]);

  const inputs = row.inputs_snapshot.inputs;
  const fx = Number(row.fx_rate_used);
  // Side by side: the same answers priced on each partner (today's rate cards, this version's locked FX and margin).
  const alt = PARTNERS.map((partner) => {
    const r = priceQuote({ ...inputs, partner }, pricing, fx, INVOICE_TEXT.clientNote);
    return { partner, q: r.quote, c: r.comparison };
  });
  const best = alt.reduce((a, b) => (b.c.marginNgn > a.c.marginNgn ? b : a));
  const c = row.comparison;
  const q = row.inputs_snapshot.quote;
  const bill = row.inputs_snapshot.billTo;
  const canAct = reviewable(row);
  const due = amountDue(row);
  const costByKey = new Map(c.lines.map((l) => [l.key, l.chosenUnit]));

  return (
    <AdminShell active="reviews">
      <Flash searchParams={searchParams} />
      <p className="mb-2 text-sm">
        <Link href="/admin/reviews" className="font-semibold text-opex-blue hover:underline">
          ← Reviews
        </Link>
      </p>
      <h1 className="text-2xl font-bold">
        {row.number} v{row.version} · {REVIEW_LABELS[row.review_status]}
      </h1>
      <p className="mb-5 text-sm text-secondary">
        {p?.customer_name || bill.name} · {p?.project_name} · client status <b>{p?.status}</b> · priced {when(row.created_at)} · revision {row.revision}
        {row.status !== "current" && <b className="text-[#b4532a]"> · superseded</b>}
        {p && (
          <>
            {" "}
            ·{" "}
            <Link href={`/admin/projects/${p.id}`} className="text-opex-blue hover:underline">
              answers
            </Link>
          </>
        )}
      </p>
      {row.reviewed_by && (
        <p className="mb-4 rounded-xl bg-[#f5f7fb] px-4 py-2.5 text-sm">
          {row.review_status === "rejected" ? "Rejected" : "Approved"} by <b>{row.reviewed_by}</b> on {when(row.reviewed_at)}
          {row.review_note ? ` – “${row.review_note}”` : ""}
          {row.sent_at && ` · emailed to ${row.sent_to} on ${when(row.sent_at)}`}
        </p>
      )}
      {row.send_error && (
        <p role="alert" className="mb-4 rounded-xl bg-[#fdf1ec] px-4 py-2.5 text-sm text-[#8a3a17]">
          {row.review_status === "sent" ? "Warning: " : "Not sent: "}
          {row.send_error}
        </p>
      )}

      <Card title="Profit (internal – never shown to the client)">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-xl bg-opex-navy p-4 text-white">
            <p className="text-xs text-white/70">This invoice · {row.chosen_partner}</p>
            <p className="mt-1 text-xl font-bold">{ngn(c.marginNgn)} / month</p>
            <p className="text-xs text-white/70">
              {(c.marginPctOfPrice * 100).toFixed(1)}% of price · margin {(inputs.margin * 100).toFixed(1)}% · partner cost {ngn(c.partnerCostChosen)}
            </p>
          </div>
          {alt.map((a) => (
            <div key={a.partner} className={`rounded-xl border p-4 ${a === best ? "border-[#9fd5b2] bg-[#f1faf4]" : "border-[#e3e7ee]"}`}>
              <p className="text-xs text-muted">
                On {a.partner}
                {a.partner === c.recommended && " · recommended"}
                {a === best && " · most profit"}
              </p>
              <p className="mt-1 text-lg font-bold">{ngn(a.c.marginNgn)} / month</p>
              <p className="text-xs text-muted">
                Client pays {ngn(a.q.monthlyTotal)} incl. VAT · cost {ngn(a.c.partnerCostChosen)} · {a.q.tbqCount} to be quoted
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          {c.recommendationReason} {c.lflNote} FX ₦{row.fx_rate_used} per $1 ({row.fx_source}), locked on this version. Side-by-side figures use today&apos;s rate cards.
        </p>
      </Card>

      <Card title="What the client will receive">
        <p className="mb-2 text-sm">
          To <b>{bill.contactName || "—"}</b> &lt;{bill.contactEmail || "no email"}&gt;, copy to OPEX · bill to {bill.name || "—"}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3 text-right">Partner cost / unit</th>
                <th className="py-2 pr-3 text-right">Client price / unit</th>
                <th className="py-2 pr-3 text-right">Monthly</th>
              </tr>
            </thead>
            <tbody>
              {q.lines.map((l) => {
                const cost = costByKey.get(l.key);
                return (
                  <tr key={l.n} className="border-t border-[#eef1f5] align-top">
                    <td className="py-2 pr-3 text-muted">{l.n}</td>
                    <td className="py-2 pr-3">
                      {l.description}
                      {l.assumed && <div className="text-xs text-[#b4532a]">Assumed: {l.assumed}</div>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.qty}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-muted">{typeof cost === "number" ? ngn(cost) : "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{l.toBeQuoted ? "To be quoted" : ngn(l.unitPrice)}</td>
                    <td className="py-2 pr-3 text-right font-semibold tabular-nums">{l.toBeQuoted ? "—" : ngn(l.monthly)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm">
          Subtotal {ngn(q.subtotal)} · VAT {ngn(q.vat)} · monthly total <b>{ngn(q.monthlyTotal)}</b> · {due.label}: <b>{ngn(due.amount)}</b>
        </p>
        {row.inputs_snapshot.assumptions.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-xs text-muted">
            {row.inputs_snapshot.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-sm">
          <a className="font-semibold text-opex-blue hover:underline" href={`/api/admin/invoices/${row.id}/pdf`} target="_blank">
            Preview portal PDF
          </a>{" "}
          <span className="text-xs text-muted">(the client receives the Zoho Books PDF when Zoho is connected)</span>
        </p>
      </Card>

      {canAct && (
        <>
          <Card title="Adjust before approving">
            <form action={`/api/admin/reviews/${row.id}`} method="post" className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="action" value="reprice" />
              <input type="hidden" name="revision" value={row.revision} />
              <label className="grid gap-1 text-xs font-semibold text-secondary">
                Partner
                <select name="partner" defaultValue={inputs.partner} className={`${input} w-44`}>
                  <option>Recommended</option>
                  <option>UniCloud</option>
                  <option>Unitellas</option>
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-secondary">
                Margin on partner cost (%)
                <input name="margin_pct" defaultValue={(inputs.margin * 100).toFixed(2).replace(/\.00$/, "")} inputMode="decimal" className={`${input} w-32`} />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-secondary">
                Your name
                <input name="reviewer" required maxLength={80} className={`${input} w-48`} />
              </label>
              <button className={btnLight}>Re-price</button>
            </form>
          </Card>
          <Card title="Decision">
            <div className="grid gap-4 md:grid-cols-2">
              <form action={`/api/admin/reviews/${row.id}`} method="post" className="grid gap-2 rounded-xl border border-[#9fd5b2] p-4">
                <input type="hidden" name="action" value="approve" />
                <input type="hidden" name="revision" value={row.revision} />
                <p className="text-sm">
                  Approving creates the Zoho Books invoice and emails it to <b>{bill.contactEmail || "(no email)"}</b> straight away.
                </p>
                <input name="reviewer" required maxLength={80} placeholder="Your name" className={input} />
                <input name="note" maxLength={500} placeholder="Note (optional, internal)" className={input} />
                <button className={btn}>Approve and email the client</button>
              </form>
              {row.review_status === "pending_review" && (
                <form action={`/api/admin/reviews/${row.id}`} method="post" className="grid gap-2 rounded-xl border border-[#f1c9b4] p-4">
                  <input type="hidden" name="action" value="reject" />
                  <input type="hidden" name="revision" value={row.revision} />
                  <p className="text-sm">Rejecting sends nothing. The client keeps seeing &ldquo;being reviewed&rdquo;.</p>
                  <input name="reviewer" required maxLength={80} placeholder="Your name" className={input} />
                  <input name="note" required maxLength={500} placeholder="Reason (required, internal)" className={input} />
                  <button className={btnLight}>Reject</button>
                </form>
              )}
            </div>
          </Card>
        </>
      )}

      {row.status === "current" && canResend(row) && (
        <Card title={row.review_status === "sent" ? "Send again" : "Retry sending"}>
          <form action={`/api/admin/reviews/${row.id}`} method="post" className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="action" value="resend" />
            <input name="reviewer" required maxLength={80} placeholder="Your name" className={`${input} w-48`} />
            <button className={btnLight}>{row.review_status === "sent" ? "Email the invoice again" : "Retry: create in Zoho and email"}</button>
          </form>
        </Card>
      )}
    </AdminShell>
  );
}
