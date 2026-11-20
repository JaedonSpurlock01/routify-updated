/**
 * The short roadmap shown in the settings panel. ROADMAP.md at the repository
 * root has the long version; keep the two in step.
 */

export type RoadmapStatus = "planned" | "in-progress" | "shipped";

export type RoadmapItem = {
  title: string;
  summary: string;
  status: RoadmapStatus;
};

export type RoadmapGroup = {
  title: string;
  items: RoadmapItem[];
};

export const roadmap: RoadmapGroup[] = [
  {
    title: "Realistic routes",
    items: [
      {
        title: "One-way streets and road types",
        summary: "Follow one-way rules and pick the fastest route, not just the shortest.",
        status: "planned",
      },
      {
        title: "Travel modes",
        summary: "Walk, bike or drive, each on the roads it's allowed to use.",
        status: "planned",
      },
      {
        title: "Waypoints",
        summary: "Add stops along the way, then find the best order to visit them.",
        status: "planned",
      },
    ],
  },
  {
    title: "Learning the algorithms",
    items: [
      {
        title: "Live frontier",
        summary: "See the nodes each search is about to expand, glowing ahead of it.",
        status: "planned",
      },
      {
        title: "Heuristic weight slider",
        summary: "Drag Weighted A* from Dijkstra all the way to Greedy.",
        status: "planned",
      },
      {
        title: "Step-through mode",
        summary: "Move one expansion at a time and see each node's costs.",
        status: "planned",
      },
      {
        title: "All-algorithm leaderboard",
        summary: "Run all twelve algorithms between the same points and rank them.",
        status: "planned",
      },
    ],
  },
  {
    title: "Sharing",
    items: [
      {
        title: "Shareable links",
        summary: "Send a link that replays your exact search.",
        status: "planned",
      },
      {
        title: "Video export",
        summary: "Save a playback as a clip to post anywhere.",
        status: "planned",
      },
      {
        title: "Daily challenge",
        summary: "A new start and goal every day. Guess the most efficient algorithm.",
        status: "planned",
      },
    ],
  },
  {
    title: "Look and feel",
    items: [
      {
        title: "3D buildings",
        summary: "Raise the city's buildings around the route for a night skyline.",
        status: "planned",
      },
      {
        title: "Map themes",
        summary: "Blueprint, neon, paper and more, in one click.",
        status: "planned",
      },
      {
        title: "Spatial sound",
        summary: "Hear a search move across the screen.",
        status: "planned",
      },
    ],
  },
  {
    title: "Platform",
    items: [
      {
        title: "Offline cities",
        summary: "Open cities you've visited before instantly, even offline.",
        status: "planned",
      },
    ],
  },
];
