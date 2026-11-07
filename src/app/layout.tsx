import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navigation from "@/components/Navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/context/AuthContext";
import StartupLoader from "@/components/StartupLoader";
import { Analytics } from "@vercel/analytics/next"

const websiteStructuredData = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "Watcher",
  alternateName: "Watcher Movie & TV Watchlist",
  url: "https://thewatchercom.vercel.app/",
};

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
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html:not([data-watcher-styles-ready]) body { background: #0c0c0e !important; }
              html:not([data-watcher-styles-ready]) .layout-container { visibility: hidden !important; }
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                var root = document.documentElement;
                var startedAt = Date.now();
                var probe = document.createElement('div');
                probe.className = 'min-h-screen text-3xl';
                probe.style.cssText = 'position:fixed;top:-10000px;visibility:hidden;pointer-events:none';
                document.body.appendChild(probe);

                function revealWhenStyled() {
                  var links = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                  var stylesheetsLoaded = links.length > 0 && links.every(function (link) {
                    return Boolean(link.sheet);
                  });
                  var utilitiesLoaded = getComputedStyle(probe).minHeight !== '0px' &&
                    getComputedStyle(probe).fontSize !== '16px';
                  var sidebar = document.querySelector('.desktop-sidebar');
                  var navigationStyled = sidebar && getComputedStyle(sidebar).position === 'fixed';
                  var globalStylesLoaded = getComputedStyle(document.body).getPropertyValue('--bg-color').trim();

                  if ((stylesheetsLoaded && utilitiesLoaded && navigationStyled && globalStylesLoaded) ||
                    Date.now() - startedAt > 2500) {
                    root.setAttribute('data-watcher-styles-ready', 'true');
                    probe.remove();
                    return;
                  }

                  window.setTimeout(revealWhenStyled, 20);
                }

                revealWhenStyled();
              })();
            `,
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteStructuredData).replace(/</g, "\\u003c"),
          }}
        />
        <ThemeProvider>
          <AuthProvider>
            <StartupLoader />
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
