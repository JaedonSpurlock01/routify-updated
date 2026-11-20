# Roadmap

Features planned for Routify, grouped by what they add. Nothing here is scheduled yet; the order inside each group is a rough suggestion. The settings panel on the map page shows a short version of this list (`frontend/src/lib/data/roadmap.ts`), so update both when something changes.

Words follow [GLOSSARY.md](GLOSSARY.md): a **route** is what a search settles on, a **comparison** is two searches played side by side, **playback** draws a **trace** over time.

**Start with these three.** They give the most for the effort:

1. [Shareable links](#shareable-links): small, and every shared link brings people to the site.
2. [One-way streets and road types](#one-way-streets-and-road-types): turns the routes from "shortest on paper" into ones a driver would take.
3. [All-algorithm leaderboard](#all-algorithm-leaderboard): striking to look at, and most of the comparison code already exists.

---

## Realistic routes

### One-way streets and road types

The Overpass query in `frontend/functions/api/osm/[type]/[id].ts` ends with `out skel`, which drops every tag on every road. Keep `oneway`, `highway` and `maxspeed` (for example `out body` limited to those keys) and store them in the city map:

- **One-way streets** make the graph directed. Every algorithm must then follow lines only in their allowed direction. Bidirectional searches have to walk the backward half against that direction.
- **Fastest vs shortest**: a toggle that weights each line by travel time (length ÷ speed, falling back to a default speed per road type) instead of length. Comparing a motorway route with a side-street route is a striking result.

Costs to plan for: tags make the Overpass download and the R2 cache bigger, and already-cached cities have no tags. Give the cache key a version so old copies are fetched again. The heuristic for A\* in time mode must divide distance by the top speed in the city so it stays admissible.

### Travel modes

Walk, bike and drive. Each mode allows a different set of road types (no motorways on foot, no pedestrian streets by car) and, once speeds exist, a different speed. Running the same two points in all three modes shows three different routes. Depends on keeping road types above.

### Waypoints

Let people add stops between start and goal. The search runs one leg at a time and playback chains the traces. A later step is a small **travelling salesman** mode: visit every stop in the best order, which is a good way to show off heuristics (nearest neighbour, 2-opt).

## Learning the algorithms

### Live frontier

Draw the nodes waiting on a search's frontier as glowing dots ahead of the explored lines. It makes the shape of each algorithm obvious: a narrow wedge for A\*, a widening circle for Dijkstra, a lone thread for DFS. The trace would need to record when nodes join the frontier, not only when lines are explored.

### Heuristic weight slider

Weighted A\* is fixed at ×2 today. A slider from 0 to 5 lets people drag from Dijkstra (0) through A\* (1) towards Greedy (high values) and watch the explored area and the route change.

### Step-through mode

Step one expansion at a time, with a panel listing the node being expanded, its cost so far, its heuristic estimate, and its neighbours. The cursor already counts expansions, so playback can stop on each one. The work is recording the costs in the trace.

### All-algorithm leaderboard

Comparisons hold two searches. A "run every algorithm" mode would search the same start and goal with all twelve and rank them by nodes expanded, route length and compute time. It could draw the routes on the map together or play each one in turn.

## Sharing

### Shareable links

No search state is in the URL today. Put the city, start, goal, algorithm(s) and speed in the URL, so opening a link loads the city and replays that exact search. Snap the start and goal to the nearest node after loading, since node indexes can change if a city is fetched again.

### Video export

Record the canvas during playback with `canvas.captureStream()` and `MediaRecorder` and save the clip (WebM, or MP4 where the browser supports it). Offer square and portrait framings for social posts.

### Daily challenge

A fixed start and goal in a featured city each day. Players guess which algorithm expands the fewest nodes, or draw their own route and see how close it is to the shortest. The puzzle can be picked from the date, so it needs no server.

## Look and feel

### 3D buildings

Fetch OSM building footprints (and `height` / `building:levels` where tagged) for the area around a route and extrude them in three.js. With bloom on, this gives a night skyline. Limit it to the view or the area around the route to keep memory in check.

### Map themes

Preset looks such as blueprint, neon, paper and dark satellite. The colour settings and bloom toggle are most of a theme system already; a theme is a named set of colours plus a few scene options.

### Spatial sound

Pan and pitch-shift the search sounds by where the frontier is on screen, so a search sweeping left to right sounds like it.

## Platform

### Offline cities

Keep parsed city maps in IndexedDB so a city someone has opened before loads instantly and works offline, and make the site an installable PWA. Show how much storage the cached cities use and let people clear them.
