/* Client invoice email CC list: pure helpers (safe for tests and client code). */
import { isEmail } from "../requirements/logic";

/** Stored as a row in pricing_settings (jsonb array of addresses); hidden from the pricing settings page. */
export const CC_KEY = "client_email_cc";
export const CC_MAX = 20;

/** Split on commas, semicolons, spaces or new lines; lower-case; de-duplicate; keep order. */
export function parseCcList(text: string): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of text.split(/[\s,;]+/)) {
    const v = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    (isEmail(v) ? valid : invalid).push(v);
  }
  return { valid, invalid };
}
