import { audit } from "@/lib/admin/auth";
import { back, guard, str } from "@/lib/admin/http";
import { db } from "@/lib/server/db";
import { loadPaymentRows } from "@/lib/invoice/payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Update the bank details clients pay into. Each changed key is audited. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const rows = await loadPaymentRows();
  const next: Record<string, string> = {};
  for (const r of rows) next[r.key] = form.has(r.key) ? str(form.get(r.key)).replace(/\s+/g, " ") : r.value;
  next.account_number = (next.account_number ?? "").replace(/\s/g, "");

  if (next.account_number && !/^\d{10}$/.test(next.account_number))
    return back(req, "/admin/payment", { err: "Account number: enter the 10-digit NUBAN." });
  const core = [next.bank_name, next.account_name, next.account_number].filter(Boolean).length;
  if (core > 0 && core < 3) return back(req, "/admin/payment", { err: "Fill in bank name, account name and account number together (or clear all three)." });
  for (const [k, val] of Object.entries(next))
    if (val.length > (k === "instructions" ? 500 : 120)) return back(req, "/admin/payment", { err: "One of the values is too long." });

  let changed = 0;
  for (const r of rows) {
    const value = next[r.key] ?? "";
    if (value === r.value) continue;
    const { error } = await db().from("payment_settings").update({ value, updated_at: new Date().toISOString() }).eq("key", r.key);
    if (error) return back(req, "/admin/payment", { err: error.message });
    await audit("payment_settings", r.key, "update", r.value, value);
    changed++;
  }
  return back(req, "/admin/payment", { ok: changed ? `Saved ${changed} field(s).` : "No changes." });
}
