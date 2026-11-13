import math

import numpy as np
import pandas as pd
import pandapower as pp
from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from app.graph import _build_graph, _load_net
from app.sensitivities import compute_sensitivities

app = FastAPI(title="ppviz")
app.mount("/static", StaticFiles(directory="app/static"), name="static")

_SESSION_HEADER = "X-Session-Id"
_nets: dict[str, pp.pandapowerNet] = {}


@app.middleware("http")
async def _session_middleware(request: Request, call_next):
    """Key network state off a client-generated per-tab id, not a cookie.

    Cookies are shared by every tab of the same browser, so a cookie-based
    session would still let one tab clobber another tab's network. The
    frontend instead generates an id in sessionStorage (which IS scoped per
    tab) and sends it on this header.
    """
    request.state.session_id = request.headers.get(_SESSION_HEADER) or "default"
    return await call_next(request)


def _require_net(session_id: str) -> pp.pandapowerNet:
    net = _nets.get(session_id)
    if net is None:
        raise HTTPException(400, "No network loaded")
    return net


def _sanitize(obj: object) -> object:
    """Recursively replace NaN/Inf floats with None so JSONResponse never raises."""
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else obj
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return obj


@app.get("/")
def index() -> FileResponse:
    return FileResponse("app/static/index.html")


_DEMO_FILES: dict[str, str] = {
    "case14custom": "app/demo/custom_case14_net.json",
    "case9": "app/demo/case9_net.json",
    "case9custom": "app/demo/custom_case9_net.json",
}


@app.get("/demo")
async def load_demo_net(request: Request, net_id: str = "case9") -> JSONResponse:
    path = _DEMO_FILES.get(net_id)
    if path is None:
        raise HTTPException(400, f"Unknown demo net: {net_id}. Choose from: {list(_DEMO_FILES)}")
    net = pp.from_json(path)
    _nets[request.state.session_id] = net
    return JSONResponse(_sanitize(_build_graph(net)))


@app.post("/upload")
async def upload_net(request: Request, file: UploadFile) -> JSONResponse:
    content = await file.read()
    net = _load_net(file.filename or "", content)
    _nets[request.state.session_id] = net
    return JSONResponse(_sanitize(_build_graph(net)))


_POWERFLOW_RUNNERS = {"dc": pp.rundcpp, "ac": pp.runpp}

# (p column, q column) for each terminal; q is only used by the AC power flow.
_Side = tuple[str, str]
_LINE_SIDES: list[_Side] = [("p_from_mw", "q_from_mvar"), ("p_to_mw", "q_to_mvar")]
_TRAFO_SIDES: list[_Side] = [("p_hv_mw", "q_hv_mvar"), ("p_lv_mw", "q_lv_mvar")]
_TRAFO3W_SIDES: list[_Side] = [
    ("p_hv_mw", "q_hv_mvar"), ("p_mv_mw", "q_mv_mvar"), ("p_lv_mw", "q_lv_mvar"),
]


@app.post("/run")
async def run_powerflow(request: Request, mode: str = "dc") -> JSONResponse:
    net = _require_net(request.state.session_id)
    if mode not in _POWERFLOW_RUNNERS:
        raise HTTPException(400, f"Unknown mode: {mode}. Choose from: {list(_POWERFLOW_RUNNERS)}")
    try:
        _POWERFLOW_RUNNERS[mode](net)
    except Exception as e:
        raise HTTPException(500, f"Power flow failed: {e}")

    _empty = pd.DataFrame()
    net_line = getattr(net, "line", _empty)
    net_trafo = getattr(net, "trafo", _empty)
    net_trafo3w = getattr(net, "trafo3w", _empty)
    res_line = getattr(net, "res_line", _empty)
    res_trafo = getattr(net, "res_trafo", _empty)
    res_trafo3w = getattr(net, "res_trafo3w", _empty)

    ac = mode == "ac"
    loading: dict[str, float] = {}
    limits: dict[str, float] = {}
    _collect_loading(loading, limits, net_line, res_line, _LINE_SIDES, "line", ac)
    _collect_loading(loading, limits, net_trafo, res_trafo, _TRAFO_SIDES, "trafo", ac)
    _collect_loading(loading, limits, net_trafo3w, res_trafo3w, _TRAFO3W_SIDES, "trafo3w", ac)

    flows: dict[str, int] = {}
    _collect_flows(flows, res_line, "p_from_mw", "line")
    _collect_flows(flows, res_trafo, "p_hv_mw", "trafo")
    _collect_trafo_3w_flows(flows, res_trafo3w)

    flows_mw: dict[str, float] = {}
    _collect_flows_mw(flows_mw, res_line, _LINE_SIDES[:1], "line", ac)
    _collect_flows_mw(flows_mw, res_trafo, _TRAFO_SIDES[:1], "trafo", ac)
    _collect_flows_mw(flows_mw, res_trafo3w, _TRAFO3W_SIDES, "trafo3w", ac)

    flows_pq: dict[str, dict[str, float]] = {}
    if ac:
        _collect_flows_pq(flows_pq, res_line, _LINE_SIDES[:1], "line")
        _collect_flows_pq(flows_pq, res_trafo, _TRAFO_SIDES[:1], "trafo")
        _collect_flows_pq(flows_pq, res_trafo3w, _TRAFO3W_SIDES, "trafo3w")

    return JSONResponse(_sanitize({
        "mode": mode,
        "loading": loading,
        "flows": flows,
        "flows_mw": flows_mw,
        "flows_pq": flows_pq,
        "limits": limits,
    }))


