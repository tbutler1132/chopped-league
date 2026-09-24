# Chopped Fantasy Football

A read-only dashboard for an ESPN fantasy football elimination league: every
week, the lowest-scoring active team gets chopped.

The site is fully static. The live dashboard talks to ESPN's public fantasy API straight
from the browser, so there is no server, no build step, and no scheduled job —
GitHub Pages can host it as-is.

## Layout

```
index.html               the dashboard page
assets/chopped-core.js   ESPN client + elimination logic (shared)
assets/app.js            browser rendering
assets/styles.css        styles
scripts/*.js             Node CLI equivalents
```

`assets/chopped-core.js` has no DOM or Node dependencies, so the browser and
the CLI scripts run the exact same logic.

## Deploying to GitHub Pages

1. Push to `main`.
2. Repo **Settings → Pages → Build and deployment**.
3. Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.

The dashboard is then live at `https://<user>.github.io/<repo>/`. Every visit
pulls fresh data from ESPN, and the page refreshes itself every 30 seconds.

To point the page at a different league without editing code, use query
parameters: `?league=781990&season=2026`.

## Running locally

Open `index.html` through a local web server — ES modules do not load over
`file://`:

```
npm run serve       # then open http://localhost:3000
```

## CLI

Node 18+ is required (for built-in `fetch`). There are no dependencies to
install.

```
npm run week            # current week's chopping block and standings
npm run elimination     # season elimination history
npm run current-week    # ESPN's current scoring week
npm start               # both of the first two, in order
```

## How elimination works

For the live guillotine dashboard, ESPN is the source of truth and nothing is cached to disk. On every load the
app fetches the league once and replays the season:

- Each week before the current one is checked; a week counts as `FINAL` only
  when ESPN has decided all of its matchups.
- In each completed week, the lowest-scoring team still active is eliminated.
  Teams tied for last are all eliminated together.
- The replay stops at the first week that is not final, so a live week can
  never eliminate anybody.

While a week is live, standings and the chopping block are ranked by ESPN's
live projections; once the week is final they rank by actual score.

## Hall of Shame

Open `worst.html` from the dashboard for historical manager rankings. The default
range is 2018 through the selected season, with up to 10 seasons per comparison.
Custom links support `worst.html?league=781990&season=2026&from=2018`.

The 0–100 Shame Index combines all-play losses (30%), bottom-quarter finishes
(20%), last-place finishes (15%), shortfall below the weekly median (15%), worst
three weeks (10%), and below-median weeks (10%). Higher scores mean worse results.
Factors, weighted contributions, team names, and recorded scores are visible.

Historical rankings are independent of the guillotine side competition. All
recorded finalized scores count, including playoffs and consolation games. A
missing team receives no result for that week, not zero points. Comparisons use
the recorded field; limited coverage and skipped invalid weeks are disclosed.
Each scored week carries equal weight. Fewer than five weeks is a small sample.

`assets/league-history.json` contains the supplied 2018–2025 ESPN export for league
781990. It includes manager names and matchup scores and will be publicly
readable when the site is deployed. Original source files remain unchanged.
Refresh the asset with:

```
python3 scripts/import-history.py /path/to/league_781990_history
```

The importer reads `all_standings.csv` and `all_matchups.csv`, checks team joins,
normalizes owner names, and includes only seasons with matchups. Use completed
season exports: CSVs do not carry a matchup-finality flag. The supplied 2026
preseason standings are not imported as results. Unarchived seasons use the
public ESPN API with a 20-second timeout. Archived seasons need no ESPN login.

Managers join across seasons using complete normalized owner-name groups,
including current ESPN member names when available. Duplicate owner names,
case, and spacing are normalized; unknown identities remain separate. Names
are not immutable IDs: a real name change or shared name may require a curated
mapping. Team names are never used to guess manager identity.

`assets/history-core.js` calculates rankings; `assets/history-source.js` selects
the source; `assets/history.js` renders the page. Run `npm test` for regression
and archive integrity tests. The live guillotine dashboard is unchanged.
