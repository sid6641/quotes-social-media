import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Quotes Social Media — Review",
  description: "Review and approve generated quote images for Instagram.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
