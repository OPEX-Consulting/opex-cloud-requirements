// Server-only: CC lists managed on /admin/reviews (client invoice emails and the internal review alert).
import { db } from "../server/db";
import { cleanAddress } from "./email";
import { EMAIL } from "./company";
import { CC_KEY, REVIEW_CC_KEY, parseCcList } from "./cc-shared";

async function loadList(key: string): Promise<string[] | null> {
  const { data, error } = await db().from("pricing_settings").select("value").eq("key", key).maybeSingle();
  if (error || !data) return null;
  return Array.isArray(data.value) ? parseCcList((data.value as unknown[]).map(String).join("\n")).valid : null;
}

async function saveList(key: string, list: string[], label: string, sort: number) {
  const { error } = await db()
    .from("pricing_settings")
    .upsert({ key, value: list, label, note: "Managed on the Reviews page", sort, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(`cc save failed: ${error.message}`);
}

/** null = never saved (defaults to OPEX's alert address); [] = saved empty (no CC). */
export const loadSavedCc = () => loadList(CC_KEY);
export async function clientCc(): Promise<string[]> {
  return (await loadSavedCc()) ?? [cleanAddress(EMAIL.alertTo)];
}
export const saveCc = (list: string[]) => saveList(CC_KEY, list, "Client invoice email CC", 999);

/** Extra addresses copied on the "Invoice to review" alert. Never saved = none. */
export const loadSavedReviewCc = () => loadList(REVIEW_CC_KEY);
export async function reviewCc(): Promise<string[]> {
  return (await loadSavedReviewCc()) ?? [];
}
export const saveReviewCc = (list: string[]) => saveList(REVIEW_CC_KEY, list, "Review alert CC", 1000);