@app.get("/sensitivities")
async def get_sensitivities(request: Request) -> JSONResponse:
    net = _require_net(request.state.session_id)
    if getattr(net, "_ppc", None) is None:
        raise HTTPException(400, "Run power flow first")
    try:
        result = compute_sensitivities(net)
    except Exception as e:
        raise HTTPException(500, f"Sensitivity computation failed: {e}")
    return JSONResponse(_sanitize(result))


@app.patch("/element/{element_id}")
async def toggle_element(request: Request, element_id: str) -> JSONResponse:
    net = _require_net(request.state.session_id)
    table, idx = _parse_element_id(element_id)
    if table is None or idx is None:
        raise HTTPException(400, f"Unknown element id: {element_id}")
    df = net[table]
    if idx not in df.index:
        raise HTTPException(404, f"Element {element_id} not found")
    new_state = not bool(df.at[idx, "in_service"])
    df.at[idx, "in_service"] = new_state
    return JSONResponse(_sanitize({"in_service": new_state}))


class _PmwUpdate(BaseModel):
    p_mw: float


@app.patch("/element/{element_id}/p_mw")
async def update_element_p_mw(
    request: Request, element_id: str, body: _PmwUpdate
) -> JSONResponse:
    net = _require_net(request.state.session_id)
    table, idx = _parse_element_id(element_id)
    if table not in ("gen", "sgen", "load") or idx is None:
        raise HTTPException(400, f"Element {element_id} does not support p_mw editing")
    df = net[table]
    if idx not in df.index:
        raise HTTPException(404, f"Element {element_id} not found")
    df.at[idx, "p_mw"] = body.p_mw
    return JSONResponse(_sanitize({"p_mw": body.p_mw}))


_SKIP_COLS: set[str] = {"geo"}


@app.get("/element/{element_id}/data")
async def get_element_data(request: Request, element_id: str) -> JSONResponse:
    net = _require_net(request.state.session_id)
    table, idx = _parse_element_id(element_id)
    if table is None or idx is None:
        raise HTTPException(400, f"Unknown element id: {element_id}")
    df = net[table]
    if idx not in df.index:
        raise HTTPException(404, f"Element {element_id} not found")
    row = df.loc[idx]
    name_val = row.get("name") if "name" in df.columns else None
    try:
        label = str(name_val).strip() if name_val is not None and not pd.isna(name_val) else element_id
    except (TypeError, ValueError):
        label = element_id
    props: dict[str, object] = {"index": idx}
    for col in df.columns:
        if col in _SKIP_COLS or col.startswith("_") or col == "name":
            continue
        val = row[col]
        try:
            if pd.isna(val):
                continue
        except (TypeError, ValueError):
            pass
        props[col] = val.item() if hasattr(val, "item") else val
    return JSONResponse(_sanitize({"type": table, "label": label, "props": props}))


def _parse_element_id(element_id: str) -> tuple[str | None, int | None]:
    # trafo3w_ must be checked before trafo_ to avoid false prefix match
    for prefix, table in [
        ("trafo3w_", "trafo3w"), ("trafo_", "trafo"), ("line_", "line"),
        ("bus_", "bus"), ("sgen_", "sgen"), ("gen_", "gen"), ("load_", "load"),
    ]:
        if element_id.startswith(prefix):
            try:
                return table, int(element_id[len(prefix):])
            except ValueError:
                return None, None
    return None, None


