import { Analytics } from "@vercel/analytics/next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const DESCRIPTION =
  "Six AI builds, every one drivable by an agent through WebMCP. Bring your own Gemini key, watch the agent work on the same screen you do, and copy the pattern.";

export const metadata = {
  // Required for Next to emit absolute og:image URLs; crawlers reject relative ones.
  metadataBase: new URL("https://www.teamrocket.website"),
  title: {
    default: "Team Rocket Command Center",
    template: "%s · Team Rocket",
  },
  description: DESCRIPTION,
  applicationName: "Team Rocket",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Team Rocket Command Center",
    title: "Team Rocket Command Center",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Team Rocket Command Center",
    description: DESCRIPTION,
  },
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#0E0E0E" },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
