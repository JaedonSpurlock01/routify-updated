# Routify web app

React, TypeScript, Vite, three.js, and a Cloudflare Pages Function. See the [root README](../README.md) for development and deployment.

- `src/lib/city/` — downloading a city and building its road graph (`loadCity`, `CityMap`)
- `src/lib/pathfinding/` — the search algorithms (`runSearch`, which returns a `Trace`) and the map renderer that plays traces back (`Visualizer`)
- `src/components/`, `src/pages/` — the UI
- `functions/api/osm/` — the Pages Function that serves and caches city data in R2

## License

The source code is licensed under MIT license
