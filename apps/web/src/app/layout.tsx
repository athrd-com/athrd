import { Footer } from "@/components/home/Footer";
import { Navbar } from "@/components/home/Navbar";
import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ATHRD - Share AI Coding Threads",
  description:
    "Share your AI conversations from VS Code and Claude with teammates. No more screenshots—just share a link.",
  generator: "v0.app",
  icons: {
    icon: [
      {
        url: "/icon-light-32x32.png",
        media: "(prefers-color-scheme: light)",
      },
      {
        url: "/icon-dark-32x32.png",
        media: "(prefers-color-scheme: dark)",
      },
      {
        url: "/icon.svg",
        type: "image/svg+xml",
      },
    ],
    apple: "/apple-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`font-sans antialiased`}>
        <div className="min-h-screen bg-[#050505] text-white font-sans selection:bg-blue-500/30">
          <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-900/20 blur-[120px] rounded-full pointer-events-none z-0" />

          <Navbar />

          <main className="relative z-10 flex flex-col items-center pb-20 px-4 sm:px-6 lg:px-8">
            {children}
          </main>

          <Footer />
        </div>
        <Analytics />
      </body>
    </html>
  );
}
