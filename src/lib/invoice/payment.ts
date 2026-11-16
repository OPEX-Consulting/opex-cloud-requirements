// Server-only: the bank details clients pay into, edited at /admin/payment (table payment_settings).
import { db, supabaseConfigured } from "../server/db";
import { EMPTY_PAYMENT, type PaymentDetails } from "./payment-shared";

export * from "./payment-shared";

export type PaymentRow = { key: string; value: string; label: string; note: string | null; sort: number; updated_at: string };

export const PAYMENT_KEYS: Record<string, keyof PaymentDetails> = {
  bank_name: "bankName",
  account_name: "accountName",
  account_number: "accountNumber",
  sort_code: "sortCode",
  instructions: "instructions",
};

export async function loadPaymentRows(): Promise<PaymentRow[]> {
  const { data, error } = await db().from("payment_settings").select("*").order("sort");
  if (error) throw new Error(`payment_settings: ${error.message}`);
  return (data ?? []) as PaymentRow[];
}

/** Current payment details. Never throws: on any problem the portal shows "not set" rather than failing the invoice. */
export async function loadPaymentDetails(): Promise<PaymentDetails> {
  if (!supabaseConfigured()) return { ...EMPTY_PAYMENT };
  try {
    const p: PaymentDetails = { ...EMPTY_PAYMENT };
    for (const r of await loadPaymentRows()) {
      const k = PAYMENT_KEYS[r.key];
      if (k) p[k] = String(r.value ?? "").trim();
    }
    return p;
  } catch (e) {
    console.error("[payment] load failed", e);
    return { ...EMPTY_PAYMENT };
  }
}
