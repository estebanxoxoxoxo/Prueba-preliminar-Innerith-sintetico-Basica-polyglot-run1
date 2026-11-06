import type { Listing } from "@/lib/models";

export function ListingCard({
  listing,
}: {
  listing: Pick<Listing, "title" | "city" | "nightlyRate" | "currency" | "ratingAvg" | "ratingCount">;
}) {
  return (
    <article>
      <h3>{listing.title}</h3>
      <p>{listing.city}</p>
      <p>
        {listing.nightlyRate.toFixed(2)} {listing.currency} / noche
      </p>
      <p>
        ★ {listing.ratingAvg.toFixed(2)} ({listing.ratingCount})
      </p>
    </article>
  );
}

export default ListingCard;
