// TEMPORARY staging-only diagnostic (remove after SMTP is confirmed). Preview deployments only, behind Vercel protection.
import { db } from "@/lib/server/db";
import { smtpHost, smtpReady, smtpTransport } from "@/lib/invoice/email";
import { EMAIL } from "@/lib/invoice/company";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (process.env.VERCEL_ENV !== "preview") return new Response("Not found", { status: 404 });
  const user = process.env.SMTP_USER ?? "";
  const pass = process.env.SMTP_PASS ?? "";
  const out: Record<string, unknown> = {
    host: smtpHost(),
    port: process.env.SMTP_PORT ?? "(unset → 465)",
    secureEnv: process.env.SMTP_SECURE ?? null,
    userDomain: user.includes("@") ? user.split("@")[1] : user ? "(no @)" : "(unset)",
    userLen: user.length,
    passLen: pass.length,
    passHasSpaces: /\s/.test(pass),
    ready: smtpReady(),
    from: EMAIL.from.replace(/<[^@>]+@/, "<…@"),
    alertToDomain: EMAIL.alertTo.split("@")[1],
  };
  const { data } = await db().from("notifications").select("kind, status, error, created_at").order("created_at", { ascending: false }).limit(6);
  out.recent = data;
  if (new URL(req.url).searchParams.get("send") === "1") {
    try {
      const t = smtpTransport();
      await t.verify();
      const info = await t.sendMail({ from: EMAIL.from, to: EMAIL.alertTo, subject: "OPEX Cloud requirements: SMTP test (staging)", text: "Test email from the staging diagnostic. You can delete this." });
      out.send = { ok: true, accepted: info.accepted?.length, rejected: info.rejected?.length, response: info.response };
    } catch (e) {
      out.send = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json(out);
}
