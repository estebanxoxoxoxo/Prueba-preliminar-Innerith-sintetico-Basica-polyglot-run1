import { NextResponse } from "next/server";
import { createListing, searchListings, type CreateListingInput } from "@/lib/listings";

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function optionalNumber(value: string | null): number | undefined {
  if (value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? undefined : n;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { hostId: string; input: CreateListingInput };
    await createListing(body.hostId, body.input);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: message(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const results = await searchListings(params.get("city") ?? "", {
      maxNightly: optionalNumber(params.get("maxNightly")),
      minGuests: optionalNumber(params.get("minGuests")),
    });
    return NextResponse.json(results);
  } catch (e) {
    return NextResponse.json({ error: message(e) }, { status: 400 });
  }
}
