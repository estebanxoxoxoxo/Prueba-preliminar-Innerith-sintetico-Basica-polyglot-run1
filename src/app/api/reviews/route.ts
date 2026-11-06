import { NextResponse } from "next/server";
import { addReview } from "@/lib/reviews";

interface AddReviewBody {
  guestId: string;
  bookingId: string;
  rating: number;
  comment: string;
}

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as AddReviewBody;
    await addReview(b.guestId, b.bookingId, b.rating, b.comment);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 400 },
    );
  }
}