def _collect_flows(
    out: dict[str, int],
    res_df: pd.DataFrame,
    col: str,
    prefix: str,
) -> None:
    if res_df is None or len(res_df) == 0:
        return
    if col not in res_df.columns:
        return
    for idx in res_df.index:
        try:
            val = float(res_df.at[idx, col])
        except (TypeError, ValueError):
            continue
        if math.isfinite(val):
            out[f"{prefix}_{idx}"] = 1 if val >= 0 else -1


def _collect_trafo_3w_flows(out: dict[str, int], res3w: pd.DataFrame) -> None:
    if res3w is None or len(res3w) == 0:
        return
    side_col = [("hv", "p_hv_mw"), ("mv", "p_mv_mw"), ("lv", "p_lv_mw")]
    for idx in res3w.index:
        for side, col in side_col:
            if col not in res3w.columns:
                continue
            try:
                val = float(res3w.at[idx, col])
            except (TypeError, ValueError):
                continue
            if math.isfinite(val):
                out[f"trafo3w_{idx}_{side}"] = 1 if val >= 0 else -1


def _magnitude(res_df: pd.DataFrame, idx: object, side: _Side, ac: bool) -> float | None:
    """|P| for DC, apparent power sqrt(P² + Q²) for AC; None if unavailable."""
    p_col, q_col = side
    if p_col not in res_df.columns:
        return None
    try:
        p = float(res_df.at[idx, p_col])
        q = float(res_df.at[idx, q_col]) if ac and q_col in res_df.columns else 0.0
    except (TypeError, ValueError):
        return None
    val = math.hypot(p, q)
    return val if math.isfinite(val) else None


def _collect_flows_mw(
    out: dict[str, float],
    res_df: pd.DataFrame,
    sides: list[_Side],
    prefix: str,
    ac: bool,
) -> None:
    """Store max flow magnitude per element (MW for DC, MVA for AC)."""
    if res_df is None or len(res_df) == 0:
        return
    for idx in res_df.index:
        vals = [_magnitude(res_df, idx, side, ac) for side in sides]
        vals = [v for v in vals if v is not None]
        if vals:
            out[f"{prefix}_{idx}"] = max(vals)


def _collect_flows_pq(
    out: dict[str, dict[str, float]],
    res_df: pd.DataFrame,
    sides: list[_Side],
    prefix: str,
) -> None:
    """Store signed P and Q at the terminal with the largest apparent power."""
    if res_df is None or len(res_df) == 0:
        return
    for idx in res_df.index:
        best: tuple[float, _Side] | None = None
        for side in sides:
            mag = _magnitude(res_df, idx, side, True)
            if mag is not None and (best is None or mag > best[0]):
                best = (mag, side)
        if best is None:
            continue
        p_col, q_col = best[1]
        out[f"{prefix}_{idx}"] = {
            "p_mw": float(res_df.at[idx, p_col]),
            "q_mvar": float(res_df.at[idx, q_col]),
        }


def _collect_loading(
    out: dict[str, float],
    limits: dict[str, float],
    net_df: pd.DataFrame,
    res_df: pd.DataFrame,
    sides: list[_Side],
    prefix: str,
    ac: bool,
) -> None:
    """Compute loading as max flow magnitude / limit * 100 for each element.

    DC uses max(|P|) / max_p_mw. AC uses max(S) / max_s_mva, falling back to
    max_p_mw when max_s_mva is not defined. The limit used is stored in `limits`.

    Elements without a limit defined are skipped entirely (no colour change).
    Elements where the limit <= 0 are set to 0.0 (green — no limit defined).
    """
    limit_cols = ["max_s_mva", "max_p_mw"] if ac else ["max_p_mw"]
    limit_col = next((c for c in limit_cols if c in net_df.columns), None)
    if limit_col is None:
        return
    if res_df is None or len(res_df) == 0:
        return
    for idx in net_df.index:
        if idx not in res_df.index:
            continue
        max_raw = net_df.at[idx, limit_col]
        if ac and limit_col == "max_s_mva" and pd.isna(max_raw) and "max_p_mw" in net_df.columns:
            max_raw = net_df.at[idx, "max_p_mw"]
        try:
            if pd.isna(max_raw):
                continue
        except (TypeError, ValueError):
            pass
        max_val = float(max_raw)
        key = f"{prefix}_{idx}"
        limits[key] = max_val
        if max_val <= 0.0:
            out[key] = 0.0
            continue
        vals = [_magnitude(res_df, idx, side, ac) for side in sides]
        vals = [v for v in vals if v is not None]
        if not vals:
            continue
        out[key] = max(vals) / max_val * 100.0
