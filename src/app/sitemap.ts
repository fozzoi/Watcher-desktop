import type { MetadataRoute } from 'next';

const siteUrl = 'https://thewatchercom.vercel.app';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
