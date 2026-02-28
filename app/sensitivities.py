import numpy as np
import pandas as pd
from pandapower.pypower.makePTDF import makePTDF


def compute_sensitivities(net) -> dict:
    ppci = net._ppc["internal"]
    active_branch = ppci["branch_is"]
    ppc_bus = net._ppc["bus"]
    bus_is = ppc_bus[:, 1] != 4
    pd2ppc_map = net._pd2ppc_lookups["bus"]

    ppc2ppci_map = np.full(len(net._ppc["bus"]), -1, dtype=int)
    ppc2ppci_map[bus_is] = np.arange(int(np.sum(bus_is)))
    ref_bus = int(ppci["ref"][0])

    ptdf = makePTDF(ppci["baseMVA"], ppci["bus"], ppci["branch"])
    n_full = len(net._ppc["branch"])

    def _cols_for(table: str) -> tuple[list[dict], np.ndarray]:
        df = net[table]
        if len(df) == 0:
            return [], np.zeros((n_full, 0))
        ppc_idxs = pd2ppc_map[df["bus"].values].astype(int)
        ppci_idxs = ppc2ppci_map[ppc_idxs].copy()
        ppci_idxs[ppci_idxs == -1] = ref_bus
        col_ptdf = np.zeros((n_full, len(df)))
        col_ptdf[active_branch] = ptdf[:, ppci_idxs]
        fallback = "Gen" if table == "gen" else "SGn"
        col_info = [
            {"id": f"{table}_{idx}", "label": _safe_str(df, idx, "name") or f"{fallback} {idx}"}
            for idx in df.index
        ]
        return col_info, col_ptdf

    gen_cols, gen_ptdf = _cols_for("gen")
    sgen_cols, sgen_ptdf = _cols_for("sgen")
    cols = gen_cols + sgen_cols
    if not cols:
        return {"rows": [], "cols": [], "matrix": []}

    full_ptdf = np.hstack([gen_ptdf, sgen_ptdf])
    branch_lookup = net._pd2ppc_lookups["branch"]
    rows: list[dict] = []
    row_arrays: list[np.ndarray] = []

    def _add_rows(table: str, prefix: str, fallback: str) -> None:
        if table not in branch_lookup:
            return
        s, e = branch_lookup[table]
        df = net[table]
        slc = full_ptdf[s:e, :]
        for pos, idx in enumerate(df.index):
            rows.append({
                "id": f"{prefix}_{idx}",
                "label": _safe_str(df, idx, "name") or f"{fallback} {idx}",
            })
            row_arrays.append(slc[pos, :])

    _add_rows("line", "line", "Line")
    _add_rows("trafo", "trafo", "Trafo")

    if "trafo3w" in branch_lookup:
        s, e = branch_lookup["trafo3w"]
        slc = full_ptdf[s : s + (e - s) // 3, :]
        df = net.trafo3w
        for pos, idx in enumerate(df.index):
            rows.append({
                "id": f"trafo3w_{idx}",
                "label": _safe_str(df, idx, "name") or f"Trafo3W {idx}",
            })
            row_arrays.append(slc[pos, :])

    matrix = np.vstack(row_arrays).tolist() if row_arrays else []
    return {"rows": rows, "cols": cols, "matrix": matrix}


def _safe_str(df: pd.DataFrame, idx: int, col: str) -> str | None:
    if col not in df.columns:
        return None
    val = df.at[idx, col]
    try:
        if pd.isna(val):
            return None
    except (TypeError, ValueError):
        pass
    s = str(val).strip()
    return s or None
