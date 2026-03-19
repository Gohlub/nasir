import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nasir AuctionHouse",
  description: "Reserve-backed auction bidding over Tempo session payment authentication."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}

