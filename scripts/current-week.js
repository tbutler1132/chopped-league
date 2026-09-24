#!/usr/bin/env node
/** Node port of chopped_current_week.py — reports ESPN's current scoring week. */

import { LEAGUE_ID, SEASON, leagueUrl } from "../assets/chopped-core.js";

const response = await fetch(leagueUrl(["mSettings", "mMatchupScore"]));

if (!response.ok) {
    throw new Error(`ESPN returned ${response.status} ${response.statusText}`);
}

const league = await response.json();
const status = league.status ?? {};

console.log();
console.log("=".repeat(60));
console.log("CHOPPED CURRENT WEEK DETECTOR");
console.log("=".repeat(60));
console.log(`League: ${LEAGUE_ID} • Season: ${SEASON}`);
console.log(`ESPN current matchup period: ${status.currentMatchupPeriod}`);
console.log(`ESPN latest scoring period: ${status.latestScoringPeriod}`);
console.log(`ESPN final scoring period: ${status.finalScoringPeriod}`);
console.log(`Season: ${league.seasonId} • active: ${status.isActive}`);
console.log();

if (status.currentMatchupPeriod != null) {
    console.log(`Current ESPN scoring week: ${status.currentMatchupPeriod}`);
} else {
    console.log("ESPN did not provide a current matchup period.");
}

console.log("=".repeat(60));
