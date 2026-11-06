import "@/lib/notifications";
import { getFeaturedListings } from "@/lib/listings";
import { ListingCard } from "./components/ListingCard";
import { SectionTitle } from "./components/SectionTitle";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const listings = await getFeaturedListings("Buenos Aires", 10);
  return (
    <main>
      <SectionTitle title="Destacados en Buenos Aires" />
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </main>
  );
}
