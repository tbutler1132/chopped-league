import { fetchLeague } from './chopped-core.js';

export async function fetchArchive() {
    const response = await fetch(new URL('./league-history.json', import.meta.url));
    if (!response.ok) throw new Error(`Local archive returned HTTP ${response.status}`);
    const archive = await response.json();
    if (!Array.isArray(archive.seasons)) throw new Error('Invalid local history archive');
    return archive;
}

export async function fetchHistorySeason({ leagueId, season, archive, signal }) {
    const saved = archive?.leagueId === leagueId ? archive.seasons.find(item => item.season === season) : null;
    if (saved) return { ...saved, source: 'archive' };
    const league = await fetchLeague({ leagueId, season, signal });
    if (!Array.isArray(league?.teams) || !league.teams.length || !Array.isArray(league.schedule)) throw new Error('No league history returned');
    return { season, league, source: 'ESPN' };
}
