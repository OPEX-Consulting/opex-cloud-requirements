// Server-only: the CC list for invoices emailed to clients (managed on /admin/reviews).
import { db } from "../server/db";
import { cleanAddress } from "./email";
import { EMAIL } from "./company";
import { CC_KEY, parseCcList } from "./cc-shared";

/** null = never saved (defaults to OPEX's alert address); [] = saved empty (no CC). */
export async function loadSavedCc(): Promise<string[] | null> {
  const { data, error } = await db().from("pricing_settings").select("value").eq("key", CC_KEY).maybeSingle();
  if (error || !data) return null;
  return Array.isArray(data.value) ? parseCcList((data.value as unknown[]).map(String).join("\n")).valid : null;
}

export async function clientCc(): Promise<string[]> {
  return (await loadSavedCc()) ?? [cleanAddress(EMAIL.alertTo)];
}

export async function saveCc(list: string[]) {
  const { error } = await db()
    .from("pricing_settings")
    .upsert(
      { key: CC_KEY, value: list, label: "Client invoice email CC", note: "Managed on the Reviews page", sort: 999, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(`cc save failed: ${error.message}`);
}
