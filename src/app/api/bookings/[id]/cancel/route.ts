import { NextResponse } from "next/server";
import "@/lib/notifications";
import { cancelBooking } from "@/lib/bookings";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { guestId } = (await req.json()) as { guestId: string };
    const result = await cancelBooking(guestId, id);
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
