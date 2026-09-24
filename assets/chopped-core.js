/**
 * Chopped Fantasy Football — shared core.
 *
 * Pure ESM with no dependencies and no DOM or Node APIs, so the same logic
 * runs in the browser (GitHub Pages) and in the Node CLI scripts.
 *
 * ESPN is the source of truth: elimination history is derived from the
 * league's completed weeks on every load, never from a stored file.
 */

export const LEAGUE_ID = 781990;
export const SEASON = 2026;

// Scores that land within this margin of each other count as a tie.
const TIE_EPSILON = 0.001;

export function leagueUrl(views, { leagueId = LEAGUE_ID, season = SEASON } = {}) {
    const url = new URL(
        `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${season}/segments/0/leagues/${leagueId}`
    );

    for (const view of views) {
        url.searchParams.append("view", view);
    }

    return url.toString();
}

/**
 * Fetch the whole league once. Every derived value below reads from this
 * single payload, so a full dashboard costs exactly one request.
 */
export async function fetchLeague({ leagueId = LEAGUE_ID, season = SEASON, signal } = {}) {
    const response = await fetch(
        leagueUrl(["mTeam", "mMatchupScore"], { leagueId, season }),
        { signal }
    );

    if (!response.ok) {
        throw new Error(`ESPN returned ${response.status} ${response.statusText}`);
    }

    return response.json();
}

export function getCurrentWeek(league) {
    const week = league?.status?.currentMatchupPeriod;

    return Number.isFinite(week) ? week : null;
}

export function getTeamNames(league) {
    const names = new Map();

    for (const team of league?.teams ?? []) {
        names.set(team.id, (team.name ?? `Team ${team.id}`).trim());
    }

    return names;
}

function getMatchups(league, week) {
    return (league?.schedule ?? []).filter(
        (matchup) => matchup.matchupPeriodId === week
    );
}

/**
 * A week is FINAL only once ESPN has decided every one of its matchups.
 * Anything else is LIVE, which keeps teams safe from elimination.
 */
export function getWeekStatus(league, week) {
    const matchups = getMatchups(league, week);

    if (matchups.length === 0) {
        return "LIVE";
    }

    const undecided = matchups.some(
        (matchup) => matchup.winner == null || matchup.winner === "UNDECIDED"
    );

    return undecided ? "LIVE" : "FINAL";
}

/**
 * Build one week's team rows. ESPN only publishes the `*Live` fields while a
 * week is in progress, so completed weeks fall back to their settled totals.
 */
export function buildWeek(league, week) {
    const matchups = getMatchups(league, week);

    if (matchups.length === 0) {
        return null;
    }

    const names = getTeamNames(league);
    const teams = [];

    for (const matchup of matchups) {
        for (const side of ["home", "away"]) {
            const entry = matchup[side];

            if (!entry || entry.teamId == null) {
                continue;
            }

            const score = entry.totalPointsLive ?? entry.totalPoints ?? 0;

            teams.push({
                team_id: entry.teamId,
                team_name: names.get(entry.teamId) ?? `Team ${entry.teamId}`,
                score,
                projected:
                    entry.totalProjectedPointsLive ??
                    entry.totalProjectedPoints ??
                    score
            });
        }
    }

    return {
        week,
        status: getWeekStatus(league, week),
        teams
    };
}

/**
 * Replay every completed week in order and chop the lowest active score.
 * Stops at the first week that isn't final so a live week can never
 * eliminate anybody, and every team tied for last goes out together.
 */
export function calculateEliminationHistory(league, currentWeek) {
    const eliminated = [];
    const eliminatedIds = new Set();

    for (let week = 1; week < currentWeek; week += 1) {
        const weekData = buildWeek(league, week);

        if (!weekData || weekData.status !== "FINAL") {
            break;
        }

        const active = weekData.teams.filter(
            (team) => !eliminatedIds.has(team.team_id)
        );

        if (active.length === 0) {
            break;
        }

        const lowest = Math.min(...active.map((team) => team.score));

        for (const team of active) {
            if (Math.abs(team.score - lowest) < TIE_EPSILON) {
                eliminated.push({
                    week,
                    team_id: team.team_id,
                    team_name: team.team_name,
                    score: team.score
                });

                eliminatedIds.add(team.team_id);
            }
        }
    }

    return { eliminated, eliminatedIds };
}

/**
 * While a week is live the standings are driven by projections; once it's
 * final the actual scores decide who gets chopped.
 */
function rankValue(team, status) {
    return status === "FINAL" ? team.score : team.projected;
}

/**
 * Everything the dashboard renders, derived from one ESPN payload.
 */
export function buildDashboard(league) {
    const currentWeek = getCurrentWeek(league);

    if (currentWeek === null) {
        throw new Error("ESPN did not provide a current matchup period.");
    }

    const history = calculateEliminationHistory(league, currentWeek);
    const weekData = buildWeek(league, currentWeek) ?? {
        week: currentWeek,
        status: "LIVE",
        teams: []
    };

    const status = weekData.status;

    const active = weekData.teams
        .filter((team) => !history.eliminatedIds.has(team.team_id))
        .sort((a, b) => rankValue(b, status) - rankValue(a, status));

    const maxScore =
        Math.max(0, ...active.map((team) => rankValue(team, status))) || 1;

    const teams = active.map((team) => ({
        ...team,
        percent: Math.max(5, Math.min(100, (team.score / maxScore) * 100))
    }));

    const byRank = [...active].sort(
        (a, b) => rankValue(a, status) - rankValue(b, status)
    );

    // Between weeks ESPN briefly reports neither scores nor projections, which
    // would otherwise tie the entire field for last place.
    const notStarted =
        status !== "FINAL" &&
        active.length > 0 &&
        active.every((team) => team.score === 0 && team.projected === 0);

    const lowest = byRank.length > 0 ? rankValue(byRank[0], status) : null;

    const choppingBlock =
        lowest === null || notStarted
            ? []
            : byRank.filter(
                  (team) => Math.abs(rankValue(team, status) - lowest) < TIE_EPSILON
              );

    return {
        week: currentWeek,
        status,
        notStarted,
        remaining: active.length,
        eliminatedCount: history.eliminated.length,
        choppingBlock,
        dangerZone: notStarted ? [] : byRank.slice(0, 3),
        teams,
        eliminatedTeams: history.eliminated
    };
}

export function formatScore(value) {
    return Number(value ?? 0).toFixed(2);
}
