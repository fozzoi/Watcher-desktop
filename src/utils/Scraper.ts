// src/utils/Scraper.ts
import axios from 'axios';

const BASE_URL = 'https://watcher-api-rho.vercel.app';

export interface TorrentResult {
  id: string | number;
  name: string;
  size: string;
  source: string;
  url: string; 
  seeds: number;
  peers: number;
}

const cleanQuery = (q: string) => q.replace(/[()\[\]]/g, '').replace(/\s+/g, ' ').trim();

export const searchTorrents = async (query: string): Promise<TorrentResult[]> => {
  console.log(`📡 Launching Hybrid Search System for: ${query}`);
  
  const cleaned = cleanQuery(query);
  let aggregatedResults: TorrentResult[] = [];

  // 1. Direct Local Fetch: The Pirate Bay (via ApiBay)
  const fetchLocalTPB = async () => {
    try {
      const res = await axios.get(`https://apibay.org/q.php`, { 
        params: { q: cleaned }, 
        timeout: 6000 
      });
      
      if (res.data && Array.isArray(res.data) && res.data[0]?.id !== "0") {
        res.data.forEach((t: any) => {
          if (t.id !== "0") {
            const bytes = parseInt(t.size) || 0;
            const sizeGB = bytes > 0 ? `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB` : 'Unknown';
            aggregatedResults.push({
              id: `tpb-${t.id}`,
              name: t.name,
              size: sizeGB,
              source: 'ThePirateBay',
              url: `magnet:?xt=urn:btih:${t.info_hash}&dn=${encodeURIComponent(t.name)}`,
              seeds: parseInt(t.seeders) || 0,
              peers: parseInt(t.leechers) || 0,
            });
          }
        });
      }
    } catch (err: any) {
      console.log('⚠️ Local TPB Fetch Error:', err.message);
    }
  };

  // 2. Cloud Proxy Fetch: Hit Vercel to extract 1337x results safely
  const fetchVercelScrapers = async () => {
    try {
      const response = await axios.get(`${BASE_URL}/api/torrent`, {
        params: { q: cleaned },
        timeout: 25000,
      });

      if (response.data?.status === 'success' && Array.isArray(response.data.results)) {
        response.data.results.forEach((item: any) => {
          aggregatedResults.push({
            id: item.id,
            name: item.name,
            size: item.size,
            source: item.source,
            url: item.url || item.magnet,
            seeds: item.seeds,
            peers: item.peers
          });
        });
      } else {
        throw new Error('Torrent API returned an unexpected response');
      }
    } catch (err: any) {
      console.log('⚠️ Vercel Cloud Fetch Error:', err.message);
      throw err;
    }
  };

  // Fire both requests concurrently
  await Promise.all([fetchLocalTPB(), fetchVercelScrapers()]);

  // ==========================================
  // 🎯 CLIENT-SIDE FILTERING PIPELINE
  // ==========================================
  
  // 1. Remove Dead Torrents (0 seeds)
  let finalResults = aggregatedResults.filter(t => t.seeds > 0);

  // 2. Smart Title Match (Ensures all search words exist in the title)
  const queryWords = cleaned.toLowerCase().split(' ');
  finalResults = finalResults.filter(t => {
    const normalizedTitle = t.name.toLowerCase().replace(/[\.\_\-]/g, ' ');
    return queryWords.every(word => normalizedTitle.includes(word));
  });

  // 3. Deduplicate Exact Magnet Links
  const seenHashes = new Set();
  finalResults = finalResults.filter(t => {
    const match = t.url.match(/urn:btih:([a-zA-Z0-9]+)/i);
    const hash = match ? match[1].toLowerCase() : t.url;
    
    if (seenHashes.has(hash)) {
      return false; // Skip if we already have this exact file
    } else {
      seenHashes.add(hash);
      return true;
    }
  });

  // Global sort: Highest seeds at the top
  return finalResults.sort((a, b) => b.seeds - a.seeds);
};
