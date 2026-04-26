import type { Metadata } from "next";
import { Lato } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Lato matches insectid.org's typography. We load light/regular/bold so
// headings can use 700 while body uses 400 (and "light" 300 is available if
// we ever want to mirror the parent site's lighter body weight exactly).
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  display: "swap",
  variable: "--font-lato",
});

export const metadata: Metadata = {
  title: "Indiana Insect Biodiversity Dashboard",
  description:
    "Interactive visualization of Indiana insect occurrence records (GBIF Darwin Core).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={lato.variable}>
      <body className="min-h-screen bg-field-paper font-sans text-bark-700 antialiased">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
