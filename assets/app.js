/**
 * Browser entry point. Talks to ESPN directly from the page, so the site is
 * fully static and can be served by GitHub Pages with no backend.
 */

import {
    LEAGUE_ID,
    SEASON,
    buildDashboard,
    fetchLeague,
    formatScore
} from "./chopped-core.js";

const REFRESH_MS = 30_000;

const params = new URLSearchParams(window.location.search);
const leagueId = Number(params.get("league")) || LEAGUE_ID;
const season = Number(params.get("season")) || SEASON;

const el = (id) => document.getElementById(id);

/** Build an element with text content, so team names can never inject markup. */
function node(tag, className, text) {
    const element = document.createElement(tag);

    if (className) {
        element.className = className;
    }

    if (text !== undefined) {
        element.textContent = text;
    }

    return element;
}

function replace(container, children) {
    container.replaceChildren(...children);
}

function renderEmpty(container, message) {
    replace(container, [node("div", "empty", message)]);
}

function renderStats(data) {
    el("stat-week").textContent = data.week;
    el("stat-remaining").textContent = data.remaining;
    el("stat-eliminated").textContent = data.eliminatedCount;

    const status = el("stat-status");
    status.textContent = data.status;
    status.className = `stat-value ${data.status === "LIVE" ? "live" : "final"}`;
}

function renderDangerZone(data) {
    const container = el("danger-zone");

    if (data.dangerZone.length === 0) {
        renderEmpty(
            container,
            data.notStarted
                ? `Waiting for Week ${data.week} scoring.`
                : "No team data available."
        );
        return;
    }

    replace(
        container,
        data.dangerZone.map((team, index) => {
            const row = node("div", "team-row");

            row.append(
                node("div", "rank", String(index + 1)),
                node("div", "team-name", team.team_name),
                node("div", "score", `Actual: ${formatScore(team.score)}`),
                node("div", "projection", `Projected: ${formatScore(team.projected)}`)
            );

            return row;
        })
    );
}

function renderChoppingBlock(data) {
    const container = el("chopping-block");

    if (data.choppingBlock.length === 0) {
        replace(container, [
            node(
                "div",
                "card empty",
                data.notStarted
                    ? `Week ${data.week} has not started scoring yet.`
                    : "No chopping block information available."
            )
        ]);
        return;
    }

    replace(
        container,
        data.choppingBlock.map((team) => {
            const card = node("div", "card chopping");

            card.append(
                node("div", "stat-label", "Currently in danger"),
                node("div", "team-name", team.team_name),
                node("div", "stat-value", `Actual: ${formatScore(team.score)}`),
                node("div", "projection", `Projected: ${formatScore(team.projected)}`)
            );

            return card;
        })
    );
}

function renderStandings(data) {
    const container = el("standings");

    if (data.teams.length === 0) {
        renderEmpty(container, "No team data available.");
        return;
    }

    replace(
        container,
        data.teams.map((team, index) => {
            const row = node("div", "team-row");

            const details = node("div");
            const bar = node("div", "bar");
            const fill = node("div", "bar-fill");

            fill.style.width = `${team.percent}%`;
            bar.append(fill);
            details.append(node("div", "team-name", team.team_name), bar);

            row.append(
                node("div", "rank", String(index + 1)),
                details,
                node("div", "score", formatScore(team.score)),
                node("div", "projection", `Proj. ${formatScore(team.projected)}`)
            );

            return row;
        })
    );
}

function renderEliminated(data) {
    const container = el("eliminated-teams");

    if (data.eliminatedTeams.length === 0) {
        renderEmpty(container, "Nobody has been eliminated yet. 🔥");
        return;
    }

    replace(
        container,
        data.eliminatedTeams.map((team) => {
            const row = node("div", "team-row eliminated");

            row.append(
                node("div", "team-name", team.team_name),
                node("div", undefined, `Week ${team.week}`),
                node("div", "score", formatScore(team.score))
            );

            return row;
        })
    );
}

function renderError(error) {
    const message = `Could not load ESPN data: ${error.message}`;

    for (const id of ["danger-zone", "standings", "eliminated-teams"]) {
        renderEmpty(el(id), message);
    }

    replace(el("chopping-block"), [node("div", "card empty error", message)]);
}

async function refresh() {
    try {
        const league = await fetchLeague({ leagueId, season });
        const data = buildDashboard(league);

        renderStats(data);
        renderDangerZone(data);
        renderChoppingBlock(data);
        renderStandings(data);
        renderEliminated(data);

        el("updated").textContent =
            `Updated ${new Date().toLocaleTimeString()} • refreshes every 30s`;
    } catch (error) {
        console.error(error);
        renderError(error);
        el("updated").textContent = `Last attempt failed at ${new Date().toLocaleTimeString()}`;
    }
}

el("league-id").textContent = leagueId;
el("season").textContent = season;

refresh();
setInterval(refresh, REFRESH_MS);
