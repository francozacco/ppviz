# ppviz

Interactive web-based visualizer for [pandapower](https://www.pandapower.org/) networks.

## Features

- **Demo net** — a default network is shown on startup to play with (no upload required)
- **Upload** a pandapower network (`.json` or pickle `.pkl`/`.p`)
- **Graph view** — buses, lines, 2W/3W transformers, generators, static generators, and loads rendered with [cytoscape.js](https://js.cytoscape.org/):
  - Geographic coordinates (`bus_geodata`) are used when available; otherwise positions are generated automatically via igraph
  - Dragging a bus moves all its attached generators/loads with it
- **Search** — type in the header bar to jump to any element by name or id
- **DC power flow** — run `rundcpp` and see results overlaid on the graph (also auto-runs after any toggle or setpoint change):
  - **Loading colors**: green → yellow → red based on `max(|p|) / max_p_mw × 100`; `max_p_mw` is a custom column you can add to `net.line`, `net.trafo`, and `net.trafo3w` — elements without it are left uncolored
  - **Flow animation**: animated dashes march along each branch in the direction of positive power flow
- **PTDF sensitivity panel** — collapsible/resizable left panel showing the branch × generator sensitivity matrix as a heatmap after DC PF runs
- **In-service toggle** — click any line, transformer, or 3W trafo to pin a tooltip and disconnect/reconnect it; DC PF re-runs automatically
- **P_MW editing** — generators, static generators, and loads expose a numeric input in the tooltip to update their active power setpoint; DC PF re-runs automatically
- **Legend** — click any entry to hide/show that element type

## Running

```bash
uv run uvicorn app.main:app --reload --port 8000
```

Then open `http://localhost:8000`.

## Project structure

```
app/
  main.py            # FastAPI app — endpoints and power flow logic
  graph.py           # Network → graph conversion (geodata, node/edge building)
  sensitivities.py   # PTDF sensitivity matrix computation
  static/
    index.html       # HTML skeleton
    style.css        # All CSS
    app.js           # Entry point — wires modules together, handles upload
    state.js         # Shared mutable state (cy instance, cached results)
    utils.js         # Pure helpers (colors, tooltip HTML, status)
    graph.js         # Cytoscape initialisation and layout
    tooltip.js       # Tooltip show/hide/pin and element edit handlers
    simulation.js    # DC PF fetch, loading overlay, flow animation
    sensitivity.js   # PTDF panel fetch, canvas heatmap, collapse/resize
    search.js        # Search input and dropdown
    legend.js        # Legend toggle click handlers
    drag.js          # Drag-to-move bus + attached peripheral nodes
```

## Requirements

- Python ≥ 3.11
- `pandapower`, `fastapi`, `uvicorn`, `pandas`, `pydantic`, `igraph`
