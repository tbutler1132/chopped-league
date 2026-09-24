/** Historical rankings use settled scores throughout the full season, independent of guillotine. */
export const FACTORS = [
    { key: 'losses', name: 'All-play losses', weight: 30, description: 'Share of opponents in the recorded field who outscored you; ties count as half a loss.' },
    { key: 'bottom', name: 'Bottom-quarter finishes', weight: 20, description: 'Share of weeks with an all-play loss rate of at least 75%.' },
    { key: 'last', name: 'Last-place finishes', weight: 15, description: 'Share of weeks tied for the lowest recorded score.' },
    { key: 'deficit', name: 'Scoring shortfall', weight: 15, description: 'Average shortfall below the recorded field’s median, divided by its absolute median (minimum 1), capped at 100%.' },
    { key: 'worst', name: 'Worst three weeks', weight: 10, description: 'Average all-play loss rate in your worst three weeks, or all weeks if fewer.' },
    { key: 'below', name: 'Below-median weeks', weight: 10, description: 'Share of weeks scoring below the recorded field’s median.' }
];
const EPSILON = 0.001;
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;

export function normalizeOwnerName(name) {
    return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function managerIdentity(team, league, season) {
    const owners = [...new Set((team.owners ?? []).filter(owner => typeof owner === 'string' && owner.trim()))].sort();
    const members = new Map((league.members ?? []).map(member => [member.id, member]));
    const names = team.managerNames ?? owners.map(id => {
        const member = members.get(id);
        return member ? `${member.firstName ?? ''} ${member.lastName ?? ''}`.trim() : '';
    });
    const normalized = [...new Set(names.map(normalizeOwnerName).filter(Boolean))].sort();
    // Join by names only when the whole owner group is known; never guess from team names.
    if (normalized.length && (team.managerNames || names.every(Boolean))) {
        return { key: `names:${JSON.stringify(normalized)}`, manager: normalized.map(name => name.replace(/\b\w/g, letter => letter.toUpperCase())).join(' / '), linked: true };
    }
    return { key: owners.length ? `owners:${JSON.stringify(owners)}` : `team:${season}:${team.id}`, manager: null, linked: owners.length > 0 };
}

export function rankHistory(seasons) {
    const managers = new Map();
    const skipped = [];
    for (const { season, league } of [...seasons].sort((a, b) => a.season - b.season)) {
        const teams = league?.teams ?? [];
        const teamIds = new Set(teams.map(team => team.id));
        const weeks = [...new Set((league?.schedule ?? []).map(game => game.matchupPeriodId))].filter(Number.isInteger).sort((a, b) => a - b);
        for (const week of weeks) {
            const games = league.schedule.filter(game => game.matchupPeriodId === week);
            if (games.some(game => !game.winner || game.winner === 'UNDECIDED')) continue;
            const scores = new Map();
            let invalid = false;
            for (const game of games) {
                for (const entry of [game.home, game.away]) {
                    if (!entry || !teamIds.has(entry.teamId)) continue;
                    // Never substitute projections, live scores, or missing scores with zero.
                    if (!Number.isFinite(entry.totalPoints)) { invalid = true; continue; }
                    if (scores.has(entry.teamId) && Math.abs(scores.get(entry.teamId) - entry.totalPoints) >= EPSILON) invalid = true;
                    scores.set(entry.teamId, entry.totalPoints);
                }
            }
            if (invalid || scores.size < 2) {
                skipped.push(`${season}: skipped week ${week} because settled scores were incomplete or conflicting.`);
                continue;
            }
            if (scores.size < teamIds.size) skipped.push(`${season} week ${week}: ${scores.size} of ${teamIds.size} teams have recorded scores; absent teams receive no result for this week.`);
            const values = [...scores.values()].sort((a, b) => a - b);
            const median = (values[Math.floor((values.length - 1) / 2)] + values[Math.floor(values.length / 2)]) / 2;
            const lowest = values[0];
            for (const [id, score] of scores) {
                const team = teams.find(team => team.id === id);
                const identity = managerIdentity(team, league, season);
                const key = identity.key;
                if (!managers.has(key)) managers.set(key, { ...identity, name: identity.manager ?? team.name ?? `Team ${id}`, teamName: team.name, weeks: [], seasons: new Set() });
                const row = managers.get(key);
                row.name = identity.manager ?? team.name ?? `Team ${id}`;
                row.teamName = team.name;
                row.seasons.add(season);
                const opponents = [...scores].filter(([other]) => other !== id).map(([, points]) => points);
                const losses = mean(opponents.map(points => Math.abs(points - score) < EPSILON ? 0.5 : points > score ? 1 : 0));
                row.weeks.push({ season, week, score, name: team.name, playoff: games.some(game => game.playoff || (game.playoffTierType && game.playoffTierType !== 'NONE')), field: scores.size, losses, bottom: losses >= 0.75 ? 1 : 0, last: Math.abs(score - lowest) < EPSILON ? 1 : 0, deficit: Math.min(1, Math.max(0, (median - score) / Math.max(1, Math.abs(median)))), below: median - score >= EPSILON ? 1 : 0 });
            }
        }
    }
    const rows = [...managers.values()].map(row => {
        const factors = Object.fromEntries(FACTORS.map(factor => [factor.key, factor.key === 'worst' ? mean(row.weeks.map(week => week.losses).sort((a, b) => b - a).slice(0, 3)) : mean(row.weeks.map(week => week[factor.key]))]));
        const index = FACTORS.reduce((sum, factor) => sum + factors[factor.key] * factor.weight, 0);
        return { ...row, seasons: [...row.seasons], factors, index, average: mean(row.weeks.map(week => week.score)) };
    }).sort((a, b) => b.index - a.index || a.name.localeCompare(b.name));
    rows.forEach((row, index) => { row.rank = index && Math.abs(row.index - rows[index - 1].index) < EPSILON ? rows[index - 1].rank : index + 1; });
    return { rows, skipped };
}
