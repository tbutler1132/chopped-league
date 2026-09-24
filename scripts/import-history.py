#!/usr/bin/env python3
"""Convert a local ESPN CSV export to the site's historical data asset.
Usage: python3 scripts/import-history.py /path/to/league_781990_history
Only completed seasons with matchup rows are imported; originals are unchanged.
"""
import csv
import json
import math
import sys
from pathlib import Path

source = Path(sys.argv[1])
def read(name):
    with (source / name).open(encoding='utf-8-sig', newline='') as handle:
        return list(csv.DictReader(handle))

def owners(value):
    return sorted({' '.join(name.split()).casefold() for name in value.split(';') if name.strip()})

standings = read('all_standings.csv')
matchups = read('all_matchups.csv')
seasons = []
for year in sorted({int(row['year']) for row in matchups}):
    teams = []
    by_name = {}
    for row in standings:
        if int(row['year']) != year:
            continue
        if row['team'] in by_name:
            raise ValueError(f'Duplicate team in {year}: {row["team"]}')
        manager_names = owners(row['owners'])
        if not manager_names:
            raise ValueError(f'Missing owner in {year}: {row["team"]}')
        team = {'id': len(teams) + 1, 'name': row['team'].strip(), 'managerNames': manager_names}
        teams.append(team)
        by_name[row['team']] = team['id']
    schedule = []
    for row in matchups:
        if int(row['year']) != year:
            continue
        game = {'matchupPeriodId': int(row['week']), 'winner': 'FINAL', 'playoff': row['playoff'] == 'True'}
        for side in ['home', 'away']:
            points = float(row[f'{side}_score'])
            if not math.isfinite(points):
                raise ValueError('Non-finite score')
            game[side] = {'teamId': by_name[row[f'{side}_team']], 'totalPoints': points}
        schedule.append(game)
    seasons.append({'season': year, 'league': {'teams': teams, 'schedule': schedule}})
output = Path(__file__).resolve().parents[1] / 'assets' / 'league-history.json'
output.write_text(json.dumps({'leagueId': 781990, 'source': 'Local ESPN CSV export', 'seasons': seasons}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(f'Imported {len(seasons)} seasons, {sum(len(item["league"]["schedule"]) for item in seasons)} matchups into {output.name}')
