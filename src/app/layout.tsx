import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DEKRA × Eraneos | SBO Pilot Control Tower",
  description: "Project control, delivery evidence and skill architecture workspace.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
