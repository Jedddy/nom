import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { RootProvider } from "fumadocs-ui/provider/next";
import { siteDescription, siteName, siteUrl } from "@/lib/metadata";
import { ogAlt, ogSize } from "@/components/og-card";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Turns every relative URL below — and every `alternates.canonical` a page sets — into
  // an absolute one. Without it Next.js emits relative canonical and Open Graph URLs,
  // which crawlers and link unfurlers both refuse to resolve.
  metadataBase: new URL(siteUrl),

  title: {
    default: `${siteName} — connect AI tool calls to React component props`,
    // Docs pages set a bare title ("Concepts"); the template gives each one the brand
    // suffix without repeating it in nine frontmatter blocks.
    template: `%s — ${siteName}`,
  },
  description: siteDescription,

  applicationName: siteName,
  authors: [{ name: "Jedddy", url: "https://github.com/Jedddy" }],
  creator: "Jedddy",
  publisher: "Jedddy",
  keywords: [
    "nom",
    "@nom-ai/sdk",
    "generative UI",
    "AI tool calls",
    "React components",
    "AI SDK",
    "LLM tool calling",
    "agent UI",
    "TypeScript",
    "Zod schema validation",
  ],
  category: "technology",

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Lets Google show full-size image previews and untruncated text snippets, which
      // is what surfaces documentation in rich results and AI overviews.
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },

  openGraph: {
    type: "website",
    siteName,
    locale: "en_US",
    url: "/",
    title: `${siteName} — connect AI tool calls to React component props`,
    description: siteDescription,
    // Written by scripts/generate-og-image.tsx at build time. Declared here rather than
    // as an app/opengraph-image route because that route lands in a static export as an
    // extensionless file, which servers hand back as application/octet-stream and every
    // link unfurler then ignores.
    images: [{ url: "/og.png", ...ogSize, alt: ogAlt, type: "image/png" }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} — connect AI tool calls to React component props`,
    description: siteDescription,
    images: [{ url: "/og.png", alt: ogAlt }],
  },

  // Phone numbers do not appear on this site; the heuristic only ever mangles version
  // strings and numeric identifiers in code samples.
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* Search is off: it needs a server route the static export cannot emit. */}
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
