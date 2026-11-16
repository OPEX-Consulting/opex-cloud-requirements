import { checkToken, json } from "@/lib/requirements/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Review gate: clients can no longer download invoices. OPEX reviews each invoice and, once approved, it is
 * emailed to the client automatically. Kept as a route so old links get a clear answer instead of a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!checkToken(token)) return json({ success: false, message: "This link is not recognised." }, 404);
  return json({ success: false, message: "Invoices are reviewed by OPEX and emailed to you once approved." }, 410);
}
