import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "Ashoka CS Information Assistant",
  description: "Official-source answers for Ashoka University's Computer Science department.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header><Link href="/">Ashoka CS Assistant</Link><nav aria-label="Primary"><Link href="/status">Status</Link><Link href="/admin">Admin</Link></nav></header><main>{children}</main></body></html>;
}
