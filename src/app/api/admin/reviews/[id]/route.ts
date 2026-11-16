import { back, guard, numOrNull, str } from "@/lib/admin/http";
import { approveInvoice, rejectInvoice, repriceInvoice, resendInvoice } from "@/lib/invoice/approve";
import type { PartnerChoice } from "@/lib/pricing/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Approval creates the Zoho invoice and sends the email in this request. */
export const maxDuration = 60;

const PARTNERS: PartnerChoice[] = ["Recommended", "UniCloud", "Unitellas"];

/** Review actions: approve | reject | reprice | resend. Form posts; redirects back with a message. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const page = `/admin/reviews/${id}`;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return back(req, "/admin/reviews", { err: "Invoice not found." });
  const form = await req.formData();
  const action = str(form.get("action"));
  const reviewer = str(form.get("reviewer")).slice(0, 80);
  const note = str(form.get("note")).slice(0, 500);
  const revision = Number(str(form.get("revision")));
  if (!reviewer) return back(req, page, { err: "Enter your name: approvals and changes are recorded against it." });

  try {
    let r;
    if (action === "approve") r = await approveInvoice(id, revision, reviewer, note);
    else if (action === "reject") r = await rejectInvoice(id, revision, reviewer, note);
    else if (action === "resend") r = await resendInvoice(id, reviewer);
    else if (action === "reprice") {
      const partner = str(form.get("partner")) as PartnerChoice;
      if (!PARTNERS.includes(partner)) return back(req, page, { err: "Choose a partner." });
      const pct = numOrNull(form.get("margin_pct")?.toString().replace("%", "") ?? null);
      if (pct == null || !Number.isFinite(pct) || pct < 0 || pct > 500) return back(req, page, { err: "Margin: enter a percentage, e.g. 20." });
      r = await repriceInvoice(id, revision, reviewer, { partner, margin: Math.round(pct * 100) / 10000 });
    } else return back(req, page, { err: "Unknown action." });
    return back(req, page, r.ok ? { ok: r.message } : { err: r.message });
  } catch (e) {
    console.error("[review] action failed", e);
    return back(req, page, { err: e instanceof Error ? e.message : "Something went wrong." });
  }
}
