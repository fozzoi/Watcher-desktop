export type EpisodePosition = {
  season: number;
  episode: number;
};

export type SeasonEpisodeCount = readonly [season: number, episodeCount: number];

export function findAdjacentEpisode(
  season: number,
  episode: number,
  seasonCounts: readonly SeasonEpisodeCount[],
  direction: -1 | 1,
): EpisodePosition | undefined {
  const currentSeason = seasonCounts.find(([seasonNumber]) => seasonNumber === season);
  if (!currentSeason) return undefined;

  const adjacentEpisode = episode + direction;
  if (adjacentEpisode > 0 && adjacentEpisode <= currentSeason[1]) {
    return { season, episode: adjacentEpisode };
  }

  const adjacentSeason = seasonCounts
    .filter(([seasonNumber]) => direction === 1 ? seasonNumber > season : seasonNumber < season)
    .sort(([seasonA], [seasonB]) => direction === 1 ? seasonA - seasonB : seasonB - seasonA)[0];
  if (!adjacentSeason) return undefined;

  return {
    season: adjacentSeason[0],
    episode: direction === 1 ? 1 : adjacentSeason[1],
  };
}
