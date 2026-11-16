import { loadPaymentDetails } from "@/lib/invoice/payment";
import { isDemo, loadDraft } from "@/lib/requirements/server";
import { checkToken, json } from "@/lib/requirements/http";
import { listInvoices, rowToView } from "@/lib/invoice/service";
import { clientInvoiceState } from "@/lib/invoice/review";
import { loadSettingRows, settingsFromRows } from "@/lib/pricing/data";
import { SUBMITTED_STATUSES } from "@/lib/requirements/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Invoice status for the client (read-only; pricing happens on submit). Prices are returned only for the latest
 * version OPEX approved and emailed. Internal review details (rejections, notes, margins) are never returned.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!checkToken(token)) return json({ success: false, message: "This link is not recognised." }, 404);
  if (isDemo(token)) return json({ success: true, state: "not_submitted", invoice: null, email: "" });
  try {
    const found = await loadDraft(token);
    if (!found) return json({ success: false, message: "This link is not recognised." }, 404);
    const submitted = SUBMITTED_STATUSES.includes(found.p.status);
    const rows = await listInvoices(found.p.id);
    const view = clientInvoiceState(rows, submitted || found.p.status === "edited");
    const email = found.draft.answers.contact.contactEmail?.trim() ?? "";
    if (!view.sent) return json({ success: true, state: view.state, invoice: null, email });
    const settings = settingsFromRows(await loadSettingRows());
    return json({
      success: true,
      state: "sent",
      updatePending: view.updatePending,
      sentAt: view.sent.sent_at,
      sentTo: view.sent.sent_to,
      email,
      invoice: rowToView(view.sent, settings.showPartner, await loadPaymentDetails()),
    });
  } catch (error) {
    console.error("[invoice] load failed", error);
    return json({ success: false, message: "We couldn't load your invoice status just now." }, 500);
  }
}
