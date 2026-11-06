import type { Booking } from "@/lib/models";

function day(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function BookingSummary({ booking }: { booking: Booking }) {
  return (
    <article>
      <p>
        {day(booking.checkIn)} → {day(booking.checkOut)}
      </p>
      <p>{booking.nights} noches</p>
      <p>
        {booking.total.toFixed(2)} {booking.currency}
      </p>
      <p>{booking.status}</p>
    </article>
  );
}

export default BookingSummary;
