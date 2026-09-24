import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rankHistory, FACTORS, managerIdentity } from '../assets/history-core.js';
import { fetchHistorySeason } from '../assets/history-source.js';
const league = (weeks, owners = true) => ({
    teams: [1, 2, 3, 4].map(id => ({ id, name: `Team ${id}`, ...(owners ? { owners: [`owner-${id}`] } : {}) })),
    schedule: weeks.flatMap((scores, index) => [0, 2].map(offset => ({ matchupPeriodId: index + 1, winner: 'HOME', home: { teamId: offset + 1, totalPoints: scores[offset] }, away: { teamId: offset + 2, totalPoints: scores[offset + 1] } })))
});
const rank = data => rankHistory([{ season: 2025, league: data }]);
test('all teams keep scoring after a last-place finish', () => {
    assert.equal(FACTORS.reduce((sum, item) => sum + item.weight, 0), 100);
    const { rows } = rank(league([[10, 50, 70, 90], [100, 20, 50, 80], [100, 100, 40, 80]]));
    assert.ok(rows.every(row => row.weeks.length === 3));
    assert.equal(rows.find(row => row.name === 'Team 1').average, 70);
    assert.ok(rows.every(row => row.index >= 0 && row.index <= 100));
});
test('live weeks are excluded, while valid later records are retained', () => {
    const data = league([[10, 50, 70, 90], [0, 20, 50, 80], [10, 20, 40, 80]]);
    data.schedule[2].winner = 'UNDECIDED';
    assert.ok(rank(data).rows.every(row => row.weeks.length === 2));
});
test('ties share rank; zero counts and tied teams continue', () => {
    const { rows } = rank(league([[0, 0, 70, 90], [0, 0, 40, 80]]));
    assert.equal(rows[0].rank, 1); assert.equal(rows[1].rank, 1);
    assert.equal(rows[0].weeks.length, 2); assert.equal(rows[1].weeks.length, 2);
    assert.equal(rows[0].factors.last, 1);
});
test('missing and conflicting scores skip only the affected week', () => {
    const data = league([[undefined, 50, 70, 90], [10, 20, 30, 40]]);
    data.schedule[0].home.totalPointsLive = 10;
    const result = rank(data);
    assert.equal(result.rows.length, 4); assert.equal(result.skipped.length, 1);
    assert.ok(result.rows.every(row => row.weeks.length === 1));
    const conflict = league([[10, 20, 30, 40]]);
    conflict.schedule.push({ ...conflict.schedule[0], home: { teamId: 1, totalPoints: 99 } });
    assert.equal(rank(conflict).rows.length, 0);
});
test('playoff byes do not end history or create zero scores', () => {
    const data = league([[10, 20, 30, 40], [10, 20, 30, 40], [10, 20, 30, 40]]);
    data.schedule.splice(2, 1);
    data.schedule[2].playoff = true;
    const { rows, skipped } = rank(data);
    assert.equal(rows.find(row => row.name === 'Team 1').weeks.length, 2);
    assert.equal(rows.find(row => row.name === 'Team 3').weeks.length, 3);
    assert.equal(skipped.length, 1);
});
test('normalized archive owner names join live members, without team-name guesses', () => {
    const archived = { id: 1, managerNames: [' Bennett  Carey ', 'bennett carey'] };
    const live = { id: 9, owners: ['id1', 'id2'] };
    const members = [{ id: 'id1', firstName: 'Bennett', lastName: 'Carey' }, { id: 'id2', firstName: 'BENNETT', lastName: 'CAREY' }];
    assert.equal(managerIdentity(archived, {}, 2025).key, managerIdentity(live, { members }, 2026).key);
    assert.notEqual(managerIdentity(live, {}, 2026).key, managerIdentity(archived, {}, 2025).key);
    const noOwners = league([[10, 20, 30, 40]], false);
    assert.equal(rankHistory([{ season: 2024, league: noOwners }, { season: 2025, league: noOwners }]).rows.length, 8);
});
test('empty history and duplicate score rows are safe', () => {
    assert.deepEqual(rankHistory([]).rows, []);
    const data = league([[0, 0, 0, 0]]);
    data.schedule.push(data.schedule[0]);
    assert.ok(rank(data).rows.every(row => row.rank === 1 && row.weeks.length === 1 && Number.isFinite(row.index)));
});
const archive = JSON.parse(readFileSync(new URL('../assets/league-history.json', import.meta.url)));
test('archive contains all eight seasons and 651 games with ten normalized managers', () => {
    assert.deepEqual(archive.seasons.map(item => item.season), [2018,2019,2020,2021,2022,2023,2024,2025]);
    assert.equal(archive.seasons.reduce((sum, item) => sum + item.league.schedule.length, 0), 651);
    const { rows } = rankHistory(archive.seasons);
    assert.equal(rows.length, 10);
    assert.equal(rows.reduce((sum, row) => sum + row.weeks.length, 0), 1302);
    assert.ok(rows.every(row => row.seasons.length === 8));
});
test('archived seasons avoid ESPN; other leagues and current seasons use ESPN', async () => {
    const original = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async url => { urls.push(String(url)); return { ok: true, json: async () => league([[10,20,30,40]]) }; };
    try {
        assert.equal((await fetchHistorySeason({ leagueId: 781990, season: 2025, archive })).source, 'archive');
        assert.equal(urls.length, 0);
        assert.equal((await fetchHistorySeason({ leagueId: 781990, season: 2026, archive })).source, 'ESPN');
        await fetchHistorySeason({ leagueId: 123, season: 2025, archive });
        assert.equal(urls.length, 2);
        assert.ok(urls[1].includes('/leagues/123'));
    } finally { globalThis.fetch = original; }
});
