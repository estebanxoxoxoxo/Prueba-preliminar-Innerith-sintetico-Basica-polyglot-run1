import { NextResponse } from "next/server";
import { expirePendingBookings } from "@/lib/bookings";

/**
 * Equivale al @cron("*\/15 * * * *") de la referencia. Estilo Vercel Cron:
 * se agenda en vercel.json ({ path: "/api/cron/expire", schedule: "*\/15 * * * *" })
 * y Vercel lo invoca con GET.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  await expirePendingBookings();
  return NextResponse.json({ ok: true }, { status: 200 });
}
