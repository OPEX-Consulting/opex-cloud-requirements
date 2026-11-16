"use client";

import { useCallback, useEffect, useState } from "react";
import { FiAlertCircle, FiClock, FiEdit2, FiInfo, FiMail, FiRefreshCw } from "react-icons/fi";
import type { InvoiceView, PortalPayload } from "@/lib/requirements/schema";
import { longDate, naira, qtyFmt } from "@/lib/invoice/view";
import { StepHeader } from "./ui";

type Status = {
  state: "not_submitted" | "in_review" | "sent";
  invoice: InvoiceView | null;
  email?: string;
  sentAt?: string | null;
  sentTo?: string | null;
  updatePending?: boolean;
};

/**
 * Review gate: OPEX reviews every invoice before the client sees a price. This step shows the review status and,
 * once OPEX has approved and emailed the invoice, the approved invoice (read-only). There is no download.
 */
export function InvoiceStep({
  token,
  mode,
  flush,
  onEdit,
  submitted,
  submittedBanner,
}: {
  token: string;
  mode: PortalPayload["mode"];
  /** Saves pending changes; resolves once the server has the latest answers. */
  flush: () => Promise<void>;
  onEdit: (step: number) => void;
  /** The requirements have been submitted (demo: in this browser). */
  submitted: boolean;
  submittedBanner?: React.ReactNode;
}) {
  const [data, setData] = useState<Status | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      if (mode === "demo") {
        setData({ state: submitted ? "in_review" : "not_submitted", invoice: null });
        setState("ready");
        return;
      }
      await flush();
      const res = await fetch(`/api/requirements/${encodeURIComponent(token)}/invoice`, { cache: "no-store" });
      const body = (await res.json()) as Status & { success: boolean; message?: string };
      if (!res.ok || !body.success) throw new Error(body.message || "We couldn't load your invoice status just now.");
      setData(body);
      setState("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "We couldn't load your invoice status just now.");
      setState("error");
    }
  }, [flush, mode, submitted, token]);

  // Fetching the status is synchronising with the server, so loading state is set from the effect on purpose.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    void load();
  }, [load]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const inv = data?.state === "sent" ? data.invoice : null;
  const email = data?.sentTo || data?.email || "";
  const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "");

  return (
    <>
      <StepHeader
        index={6}
        title="Invoice"
        intro="Our team reviews your requirements and prepares your invoice. Once it's approved, we email it to you – it then also appears here."
      />
      {submittedBanner}
      {state === "loading" && (
        <div className="flex items-center gap-2 rounded-2xl border border-border bg-white p-5 text-sm text-secondary">
          <FiRefreshCw aria-hidden className="animate-spin" /> Checking your invoice…
        </div>
      )}
      {state === "error" && (
        <div role="alert" className="rounded-2xl border border-[#f1c9b4] bg-[#fdf6f2] p-5 text-sm text-[#8a3a17]">
          <p className="font-semibold">{message}</p>
          <button type="button" onClick={() => void load()} className="mt-2 text-xs font-semibold underline underline-offset-4">
            Try again
          </button>
        </div>
      )}
      {state === "ready" && data?.state === "not_submitted" && (
        <div className="rounded-2xl border border-dashed border-border-hover bg-white p-5">
          <p className="text-sm font-semibold text-opex-navy">Submit your requirements to receive your invoice</p>
          <p className="mt-1 text-xs leading-5 text-muted">
            Once you submit, our team reviews your requirements and emails your invoice to the contact address you gave in step 1.
          </p>
          <div className="mt-3">
            <button type="button" className="opex-button-secondary" onClick={() => onEdit(5)}>
              <FiEdit2 aria-hidden /> Review and submit
            </button>
          </div>
        </div>
      )}
      {state === "ready" && data?.state === "in_review" && (
        <div className="rounded-2xl border border-border bg-white p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-opex-navy">
            <FiClock aria-hidden /> Your invoice is being reviewed
          </p>
          <p className="mt-1 text-[13px] leading-6 text-secondary">
            Thanks – our team is reviewing your requirements. We&apos;ll email your invoice
            {email ? (
              <>
                {" "}
                to <b>{email}</b>
              </>
            ) : null}{" "}
            as soon as it&apos;s approved, usually within one working day.
          </p>
          <div className="mt-3">
            <button type="button" className="opex-button-secondary" onClick={() => onEdit(0)}>
              <FiEdit2 aria-hidden /> Edit answers
            </button>
          </div>
        </div>
      )}
      {state === "ready" && inv && (
        <div className="grid gap-5">
          <div className="rounded-2xl border border-[#cfe9d7] bg-[#f1faf4] p-4 text-sm text-[#15803d]">
            <p className="flex items-center gap-2 font-semibold">
              <FiMail aria-hidden /> Emailed to {email || "you"}
              {data?.sentAt ? ` on ${fmt(data.sentAt)}` : ""}
            </p>
            {data?.updatePending && (
              <p className="mt-1 text-[13px] text-[#166534]">
                You&apos;ve changed your requirements since. Our team is reviewing an updated invoice and will email it once approved.
              </p>
            )}
          </div>
          <section className="overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_2px_8px_rgb(7_21_47/2%)]">
            <div className="flex flex-col gap-3 bg-opex-navy px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-opex-blue-light">Pro-forma invoice</p>
                <p className="mt-0.5 text-lg font-bold">
                  {inv.status === "preview" ? "Preview" : `${inv.number} · version ${inv.version}`}
                </p>
                {inv.partnerLine && <p className="text-xs text-white/70">{inv.partnerLine}</p>}
              </div>
              <dl className="grid grid-cols-3 gap-4 text-xs sm:text-right">
                <div>
                  <dt className="text-white/60">Date</dt>
                  <dd className="font-semibold">{longDate(inv.createdAt)}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Valid until</dt>
                  <dd className="font-semibold">{longDate(inv.validUntil)}</dd>
                </div>
                <div>
                  <dt className="text-white/60">Term</dt>
                  <dd className="font-semibold">{inv.termMonths <= 1 ? "Monthly" : `${inv.termMonths} months`}</dd>
                </div>
              </dl>
            </div>

            <div className="px-5 pt-4 text-xs text-secondary sm:px-6">
              <span className="font-semibold text-opex-navy">Bill to:</span> {inv.billTo.name || "—"}
              {inv.billTo.contactName ? ` · Attn: ${inv.billTo.contactName}` : ""}
              {inv.billTo.contactEmail ? ` · ${inv.billTo.contactEmail}` : ""}
            </div>

            <div className="overflow-x-auto px-2 py-3 sm:px-4">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted">
                    <th className="px-2 py-2 font-semibold">#</th>
                    <th className="px-2 py-2 font-semibold">Description</th>
                    <th className="px-2 py-2 text-right font-semibold">Qty</th>
                    <th className="px-2 py-2 font-semibold">Unit</th>
                    <th className="px-2 py-2 text-right font-semibold">Unit price</th>
                    <th className="px-2 py-2 text-right font-semibold">Monthly</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.lines.map((l) => (
                    <tr key={l.n} className="border-b border-border/70 align-top">
                      <td className="px-2 py-2 text-muted">{l.n}</td>
                      <td className="px-2 py-2 text-opex-navy">
                        {l.description}
                        {l.assumed && (
                          <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-[#b4532a]">
                            <FiInfo aria-hidden className="h-3 w-3 shrink-0" /> Assumed: {l.assumed}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{qtyFmt(l.qty)}</td>
                      <td className="px-2 py-2 text-xs text-muted">{l.unit}</td>
                      {l.toBeQuoted ? (
                        <td colSpan={2} className="px-2 py-2 text-right text-xs font-semibold text-[#b4532a]">
                          To be quoted
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-2 text-right tabular-nums">{naira(l.unitPrice ?? 0)}</td>
                          <td className="px-2 py-2 text-right font-semibold tabular-nums text-opex-navy">{naira(l.monthly ?? 0)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-4 border-t border-border px-5 py-4 sm:grid-cols-[1fr_320px] sm:px-6">
              <div className="text-xs leading-5 text-muted">
                {inv.tbqCount > 0 && (
                  <p className="flex gap-1.5 text-[#b4532a]">
                    <FiAlertCircle aria-hidden className="mt-0.5 shrink-0" /> {inv.tbqCount} line{inv.tbqCount === 1 ? " is" : "s are"} ‘To be
                    quoted’ and not included in the totals.
                  </p>
                )}
                {inv.assumedCount > 0 && (
                  <p className="mt-1 flex gap-1.5 text-[#b4532a]">
                    <FiInfo aria-hidden className="mt-0.5 shrink-0" /> {inv.assumedCount} line{inv.assumedCount === 1 ? " is" : "s are"} priced on
                    assumed values. Answer the ‘Not sure’ questions to firm them up.
                  </p>
                )}
              </div>
              <dl className="grid gap-1.5 text-[13px]">
                <div className="flex justify-between text-secondary">
                  <dt>Monthly subtotal</dt>
                  <dd className="tabular-nums">{naira(inv.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-secondary">
                  <dt>VAT ({(inv.vatRate * 100).toFixed(1)}%)</dt>
                  <dd className="tabular-nums">{naira(inv.vat)}</dd>
                </div>
                <div className="flex justify-between font-bold text-opex-navy">
                  <dt>Monthly total</dt>
                  <dd className="tabular-nums">{naira(inv.monthlyTotal)}</dd>
                </div>
                {inv.termTotal != null && (
                  <div className="flex justify-between font-bold text-opex-navy">
                    <dt>Total for {inv.termMonths} months</dt>
                    <dd className="tabular-nums">{naira(inv.termTotal)}</dd>
                  </div>
                )}
                <div className="mt-1 flex items-center justify-between rounded-xl bg-opex-navy px-3 py-2.5 text-white">
                  <dt className="text-xs font-semibold">{inv.amountDueLabel}</dt>
                  <dd className="text-base font-bold tabular-nums">{naira(inv.amountDueNow)}</dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-[18px] border border-border bg-white p-5">
              <h3 className="text-[15px] font-semibold text-opex-navy">Payment details</h3>
              {inv.payment.configured ? (
                <>
                  <dl className="mt-3 grid gap-1.5 text-[13px]">
                    {(
                      [
                        ["Bank", inv.payment.bankName],
                        ["Account name", inv.payment.accountName],
                        ["Account number", inv.payment.accountNumber],
                        ["Sort code", inv.payment.sortCode],
                        ["Reference", inv.status === "preview" ? "Your invoice number" : inv.payment.reference],
                      ] as const
                    )
                      .filter(([, v]) => v)
                      .map(([k, v]) => (
                        <div key={k} className="grid grid-cols-[120px_1fr] gap-2">
                          <dt className="text-muted">{k}</dt>
                          <dd className="font-semibold text-opex-navy">{v}</dd>
                        </div>
                      ))}
                  </dl>
                  <p className="mt-3 text-xs leading-5 text-muted">{inv.payment.instructions}</p>
                </>
              ) : (
                <p className="mt-3 text-[13px] leading-6 text-secondary">Bank details will be sent with your final invoice.</p>
              )}
            </section>
            <section className="rounded-[18px] border border-border bg-white p-5">
              <h3 className="text-[15px] font-semibold text-opex-navy">Terms and notes</h3>
              <ul className="mt-3 grid list-disc gap-1.5 pl-4 text-xs leading-5 text-secondary">
                {inv.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <p className="text-xs leading-5 text-muted">This is the invoice we emailed you. Changing your answers sends an updated invoice for review.</p>
            <button type="button" onClick={() => onEdit(0)} className="opex-button-secondary">
              <FiEdit2 aria-hidden /> Edit answers
            </button>
          </div>
        </div>
      )}
    </>
  );
}
