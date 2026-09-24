#!/usr/bin/env node
/**
 * Node port of chopped_elimination.py. The history is recomputed from ESPN's
 * completed weeks on every run, so there is no state file to drift or to
 * double-process a week.
 */

import {
    calculateEliminationHistory,
    fetchLeague,
    formatScore,
    getCurrentWeek,
    getWeekStatus
} from "../assets/chopped-core.js";

const league = await fetchLeague();
const currentWeek = getCurrentWeek(league);

if (currentWeek === null) {
    console.log();
    console.log("No active ESPN scoring week detected.");
    process.exit(0);
}

const { eliminated } = calculateEliminationHistory(league, currentWeek);

console.log();
console.log("CHOPPED ELIMINATION ENGINE");
console.log(`CURRENT WEEK ${currentWeek} (${getWeekStatus(league, currentWeek)})`);
console.log("=".repeat(70));

if (getWeekStatus(league, currentWeek) !== "FINAL") {
    console.log();
    console.log("🟡 WEEK IS STILL LIVE — no team will be eliminated for it.");
}

console.log();
console.log("ELIMINATION HISTORY");
console.log("-".repeat(70));

if (eliminated.length === 0) {
    console.log("No teams eliminated yet.");
} else {
    for (const team of eliminated) {
        console.log(`Week ${team.week}: ${team.team_name} (${formatScore(team.score)})`);
    }
}

console.log();
console.log(`Total eliminated: ${eliminated.length}`);
console.log("=".repeat(70));
