import type { Metadata } from "next";
import { ModeSwitcher } from "@/shared/components/mode-switcher";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "neuxus",
  description: "Next.js client for neuxus",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ModeSwitcher />
          {children}
        </Providers>
      </body>
    </html>
  );
}
