import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

const siteUrl = 'https://thewatchercom.vercel.app';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/watchlist', '/settings', '/onboarding', '/player', '/stats', '/ai-search'],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
