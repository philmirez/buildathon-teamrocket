import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const DESCRIPTION =
  "Six AI builds for the DC DevFest 2026 Buildathon. Each runs on your own Gemini key.";

export const metadata = {
  // Required for Next to emit absolute og:image URLs; crawlers reject relative ones.
  metadataBase: new URL("https://buildathon-broccoli.vercel.app"),
  title: {
    default: "Team Rocket · DC DevFest 2026",
    template: "%s · Team Rocket",
  },
  description: DESCRIPTION,
  applicationName: "Team Rocket",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Team Rocket · DC DevFest 2026",
    title: "Team Rocket · DC DevFest 2026",
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: "Team Rocket · DC DevFest 2026",
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
      <body>{children}</body>
    </html>
  );
}
