import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/context/AuthContext";
import { Analytics } from "@vercel/analytics/next"

export const metadata: Metadata = {
  metadataBase: new URL('https://thewatchercom.vercel.app'),
  title: {
    default: 'Watcher | Movie & TV Watchlist',
    template: '%s | Watcher',
  },
  applicationName: 'Watcher',
  description: 'Discover movies and TV shows, organize your watchlist, track what you have watched, and keep your library synced across devices.',
  keywords: ['movie watchlist', 'TV show tracker', 'movie tracker', 'watch history', 'film discovery', 'Watcher'],
  alternates: { canonical: '/' },
  verification: { google: 'srFm6VqYG73tiI0fCxezBUf4z6mu1Ld7xjgo05SbeQo' },
  openGraph: {
    type: 'website',
    locale: 'en_IN',
    url: '/',
    siteName: 'Watcher',
    title: 'Watcher | Movie & TV Watchlist',
    description: 'Discover movies and TV shows, organize your watchlist, and keep your library synced across devices.',
    images: [{ url: '/watcher-logo.png', width: 512, height: 512, alt: 'The Watcher logo' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Watcher | Movie & TV Watchlist',
    description: 'Discover movies and TV shows, organize your watchlist, and keep your library synced across devices.',
    images: ['/watcher-logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1, 'max-video-preview': -1 },
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <div className="layout-container">
              <Navigation />
              <main className="main-content">
                {children}
              </main>
            </div>
            <Analytics />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
