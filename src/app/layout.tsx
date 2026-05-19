import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "KOBIA.AI",
  description: "Multi-tenant SaaS platform. Phase 1: AI-native accounting.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className="bg-background text-foreground antialiased">{children}</body>
      </html>
    </ClerkProvider>
  );
}
