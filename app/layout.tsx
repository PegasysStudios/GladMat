import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { DialogProvider } from "@/components/ui/dialog";
import "./globals.css";

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const metadata: Metadata = {
  title: "GladMat",
  description: "Turn one campaign asset into every ad size you need.",
  icons: { icon: "/favicon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={geist.variable}>
        <DialogProvider>{children}</DialogProvider>
      </body>
    </html>
  );
}
