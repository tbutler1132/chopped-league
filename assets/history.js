import { LEAGUE_ID, SEASON, formatScore } from './chopped-core.js';
import { FACTORS, rankHistory } from './history-core.js';
import { fetchArchive, fetchHistorySeason } from './history-source.js';

const el = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const leagueId = Number(params.get('league')) || LEAGUE_ID;
const latest = Math.max(SEASON, new Date().getFullYear());
const requestedSeason = Number(params.get('season')) || SEASON;
const season = Math.max(2018, Math.min(latest, requestedSeason));
const first = Number(params.get('from')) || (leagueId === LEAGUE_ID ? 2018 : Math.max(2018, season - 4));
el('from-season').value = Math.max(2018, Math.min(season, first));
el('to-season').value = season;
for (const id of ['from-season', 'to-season']) el(id).max = latest;
el('league-id').textContent = leagueId;
const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
};
const percent = value => `${(value * 100).toFixed(1)}%`;
for (const factor of FACTORS) {
    const item = node('div');
    item.append(node('h3', `${factor.name} · ${factor.weight}%`), node('p', factor.description));
    el('method-factors').append(item);
}
function render(rows) {
    el('rankings').replaceChildren();
    el('breakdowns').replaceChildren();
    const leaders = rows.filter(row => row.rank === 1);
    el('verdict').replaceChildren(node('div', 'THE HISTORICAL VERDICT', 'stat-label'), node('h2', leaders.length ? leaders.map(row => row.name).join(' / ') : 'No completed history to rank'));
    el('verdict').querySelector('h2').id = 'verdict-title';
    if (!leaders.length) {
        el('verdict').append(node('p', 'Try another season range. Rankings require at least one finalized week with complete scores for the recorded field.'));
        return;
    }
    el('verdict').append(node('div', `${leaders[0].index.toFixed(1)} / 100`, 'stat-value'), node('p', `${leaders.length > 1 ? 'Tied for the highest' : 'Highest'} Shame Index in the loaded history. ${leaders.some(row => row.weeks.length < 5) ? 'Provisional verdict: at least one leader has fewer than five scored weeks.' : 'See the factors and scores below.'}`));
    for (const row of rows) {
        const tr = node('tr');
        const name = node('td', row.name);
        if (row.manager && row.teamName) name.append(node('small', row.teamName));
        if (row.weeks.length < 5) name.append(node('span', 'Small sample', 'sample-badge'));
        if (!row.linked) name.append(node('small', 'Season-specific identity'));
        const score = node('td', row.index.toFixed(1), 'index-cell');
        const bar = node('div', undefined, 'bar');
        const fill = node('div', undefined, 'bar-fill');
        fill.style.width = `${row.index}%`;
        bar.append(fill); score.append(bar);
        tr.append(node('td', row.rank), name, score, node('td', row.seasons.join(', ')), node('td', row.weeks.length), node('td', formatScore(row.average)));
        el('rankings').append(tr);
        const detail = node('details', undefined, 'card team-breakdown');
        detail.append(node('summary', `#${row.rank} ${row.name} — ${row.index.toFixed(1)} index`));
        const factors = node('div', undefined, 'factor-grid');
        for (const factor of FACTORS) {
            const item = node('div');
            item.append(node('h3', factor.name), node('p', `${percent(row.factors[factor.key])} · ${(row.factors[factor.key] * factor.weight).toFixed(1)} of ${factor.weight} index points`));
            factors.append(item);
        }
        detail.append(factors);
        const list = node('ul', undefined, 'week-evidence');
        for (const week of row.weeks) list.append(node('li', `${week.season} · Week ${week.week} · ${week.name}: ${formatScore(week.score)} points · ${percent(week.losses)} all-play losses across ${week.field - 1} opponents${week.playoff ? ' · Playoff / consolation' : ''}${week.last ? ' · Lowest score' : ''}`));
        detail.append(list); el('breakdowns').append(detail);
    }
}
async function load() {
    const from = Number(el('from-season').value);
    const to = Number(el('to-season').value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 2018 || to > latest || to < from || to - from > 9) {
        el('history-status').textContent = `Choose an ordered range of up to 10 seasons between 2018 and ${latest}.`;
        return;
    }
    el('load-history').disabled = true;
    el('history-form').setAttribute('aria-busy', 'true');
    el('history-status').textContent = `Loading ${from}–${to} from the archive and ESPN…`;
    el('coverage').replaceChildren(); el('rankings').replaceChildren(); el('breakdowns').replaceChildren();
    el('verdict').replaceChildren(node('h2', 'Following the evidence…'));
    const query = new URLSearchParams({ league: leagueId, season: to, from });
    history.replaceState(null, '', `?${query}`);
    el('dashboard-link').href = `index.html?${new URLSearchParams({ league: leagueId, season: to })}`;
    try {
        let archive;
        if (leagueId === LEAGUE_ID) {
            try { archive = await fetchArchive(); }
            catch (error) { el('coverage').append(node('p', `${error.message}. Trying ESPN for the selected seasons.`, 'coverage-warning')); }
        }
        const results = await Promise.allSettled(Array.from({ length: to - from + 1 }, async (_, index) => {
            const year = from + index;
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 20000);
            try {
                return await fetchHistorySeason({ leagueId, season: year, archive, signal: controller.signal });
            } finally { clearTimeout(timeout); }
        }));
        const loaded = results.filter(result => result.status === 'fulfilled').map(result => result.value);
        const missing = results.flatMap((result, index) => result.status === 'rejected' ? [`${from + index}: ${String(result.reason?.message).includes('401') ? 'ESPN denied public access (401)' : result.reason?.message ?? 'Request failed'}`] : []);
        const { rows, skipped } = rankHistory(loaded);
        el('history-status').textContent = `${loaded.length} of ${results.length} seasons loaded · ${rows.length} managers/teams · ${loaded.filter(item => item.source === 'archive').length} archived, ${loaded.filter(item => item.source === 'ESPN').length} from ESPN`;
        if (missing.length) el('coverage').append(node('p', `Incomplete coverage: ${missing.join('; ')}. Rankings use only the available seasons.`, 'coverage-warning'));
        if (skipped.length) {
            const details = node('details', undefined, 'coverage-warning');
            details.append(node('summary', `${skipped.length} weeks have limited score coverage — view details`));
            for (const warning of skipped) details.append(node('p', warning));
            el('coverage').append(details);
        }
        const counted = new Set(rows.flatMap(row => row.seasons));
        const empty = loaded.filter(item => !counted.has(item.season)).map(item => item.season);
        if (empty.length) el('coverage').append(node('p', `No eligible completed weeks: ${empty.join(', ')}.`));
        render(rows);
    } catch (error) {
        el('history-status').textContent = `Could not calculate history: ${error.message}. Please retry.`;
        el('verdict').replaceChildren(node('h2', 'History unavailable'));
    } finally {
        el('load-history').disabled = false;
        el('history-form').removeAttribute('aria-busy');
    }
}
el('history-form').addEventListener('submit', event => { event.preventDefault(); load(); });
load();
