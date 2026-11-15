# Routify

A pathfinding visualizer: it downloads a real city's road network and animates search algorithms finding a route across it.

## The map

**City map**:
A city's road network as a graph of nodes joined by lines.
_Avoid_: graph (alone), network

**Node**:
A point where roads meet or bend; the places a search moves between.
_Avoid_: vertex, intersection

**Line**:
One straight road segment between two nodes. It is both a graph edge and the unit the map is drawn in.
_Avoid_: edge, segment, road (for a single segment)

## Searching

**Search**:
One run of an algorithm from a start node to a goal node.

**Expansion**:
A search taking one node off its frontier and looking at that node's neighbours. "Nodes expanded" counts these.
_Avoid_: step, visit

**Explored line**:
A line whose two end nodes a search has both expanded.

**Route**:
The lines a search settles on to get from start to goal.
_Avoid_: path (in user-facing text)

**Comparison**:
Two searches between the same points, played side by side on one map.
_Avoid_: race, versus

## Playback

**Trace**:
The full record of one search: every line it explored, in order, plus its route and how long it took to compute.
_Avoid_: recording, log, replay

**Playback**:
Drawing a trace on the map over time, at the chosen speed.
_Avoid_: animation (for the pacing itself)

**Cursor**:
How far playback has got through a trace, counted in expansions. In a comparison, both traces share one cursor.
_Avoid_: progress, position, playhead

**Speed**:
How many expansions playback draws per second, or Instant to draw the whole trace at once.
_Avoid_: nodes per frame

**Timeline**:
The bar under the navbar that shows the cursor while a search is on screen. Dragging it moves the cursor forwards or backwards without searching again ("scrubbing").
_Avoid_: seek bar, progress bar

**Skip to end**:
Moving the cursor straight to the end of the traces. Routes still draw in over about a second; skipping again finishes them.
