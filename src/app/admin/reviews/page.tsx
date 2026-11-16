import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import { db } from "@/lib/server/db";
import { REVIEW_LABELS, type ReviewStatus } from "@/lib/invoice/review";
import { clientCc } from "@/lib/invoice/cc";
import { CC_MAX } from "@/lib/invoice/cc-shared";
import { AdminShell, Card, Flash, btn, input, ngn, when, type SP } from "../_ui";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  number: string;
  version: number;
  review_status: ReviewStatus;
  monthly_total: number;
  chosen_partner: string;
  comparison: { marginNgn?: number; marginPctOfPrice?: number } | null;
  created_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  projects: { customer_name: string | null; project_name: string | null; status: string } | null;
};

const COLS = "id, number, version, review_status, monthly_total, chosen_partner, comparison, created_at, reviewed_by, reviewed_at, sent_at, projects(customer_name, project_name, status)";

function Table({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-3">Client</th>
            <th className="py-2 pr-3">Invoice</th>
            <th className="py-2 pr-3">Status</th>
            <th className="py-2 pr-3 text-right">Monthly incl. VAT</th>
            <th className="py-2 pr-3">Partner</th>
            <th className="py-2 pr-3 text-right">Profit / month</th>
            <th className="py-2 pr-3">Priced</th>
            <th className="py-2 pr-3">Decision</th>
            <th className="py-2 pr-3"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[#eef1f5]">
              <td className="py-2 pr-3">
                <b>{r.projects?.customer_name || "—"}</b>
                <div className="text-xs text-muted">{r.projects?.project_name}</div>
              </td>
              <td className="py-2 pr-3 font-semibold">
                {r.number} v{r.version}
              </td>
              <td className="py-2 pr-3">{REVIEW_LABELS[r.review_status]}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{ngn(r.monthly_total)}</td>
              <td className="py-2 pr-3">{r.chosen_partner}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {ngn(r.comparison?.marginNgn)} <span className="text-xs text-muted">({((r.comparison?.marginPctOfPrice ?? 0) * 100).toFixed(1)}%)</span>
              </td>
              <td className="py-2 pr-3 text-xs">{when(r.created_at)}</td>
              <td className="py-2 pr-3 text-xs">{r.reviewed_by ? `${r.reviewed_by}, ${when(r.reviewed_at)}` : "—"}</td>
              <td className="py-2 pr-3">
                <Link href={`/admin/reviews/${r.id}`} className="font-semibold text-opex-blue hover:underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function Reviews({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const [{ data: open }, { data: done }, cc] = await Promise.all([
    db().from("invoices").select(COLS).eq("status", "current").in("review_status", ["pending_review", "approved", "send_failed", "rejected"]).order("created_at"),
    db().from("invoices").select(COLS).eq("review_status", "sent").order("sent_at", { ascending: false }).limit(20),
    clientCc(),
  ]);
  const rows = (open ?? []) as unknown as Row[];
  const waiting = rows.filter((r) => r.review_status !== "rejected");
  const rejected = rows.filter((r) => r.review_status === "rejected");
  return (
    <AdminShell active="reviews">
      <Flash searchParams={searchParams} />
      <p className="mb-5 text-sm text-secondary">
        Clients never see a price until an invoice is approved here. Approving creates the Zoho Books invoice and emails it to the client, copied to the addresses below.
      </p>
      <Card title="Copy on client invoice emails">
        <form action="/api/admin/client-cc" method="post" className="grid gap-2">
          <p className="text-sm text-secondary">
            Every invoice emailed to a client is copied (CC) to these addresses. One per line, up to {CC_MAX}. Leave empty to send no copy.
          </p>
          <textarea name="cc" rows={Math.min(8, Math.max(3, cc.length + 1))} defaultValue={cc.join("\n")} className={`${input} h-auto py-2 font-mono`} aria-label="CC addresses" />
          <div>
            <button className={btn}>Save copy list</button>
          </div>
        </form>
      </Card>
      <Card title={`Waiting for review (${waiting.length})`}>
        <Table rows={waiting} empty="Nothing to review." />
      </Card>
      <Card title={`Rejected (${rejected.length})`}>
        <Table rows={rejected} empty="None." />
      </Card>
      <Card title="Recently sent">
        <Table rows={(done ?? []) as unknown as Row[]} empty="No invoices sent yet." />
      </Card>
    </AdminShell>
  );
}
