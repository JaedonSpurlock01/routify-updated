## About

A pathfinding visualizer designed to work with any city listed on [`OpenStreetMap`](https://www.openstreetmap.org/).

<br/>

![](/demo.png)

## How it works

Routify is a [React](https://react.dev/) + [three.js](https://threejs.org/) app deployed on [Cloudflare Pages](https://pages.cloudflare.com/). A single Pages Function and an [R2](https://developers.cloudflare.com/r2/) bucket replace what used to be a Go server and S3.

- City search uses [`Nominatim`](https://nominatim.openstreetmap.org/).
- Road data comes from the [`Overpass API`](http://overpass-turbo.eu/). It is free but rate limited, so every city is cached in R2 the first time someone opens it: the function streams the Overpass response to the visitor and into the bucket at the same time. Later visitors get the cached copy.
- The browser parses the stream on a worker thread into a compact typed-array road graph, which is both what the algorithms search and what the scene draws.

## Development

Requires [Bun](https://bun.sh/) and Node 24 (see `frontend/.nvmrc`).

```bash
cd frontend
bun install
bun run dev      # Vite + the Pages Function (with a local R2 bucket) together
bun test         # unit tests
bun run build    # type-check and build to dist/
```

## Deploying to Cloudflare

One-time setup:

```bash
cd frontend
bunx wrangler login
bunx wrangler r2 bucket create routify-cities
bunx wrangler pages project create routify --production-branch main
```

Then deploy with `bun run deploy`.

To deploy from Git instead, connect the repository in the Cloudflare dashboard with root directory `frontend`, build command `bun run build` and output directory `dist`. The R2 binding is read from `frontend/wrangler.jsonc`.

Notes:

- Caching a large city means relaying a few hundred megabytes through the function. That can exceed the CPU allowance of the Workers Free plan; the Paid plan is recommended if you expect big cities.
- Set `OVERPASS_URLS` (comma separated) to use your own Overpass endpoints instead of the public ones.

## Limitations

Routify can handle large cities up to 1gb of road data, which can include San Diego, Seattle, Columbus, etc. However, once you start to download larger cities, the website will start to get very memory intensive and will slow down. We are downloading millions of lines after all.<br/>

The biggest city I was able to load is Chongqing, China (70mb), which consumes up 1gb of memory. It can technically load larger cities, but the renderer will start reaching its limits.

## Algorithms Used

A\* Search | (Weighted) Guarantees shortest path <br/>
Greedy Search | (Weighted) Does not guarantee shortest path <br/>
Dijkstra's Search | (Weighted) Guarantees shortest path <br/>
Breadth-Firth-Search | (Unweighted) Guarantees shortest path <br/>
Bidirectional Heuristic Search | (Weighted) Does not guarantee shortest path <br />
Bidirectional Standard Search | (Unweighted) Does not guarantee shortest path <br />
Depth-First-Search (Very bad for pathfinding) | (Unweighted) Does not guarantee shortest path <br/>

## Inspiration

This project is heavily inspired by the three following sources, please go to them and take a look at their projects as well.

[`Python Rendered Pathfinding Visualizer`](https://youtu.be/CgW0HPHqFE8?si=BFFg43Q4frz7BKm6) <br/>
[`City Pathfinding Visualizer`](https://github.com/honzaap/Pathfinding) by https://github.com/honzaap<br/>
[`City Roads`](https://github.com/anvaka/city-roads) by https://github.com/anvaka<br/>

## License

The source code is licensed under MIT license
