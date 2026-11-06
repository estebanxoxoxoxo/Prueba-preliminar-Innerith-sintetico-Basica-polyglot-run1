import { NextResponse } from "next/server";
import "@/lib/notifications";
import { requestBooking } from "@/lib/bookings";

interface RequestBookingBody {
  guestId: string;
  listingId: string;
  checkInIso: string;
  checkOutIso: string;
  guests: number;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as RequestBookingBody;
    const quote = await requestBooking(b.guestId, b.listingId, b.checkInIso, b.checkOutIso, b.guests);
    return NextResponse.json(quote, { status: 201 });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // I2: el solapamiento es un conflicto de recurso, no un input inválido.
    return NextResponse.json({ error }, { status: error.includes("superponen") ? 409 : 400 });
  }
}
