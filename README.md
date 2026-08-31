# The Coffee Diary ☕

A pixel-cute coffee brew diary for hunting the **perfect latte & cold brew recipe** — grind setting × seconds × water, every experiment remembered.

**Live**: https://coffee-diary.limkangxian99.workers.dev

## What it is

- **Operate-surface diary** in classical coffee-house style (cream paper, serif type, pixel accents)
- **Pixel barista bot "Brew-o"** — idle bob, blinking, waving arm, star-holding celebration on 5★ brews, with a live pixel steam rising from the latte cup and the machine spout
- **Log brews**: method (latte/cold brew), bean, grind setting, dose (g), water (g), extraction/steep time, 1–5★ rating, tasting notes
- **The recipe map**: grind × time scatter (log-scale time axis so 28s espresso pulls and 16h cold brew steeps coexist on one map), dot size/color = rating, ★ marks the best brew, click a dot to flash its diary entry
- **Stats strip**: total brews, avg rating, best, split by method
- **Draft persistence**: half-filled forms survive a refresh (localStorage)
- Delete entries, offline retry banner, reduced-motion support

## Stack

- **Cloudflare Worker** (static assets + JSON API in one deploy)
- **D1** (SQLite at the edge) — single `brews` table
- Vanilla JS + Canvas pixel art. No build step.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/brews` | all brews, newest first (`?method=latte\|coldbrew` to filter) |
| POST | `/api/brews` | log a brew (validated server-side) |
| DELETE | `/api/brews/:id` | tear a page out of the diary |
| GET | `/api/health` | liveness |

POST body: `{ method, bean, grind, dose_g, water_g, seconds, rating, notes }`

## Dev

```bash
npm run db:local    # apply schema to local D1
npm run dev         # wrangler dev on :8788
npm run db:remote   # apply schema to remote D1 (after changes)
npm run deploy      # wrangler deploy
```

Schema lives in `schema.sql`. Local and remote D1 are separate stores — apply schema to both whenever it changes.

## Schema

```sql
brews(id, method, bean, grind, dose_g, water_g, seconds, rating, notes, created_at)
```
