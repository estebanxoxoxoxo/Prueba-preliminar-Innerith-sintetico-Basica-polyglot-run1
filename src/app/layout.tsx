import type { ReactNode } from "react";

export const metadata = { title: "StayHub" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
