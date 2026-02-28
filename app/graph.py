import json
import pickle
import re
from typing import Any

import pandas as pd
import pandapower as pp
from fastapi import HTTPException


def _opt_float(row: Any, col: str) -> float | None:
    val = row.get(col)
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def _lbl(row: Any, col: str, fallback: str) -> str:
    val = row.get(col)
    try:
        if pd.isna(val):
            return fallback
    except (TypeError, ValueError):
        pass
    s = str(val).strip()
    return s if s else fallback


def _node(nid: str, label: str, ntype: str, in_service: bool, **extra) -> dict:
    return {"id": nid, "label": label, "type": ntype, "in_service": in_service, **extra}


def _edge(eid: str, src: str, tgt: str, etype: str, in_service: bool, **extra) -> dict:
    return {"id": eid, "source": src, "target": tgt, "type": etype, "in_service": in_service, **extra}


def _load_net(filename: str, content: bytes) -> pp.pandapowerNet:
    if filename.endswith(".json"):
        try:
            return pp.from_json_string(content.decode("utf-8"))
        except Exception as e:
            raise HTTPException(400, f"Invalid JSON net: {e}")
    try:
        return pickle.loads(content)  # noqa: S301
    except Exception:
        pass
    try:
        return pp.from_json_string(content.decode("utf-8"))
    except Exception as e:
        raise HTTPException(400, f"Cannot parse net file: {e}")


