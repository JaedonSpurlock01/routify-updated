## About

A pathfinding visualizer designed to work with any city listed on [`OpenStreetMap`](https://www.openstreetmap.org/).

<br/>

![](/demo.png)

## How it works

This project uses ThreeJS for rendering the maps. The frontend is built with [React](https://react.dev/) and the backend is built with [Go](https://go.dev/) and the [Echo](https://echo.labstack.com/) framework.

The city data is fetched by the [`Overpass API`](http://overpass-turbo.eu/) offered through OpenStreetMap. The API is free, but it is rate limited and its good to avoid heavy use of external APIs. Therefore, we are caching cities and storing it with Amazon S3.

We use [`Nominatim`](https://nominatim.openstreetmap.org/) for city search querying. When a user clicks a result, we use that id to search in the cache if it exists. If it doesn't then we fallback to the Overpass API.

The frontend simply queries the AWS CDN for the city data, and the backend queries the Overpass API. The data is then cached in the AWS S3 bucket.

## Limitations

Routify can handle large cities up to 1gb, which can include San Diego, Seattle, Columbus, etc. However, once you start to download larger cities, the website will start to get very memory intensive and will slow down. We are downloading millions of lines after all.<br/>

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
