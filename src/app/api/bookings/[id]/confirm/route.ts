import { NextResponse } from "next/server";
import "@/lib/notifications";
import { confirmBooking } from "@/lib/bookings";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    await confirmBooking(id);
    return new Response(null, { status: 204 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
