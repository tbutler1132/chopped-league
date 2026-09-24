#!/usr/bin/env node
/**
 * Node port of chopped_week.py — prints the live chopping block for the
 * current ESPN week. Read-only: nothing is written to disk, since the
 * dashboard derives the same view straight from ESPN.
 */

import {
    buildDashboard,
    fetchLeague,
    formatScore
} from "../assets/chopped-core.js";

const league = await fetchLeague();
const data = buildDashboard(league);

console.log();
console.log("=".repeat(70));
console.log("CHOPPED FANTASY FOOTBALL");
console.log(`WEEK ${data.week} — ${data.status}`);
console.log("=".repeat(70));
console.log();

const ranked = [...data.teams].sort((a, b) =>
    data.status === "FINAL" ? a.score - b.score : a.projected - b.projected
);

ranked.forEach((team, index) => {
    const marker =
        index === 0 ? "🔴 CHOPPING BLOCK" : index < 3 ? "🟠 DANGER ZONE" : "";

    console.log(
        `${String(index + 1).padStart(2)}. ` +
            `${team.team_name.padEnd(30)} ` +
            `${formatScore(team.score).padStart(7)} ` +
            `(Proj: ${formatScore(team.projected).padStart(7)}) ` +
            marker
    );
});

console.log();
console.log("=".repeat(70));

if (data.choppingBlock.length === 0) {
    console.log(`Week ${data.week} has not started scoring yet.`);
} else {
    for (const team of data.choppingBlock) {
        const value = data.status === "FINAL" ? team.score : team.projected;
        console.log(`CURRENT CHOPPING BLOCK: ${team.team_name} (${formatScore(value)})`);
    }
}

console.log("=".repeat(70));
console.log();
console.log(`Active: ${data.remaining}   Eliminated: ${data.eliminatedCount}`);
console.log();