def _parse_geo(val: Any) -> tuple[float, float] | None:
    """Parse a bus geo value into (x, y). Handles GeoJSON and WKT Point strings."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    s = str(val).strip()
    # GeoJSON: {"type": "Point", "coordinates": [x, y]}
    try:
        obj = json.loads(s)
        if obj.get("type") == "Point":
            coords = obj["coordinates"]
            return float(coords[0]), float(coords[1])
    except (json.JSONDecodeError, KeyError, TypeError, IndexError):
        pass
    # WKT: POINT (x y)
    m = re.match(r"POINT\s*\(\s*([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\s*\)", s)
    if m:
        return float(m.group(1)), float(m.group(2))
    return None


def _read_geodata(net: pp.pandapowerNet) -> dict[int, tuple[float, float]]:
    """Try to read bus positions from both pandapower 3.x (net.bus['geo'])
    and older-style (net.bus_geodata) storage."""
    # pandapower 3.x: geo column on net.bus with GeoJSON/WKT strings
    if "geo" in net.bus.columns and net.bus["geo"].notna().any():
        result: dict[int, tuple[float, float]] = {}
        for idx, row in net.bus.iterrows():
            parsed = _parse_geo(row.get("geo"))
            if parsed:
                result[int(idx)] = (parsed[0], -parsed[1])
        if result:
            return result
    # older pandapower: separate bus_geodata DataFrame with x/y columns
    geo = getattr(net, "bus_geodata", None)
    if geo is not None and not geo.empty and {"x", "y"}.issubset(geo.columns):
        result = {}
        for idx, row in geo.iterrows():
            x, y = _opt_float(row, "x"), _opt_float(row, "y")
            if x is not None and y is not None:
                result[int(idx)] = (x, -y)
        if result:
            return result
    return {}


def _scale_geodata(
    positions: dict[int, tuple[float, float]],
    target: float = 1000.0,
) -> dict[int, tuple[float, float]]:
    """Scale positions so the largest bounding-box dimension equals `target`.

    Igraph coordinates are in a tiny normalised range (~-1 to 1). Without
    scaling they cluster into a sub-pixel area, making _postPositionElements'
    50px offset dominate and producing the starburst artifact.
    Real geographic coordinates (lat/lon degrees) have spans in the hundreds,
    so they pass through unchanged.
    """
    if not positions:
        return positions
    xs = [p[0] for p in positions.values()]
    ys = [p[1] for p in positions.values()]
    span = max(max(xs) - min(xs), max(ys) - min(ys))
    if span == 0 or span >= target:
        return positions
    scale = target / span
    return {k: (v[0] * scale, v[1] * scale) for k, v in positions.items()}


def _bus_geodata(net: pp.pandapowerNet) -> dict[int, tuple[float, float]]:
    """Return {bus_idx: (x, y)}, y-flipped for screen coords.

    Uses real geodata when available; otherwise generates approximate
    positions via igraph spring layout.
    """
    result = _read_geodata(net)
    if not result:
        try:
            pp.plotting.create_generic_coordinates(net, library="igraph", overwrite=True)
            result = _read_geodata(net)
        except Exception:
            pass
    return _scale_geodata(result)


def _build_graph(net: pp.pandapowerNet) -> dict[str, Any]:
    nodes: list[dict] = []
    edges: list[dict] = []

    ext_grid_buses: set[int] = set(net.ext_grid["bus"].tolist()) if len(net.ext_grid) else set()
    geo = _bus_geodata(net)

    for idx, row in net.bus.iterrows():
        gx, gy = geo.get(int(idx), (None, None))
        nodes.append(_node(
            f"bus_{idx}",
            _lbl(row, "name", f"Bus {idx}"),
            "bus",
            bool(row.get("in_service", True)),
            vn_kv=float(row.get("vn_kv", 0)),
            has_ext_grid=int(idx) in ext_grid_buses,
            x=gx,
            y=gy,
        ))

    for idx, row in net.line.iterrows():
        edges.append(_edge(
            f"line_{idx}",
            f"bus_{int(row['from_bus'])}",
            f"bus_{int(row['to_bus'])}",
            "line",
            bool(row.get("in_service", True)),
            label=_lbl(row, "name", f"Line {idx}"),
            max_p_mw=_opt_float(row, "max_p_mw"),
        ))

    for idx, row in net.trafo.iterrows():
        edges.append(_edge(
            f"trafo_{idx}",
            f"bus_{int(row['hv_bus'])}",
            f"bus_{int(row['lv_bus'])}",
            "trafo",
            bool(row.get("in_service", True)),
            label=_lbl(row, "name", f"Trafo {idx}"),
            max_p_mw=_opt_float(row, "max_p_mw"),
        ))

    for idx, row in net.trafo3w.iterrows():
        tid = f"trafo3w_{idx}"
        svc = bool(row.get("in_service", True))
        # Position hub at centroid of its three buses (if geodata available)
        bus_positions = [
            geo.get(int(row["hv_bus"])),
            geo.get(int(row["mv_bus"])),
            geo.get(int(row["lv_bus"])),
        ]
        valid = [p for p in bus_positions if p is not None]
        if valid:
            gx = sum(p[0] for p in valid) / len(valid)
            gy = sum(p[1] for p in valid) / len(valid)
        else:
            gx = gy = None
        nodes.append(_node(tid, _lbl(row, "name", f"Trafo3W {idx}"), "trafo3w", svc,
                           max_p_mw=_opt_float(row, "max_p_mw"), x=gx, y=gy))
        edges.append(_edge(f"{tid}_hv", f"bus_{int(row['hv_bus'])}", tid, "trafo_conn", svc))
        edges.append(_edge(f"{tid}_mv", f"bus_{int(row['mv_bus'])}", tid, "trafo_conn", svc))
        edges.append(_edge(f"{tid}_lv", f"bus_{int(row['lv_bus'])}", tid, "trafo_conn", svc))

    for idx, row in net.gen.iterrows():
        gid = f"gen_{idx}"
        nodes.append(_node(gid, _lbl(row, "name", f"Gen {idx}"), "gen",
                           bool(row.get("in_service", True)), p_mw=float(row.get("p_mw", 0))))
        edges.append(_edge(f"{gid}_conn", gid, f"bus_{int(row['bus'])}", "connection", True))

    for idx, row in net.sgen.iterrows():
        sid = f"sgen_{idx}"
        nodes.append(_node(sid, _lbl(row, "name", f"SGn {idx}"), "sgen",
                           bool(row.get("in_service", True)), p_mw=float(row.get("p_mw", 0))))
        edges.append(_edge(f"{sid}_conn", sid, f"bus_{int(row['bus'])}", "connection", True))

    for idx, row in net.load.iterrows():
        lid = f"load_{idx}"
        nodes.append(_node(lid, _lbl(row, "name", f"Load {idx}"), "load",
                           bool(row.get("in_service", True)), p_mw=float(row.get("p_mw", 0))))
        edges.append(_edge(f"{lid}_conn", lid, f"bus_{int(row['bus'])}", "connection", True))

    summary = {
        "n_buses": len(net.bus),
        "n_lines": len(net.line),
        "n_trafos": len(net.trafo),
        "n_trafos3w": len(net.trafo3w),
        "n_loads": len(net.load),
        "n_gens": len(net.gen),
        "n_sgens": len(net.sgen),
        "n_ext_grid": len(net.ext_grid),
    }

    return {"nodes": nodes, "edges": edges, "summary": summary}
