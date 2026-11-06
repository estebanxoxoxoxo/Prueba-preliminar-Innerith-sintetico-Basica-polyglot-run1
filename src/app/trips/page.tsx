import { myBookings } from "@/lib/bookings";
import { getCurrentUser } from "@/lib/session";
import { BookingSummary } from "../components/BookingSummary";
import { SectionTitle } from "../components/SectionTitle";

export const dynamic = "force-dynamic";

export default async function TripsPage() {
  const bookings = await myBookings(getCurrentUser().id);
  return (
    <main>
      <SectionTitle title="Mis viajes" />
      {bookings.map((booking) => (
        <BookingSummary key={booking.id} booking={booking} />
      ))}
    </main>
  );
}
