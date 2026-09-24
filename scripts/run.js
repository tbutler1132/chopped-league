#!/usr/bin/env node
/** Node port of chopped_run.py — runs the week view, then the elimination engine. */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));

console.log();
console.log("=".repeat(70));
console.log("CHOPPED FANTASY FOOTBALL - MASTER RUNNER");
console.log("=".repeat(70));

const steps = [
    ["STEP 1 - SYNCING ESPN DATA", "week.js"],
    ["STEP 2 - RUNNING ELIMINATION ENGINE", "elimination.js"]
];

for (const [title, script] of steps) {
    console.log();
    console.log(title);
    console.log("=".repeat(70));

    const result = spawnSync(process.execPath, [here + script], {
        stdio: "inherit"
    });

    if (result.status !== 0) {
        console.log();
        console.log(`ERROR: ${script} failed.`);
        process.exit(1);
    }
}

console.log();
console.log("=".repeat(70));
console.log("CHOPPED RUN COMPLETE");
console.log("=".repeat(70));
console.log();
