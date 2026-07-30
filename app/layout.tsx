import type { Metadata } from "next";
import { Inter, Source_Serif_4, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-source-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Chatbot Laporan RCI Tabung Haji";
const description =
  "Unofficial chatbot for the Malaysian Royal Commission of Inquiry report on Lembaga Tabung Haji (2014-2020).";

export const metadata: Metadata = {
  metadataBase: new URL("https://rcitabunghaji.my"),
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://rcitabunghaji.my",
    siteName: title,
    images: [
      {
        url: "/banner.png",
        width: 1731,
        height: 909,
      },
    ],
    locale: "ms_MY",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/banner.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ms"
      className={`${inter.variable} ${sourceSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
