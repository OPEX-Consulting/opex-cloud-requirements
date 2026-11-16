import { audit } from "@/lib/admin/auth";
import { back, guard, str } from "@/lib/admin/http";
import { loadSavedCc, saveCc } from "@/lib/invoice/cc";
import { CC_MAX, parseCcList } from "@/lib/invoice/cc-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save the CC list for invoices emailed to clients. Audited. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const { valid, invalid } = parseCcList(str(form.get("cc")));
  if (invalid.length) return back(req, "/admin/reviews", { err: `Not a valid email address: ${invalid.slice(0, 5).join(", ")}. Nothing saved.` });
  if (valid.length > CC_MAX) return back(req, "/admin/reviews", { err: `Up to ${CC_MAX} addresses. Nothing saved.` });
  try {
    const before = await loadSavedCc();
    await saveCc(valid);
    await audit("pricing_settings", "client_email_cc", before ? "update" : "insert", before, valid);
    return back(req, "/admin/reviews", { ok: valid.length ? `Client invoices will be copied to ${valid.length} address${valid.length === 1 ? "" : "es"}.` : "Saved: client invoices will be sent with no copy." });
  } catch (e) {
    return back(req, "/admin/reviews", { err: e instanceof Error ? e.message : "Couldn't save." });
  }
}
