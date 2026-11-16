// Server-only: produce the PDF the client receives for an approved version.
// Zoho Books first (create or reuse the open invoice in this deployment's org, void the unpaid previous version),
// falling back to the portal PDF on any Zoho problem. Never throws for Zoho errors; they are recorded on the row.
import { db } from "../server/db";
import { loadSettingRows, settingsFromRows } from "../pricing/data";
import { getConnection } from "../zoho/client";
import { fetchZohoPdf, saveZohoFields, syncInvoiceToZoho, type ZohoInvoiceRow } from "../zoho/books";
import { renderInvoicePdf } from "./pdf";
import { loadPaymentDetails } from "./payment";
import { rowToView, type InvoiceRow } from "./service";

export type IssuedPdf = {
  pdf: Uint8Array;
  filename: string;
  source: "zoho" | "portal";
  zohoNumber?: string;
  zohoTotal: number | null;
  /** 'created' | 'reused' | 'not connected' | 'failed: msg' */
  zohoStatus: string;
  warning?: string;
};

/** Previous version that went to the client (the one a new Zoho invoice replaces). */
async function previousSent(row: InvoiceRow): Promise<ZohoInvoiceRow | null> {
  const { data } = await db()
    .from("invoices")
    .select("*")
    .eq("project_id", row.project_id)
    .lt("version", row.version)
    .not("zoho_invoice_id", "is", null)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ZohoInvoiceRow | null) ?? null;
}

export async function issuedPdf(row: InvoiceRow, projectName: string): Promise<IssuedPdf> {
  const inv = row as ZohoInvoiceRow;
  let pdf: Uint8Array | null = null;
  let filename = `${inv.number}-v${inv.version}.pdf`;
  let zohoNumber: string | undefined;
  let zohoTotal: number | null = inv.zoho_total != null ? Number(inv.zoho_total) : null;
  let zohoStatus = "not connected";
  let warning: string | undefined;
  try {
    const conn = await getConnection();
    if (conn?.org_id && conn.refresh_token) {
      try {
        // Reuse only an invoice created in this deployment's organisation (preview and production share the table).
        const sameOrg = inv.zoho_org_id === conn.org_id;
        let id = sameOrg ? (inv.zoho_invoice_id ?? null) : null;
        let number = sameOrg ? (inv.zoho_invoice_number ?? null) : null;
        if (id) {
          zohoStatus = "reused";
        } else {
          const prev = await previousSent(inv);
          const r = await syncInvoiceToZoho(inv, prev, { conn });
          const now = new Date().toISOString();
          id = r.zoho_invoice_id;
          number = r.zoho_invoice_number;
          zohoTotal = r.zoho_total;
          await saveZohoFields(inv.id, {
            zoho_invoice_id: r.zoho_invoice_id,
            zoho_org_id: conn.org_id,
            zoho_voided_at: null,
            zoho_invoice_number: r.zoho_invoice_number,
            zoho_total: r.zoho_total,
            zoho_status: r.zoho_status,
            zoho_synced_at: now,
            zoho_sync_error: null,
          });
          if (prev && r.voidedPrev) await saveZohoFields(prev.id, { zoho_voided_at: now, zoho_status: "void" });
          if (prev && r.voidSkipped) await saveZohoFields(prev.id, { zoho_sync_error: r.voidSkipped.slice(0, 500) });
          warning = r.warning ?? undefined;
          zohoStatus = "created";
        }
        zohoNumber = number ?? undefined;
        pdf = await fetchZohoPdf(id, fetch, { conn });
        filename = `${number || id}.pdf`;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[invoice] zoho failed", e);
        zohoStatus = `failed: ${msg}`;
        pdf = null;
        filename = `${inv.number}-v${inv.version}.pdf`;
        try {
          await saveZohoFields(inv.id, { zoho_sync_error: msg.slice(0, 500) });
        } catch {
          /* ignore */
        }
      }
    }
  } catch (e) {
    console.error("[invoice] zoho connection lookup failed", e);
  }

  if (pdf) return { pdf, filename, source: "zoho", zohoNumber, zohoTotal, zohoStatus, warning };
  const settings = settingsFromRows(await loadSettingRows());
  const portal = await renderInvoicePdf(rowToView(row, settings.showPartner, await loadPaymentDetails()), { projectName });
  return { pdf: portal, filename, source: "portal", zohoNumber, zohoTotal: null, zohoStatus, warning };
}
