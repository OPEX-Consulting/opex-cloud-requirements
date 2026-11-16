import { requireAdmin } from "@/lib/admin/auth";
import { loadPaymentRows } from "@/lib/invoice/payment";
import { AdminShell, Card, Flash, btn, input, when, type SP } from "../_ui";

export const dynamic = "force-dynamic";

export default async function Payment({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  let rows: Awaited<ReturnType<typeof loadPaymentRows>> = [];
  let loadError = "";
  try {
    rows = await loadPaymentRows();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }
  if (loadError || !rows.length)
    return (
      <AdminShell active="payment">
        <Card title="Bank account">
          <p className="text-sm text-[#7a3412]">
            Payment settings aren&apos;t available yet: apply supabase/migrations/0005_payment_details.sql to the database. {loadError && `(${loadError})`}
          </p>
        </Card>
      </AdminShell>
    );
  const last = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);
  const v = (k: string) => rows.find((r) => r.key === k)?.value ?? "";
  const set = Boolean(v("bank_name") && v("account_name") && v("account_number"));

  return (
    <AdminShell active="payment">
      <Flash searchParams={searchParams} />
      <p className="mb-5 text-sm text-secondary">
        The account clients pay into. Shown on the portal&apos;s Invoice step and on the portal PDF (served when Zoho Books isn&apos;t connected, and from
        admin downloads). Zoho Books invoices use the bank details set in Zoho itself, so keep the two the same. Changes apply to every invoice
        immediately and are audited.
      </p>
      <Card title="Bank account">
        {!set && (
          <p className="mb-4 rounded-lg bg-[#fdf1ec] px-3 py-2 text-sm text-[#7a3412]">
            Not set yet. Clients currently see &ldquo;Bank details will be sent with your final invoice.&rdquo;
          </p>
        )}
        <form action="/api/admin/payment" method="post" className="grid max-w-2xl gap-3">
          {rows.map((r) => (
            <label key={r.key} className="grid gap-1 text-xs font-semibold text-secondary">
              {r.label}
              {r.key === "instructions" ? (
                <textarea name={r.key} defaultValue={r.value} rows={3} maxLength={500} className={`${input} h-auto py-2`} />
              ) : (
                <input
                  name={r.key}
                  defaultValue={r.value}
                  maxLength={r.key === "account_number" ? 10 : 120}
                  inputMode={r.key === "account_number" ? "numeric" : undefined}
                  pattern={r.key === "account_number" ? "\\d{10}" : undefined}
                  className={input}
                />
              )}
              {r.note && <span className="font-normal text-muted">{r.note}</span>}
            </label>
          ))}
          <div className="flex items-center gap-3">
            <button className={btn}>Save payment details</button>
            {last && <span className="text-xs text-muted">Last changed {when(last)}</span>}
          </div>
        </form>
      </Card>
    </AdminShell>
  );
}
