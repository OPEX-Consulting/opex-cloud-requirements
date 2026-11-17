import { audit } from "@/lib/admin/auth";
import { back, guard, str } from "@/lib/admin/http";
import { loadSavedReviewCc, saveReviewCc } from "@/lib/invoice/cc";
import { CC_MAX, REVIEW_CC_KEY, parseCcList } from "@/lib/invoice/cc-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Save the CC list for the internal "Invoice to review" alert. Audited. */
export async function POST(req: Request) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const { valid, invalid } = parseCcList(str(form.get("cc")));
  if (invalid.length) return back(req, "/admin/reviews", { err: `Not a valid email address: ${invalid.slice(0, 5).join(", ")}. Nothing saved.` });
  if (valid.length > CC_MAX) return back(req, "/admin/reviews", { err: `Up to ${CC_MAX} addresses. Nothing saved.` });
  try {
    const before = await loadSavedReviewCc();
    await saveReviewCc(valid);
    await audit("pricing_settings", REVIEW_CC_KEY, before ? "update" : "insert", before, valid);
    return back(req, "/admin/reviews", { ok: valid.length ? `Review alerts will be copied to ${valid.length} address${valid.length === 1 ? "" : "es"}.` : "Saved: review alerts go to the main address only." });
  } catch (e) {
    return back(req, "/admin/reviews", { err: e instanceof Error ? e.message : "Couldn't save." });
  }
}
