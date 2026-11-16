import { checkToken, json } from "@/lib/requirements/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Review gate: unapproved prices are never shown to clients (demo links included), so live previews are off. */
export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!checkToken(token)) return json({ success: false, message: "This link is not recognised." }, 404);
  return json({ success: false, message: "Invoices are reviewed by OPEX and emailed to you once approved." }, 410);
}
