"""
견적 계산 샘플 — Drawing2.dxf 파서 출력 + pricing_seed.json 예시값
실제 단가를 채우면 이 스크립트가 견적 엔진 프로토타입이 됨.
"""

import io
import json
import sys
from pathlib import Path

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# 파서 임포트
# ---------------------------------------------------------------------------
sys.path.insert(0, str(Path(__file__).parent))
from parse_dxf import parse_dxf

# ---------------------------------------------------------------------------
# 예시 단가 (실제 pricing_seed.json 값이 0이므로 여기서 임시 오버라이드)
# 실제값을 pricing_seed.json에 채우면 아래 EXAMPLE_PRICES 블록은 삭제
# ---------------------------------------------------------------------------
EXAMPLE_PRICES = {
    "material_price": {
        "SPCC": 1_800, "SECC": 2_200, "SGCC": 2_200, "SS400": 1_600,
        "SUS304": 7_500, "SUS316": 9_000, "AL5052": 5_500, "AL6061": 6_000,
    },
    "cut_price_per_m": {
        "0.8": 600, "1.0": 700, "1.2": 850, "1.5": 1_000,
        "2.0": 1_300, "2.3": 1_500, "3.0": 2_000,
        "4.0": 2_700, "5.0": 3_400, "6.0": 4_200,
    },
    "pierce_price": {
        "0.8": 150, "1.0": 200, "1.2": 250, "1.5": 300,
        "2.0": 400, "2.3": 500, "3.0": 700,
        "4.0": 1_000, "5.0": 1_300, "6.0": 1_700,
    },
    "bend_price": {
        "P4":      {"setup": 500, "per_m": 2_000},
        "general": {"setup": 800, "per_m": 3_000},
    },
    "special_process_price": {
        "TAP_M3": 400, "TAP_M4": 500, "TAP_M5": 600,
        "TAP_M6": 700, "TAP_M8": 900, "BUR": 800, "EM": 600,
    },
    "surface_price": {"분체도장": 15_000, "도장": 12_000, "도금": 25_000, "없음": 0},
    "overhead": {"management_rate": 15, "margin_rate": 20},
}


def load_pricing(seed_path: Path) -> dict:
    with open(seed_path, encoding="utf-8") as f:
        raw = json.load(f)
    # _meta, _unit, _note 같은 메타 키 제거
    def strip_meta(d):
        return {k: v for k, v in d.items() if not k.startswith("_")}

    pricing = {k: strip_meta(v) if isinstance(v, dict) else v
               for k, v in raw.items() if not k.startswith("_")}

    def _is_zero(val) -> bool:
        """단일값 0이거나, dict의 모든 숫자 값이 0이면 True."""
        if isinstance(val, dict):
            return all(v == 0 for v in val.values() if isinstance(v, (int, float)))
        return val == 0

    # 실제 단가가 0이면 예시값으로 대체 (운영 시 이 블록 삭제)
    for section, example in EXAMPLE_PRICES.items():
        if section not in pricing:
            pricing[section] = example
            continue
        for key, ex_val in example.items():
            if _is_zero(pricing[section].get(key, 0)):
                pricing[section][key] = ex_val

    return pricing


# ---------------------------------------------------------------------------
# 견적 엔진
# ---------------------------------------------------------------------------

def find_thickness_key(pricing_section: dict, thickness_mm: float) -> str:
    """두께(mm) → 가장 가까운 단가 원본 키 반환."""
    numeric = {k: float(k) for k in pricing_section if k.replace(".", "").isdigit()}
    if not numeric:
        raise KeyError("단가 키 없음")
    return min(numeric, key=lambda k: abs(numeric[k] - thickness_mm))


def calculate_estimate(parsed: dict, pricing: dict,
                        bend_mode: str = "P4",
                        surface_type: str = "분체도장",
                        special_processes: dict | None = None,
                        qty: int = 1) -> dict:
    """
    parsed: parse_dxf() 반환값
    pricing: load_pricing() 반환값
    bend_mode: "P4" or "general"
    surface_type: "분체도장" / "도장" / "도금" / "없음"
    special_processes: {"TAP_M4": 6, "BUR": 2} 등 (수동 입력)
    qty: 수량
    """
    special_processes = special_processes or {}
    warn = []

    mat  = parsed.get("material")
    t_mm = parsed.get("thickness_mm")

    # --- 재료비 ---
    weight_kg = parsed.get("weight_kg", 0) or 0
    mat_unit  = pricing["material_price"].get(mat, 0) if mat else 0
    if not mat:
        warn.append("재질 미검출 → 재료비 0")
    material_cost = round(weight_kg * mat_unit)

    # --- 절단비 ---
    cut_mm = parsed.get("cut_length_mm", 0) or 0
    holes  = parsed.get("hole_count", 0) or 0
    if t_mm:
        t_key = find_thickness_key(pricing["cut_price_per_m"], t_mm)
        cut_unit    = pricing["cut_price_per_m"].get(t_key, 0)
        pierce_unit = pricing["pierce_price"].get(t_key, 0)
    else:
        cut_unit = pierce_unit = 0
        warn.append("두께 미검출 → 절단·피어싱 단가 0")
    cut_cost    = round(cut_mm / 1000 * cut_unit)       # mm → m
    pierce_cost = round(holes * pierce_unit)
    cutting_cost = cut_cost + pierce_cost

    # --- 절곡비: 횟수×셋업비 + 절곡길이m×m당단가 ---
    bends          = parsed.get("bend_total", 0) or 0
    bend_length_m  = (parsed.get("bend_length_mm", 0) or 0) / 1000
    bend_info      = pricing["bend_price"].get(bend_mode, {})
    setup_unit     = bend_info.get("setup", 0) if isinstance(bend_info, dict) else 0
    per_m_unit     = bend_info.get("per_m",  0) if isinstance(bend_info, dict) else 0
    bend_setup_cost  = round(bends * setup_unit)
    bend_length_cost = round(bend_length_m * per_m_unit)
    bend_cost        = bend_setup_cost + bend_length_cost

    # --- 특수 가공비 ---
    special_cost = sum(
        pricing["special_process_price"].get(k, 0) * cnt
        for k, cnt in special_processes.items()
    )

    # --- 후처리비 ---
    sa_mm2 = parsed.get("surface_area_mm2") or 0
    sa_m2  = sa_mm2 / 1e6
    surf_unit = pricing["surface_price"].get(surface_type, 0)
    surface_cost = round(sa_m2 * surf_unit)

    # --- 소계 → 관리비·마진 ---
    subtotal = material_cost + cutting_cost + bend_cost + special_cost + surface_cost
    mgmt_rate   = pricing["overhead"].get("management_rate", 0) / 100
    margin_rate = pricing["overhead"].get("margin_rate", 0) / 100
    mgmt_cost   = round(subtotal * mgmt_rate)
    margin_cost = round(subtotal * margin_rate)
    unit_price  = subtotal + mgmt_cost + margin_cost
    total_price = unit_price * qty

    return {
        "file":           parsed["file"],
        "material":       mat or "미검출",
        "thickness_mm":   t_mm,
        "weight_kg":      weight_kg,
        "bend_mode":      bend_mode,
        "surface_type":   surface_type,
        "qty":            qty,
        "breakdown": {
            "재료비":     material_cost,
            "절단비":     cut_cost,
            "피어싱비":   pierce_cost,
            "절곡비":     bend_cost,
            "특수가공비": special_cost,
            "후처리비":   surface_cost,
            "소계":       subtotal,
            "관리비":     mgmt_cost,
            "마진":       margin_cost,
        },
        "unit_price":  unit_price,
        "total_price": total_price,
        "warnings":    warn,
        # 계산 근거 (투명성)
        "_detail": {
            "weight_kg":       weight_kg,
            "mat_unit_per_kg": mat_unit,
            "cut_m":           round(cut_mm / 1000, 3),
            "cut_unit_per_m":  cut_unit,
            "pierce_unit":     pierce_unit,
            "holes":           holes,
            "bends":             bends,
            "bend_length_m":     round(bend_length_m, 3),
            "bend_setup_unit":   setup_unit,
            "bend_per_m_unit":   per_m_unit,
            "bend_setup_cost":   bend_setup_cost,
            "bend_length_cost":  bend_length_cost,
            "surface_area_m2": round(sa_m2, 4),
            "surf_unit_per_m2": surf_unit,
            "mgmt_rate_%":     mgmt_rate * 100,
            "margin_rate_%":   margin_rate * 100,
        },
    }


# ---------------------------------------------------------------------------
# 출력
# ---------------------------------------------------------------------------

def print_estimate(e: dict):
    w = e["_detail"]
    b = e["breakdown"]
    sep = "-" * 60

    print("=" * 60)
    print(f"  견적서 샘플 — {e['file']}")
    print("=" * 60)
    print(f"  재질   : {e['material']}    두께: {e['thickness_mm']} mm")
    print(f"  중량   : {e['weight_kg']} kg    수량: {e['qty']} ea")
    print(f"  절곡   : {w['bends']}회  {w['bend_length_m']}m  ({e['bend_mode']})")
    print(f"  후처리 : {e['surface_type']}  ({w['surface_area_m2']} m²)")
    print(sep)
    print(f"  {'항목':<12} {'수량/규모':<20} {'단가':<12} {'금액':>10}")
    print(sep)

    def row(label, qty_str, unit_str, amount):
        print(f"  {label:<12} {qty_str:<20} {unit_str:<12} {amount:>10,} 원")

    row("재료비",   f"{w['weight_kg']} kg",
        f"{w['mat_unit_per_kg']:,} 원/kg",   b["재료비"])
    row("절단비",   f"{w['cut_m']} m",
        f"{w['cut_unit_per_m']:,} 원/m",    b["절단비"])
    row("피어싱비", f"{w['holes']} 개",
        f"{w['pierce_unit']:,} 원/개",      b["피어싱비"])
    row("절곡(셋업)", f"{w['bends']} 회",
        f"{w['bend_setup_unit']:,} 원/회",  w["bend_setup_cost"])
    row("절곡(길이)", f"{w['bend_length_m']} m",
        f"{w['bend_per_m_unit']:,} 원/m",  w["bend_length_cost"])
    if b["특수가공비"]:
        row("특수가공비", "-", "-",          b["특수가공비"])
    row("후처리비", f"{w['surface_area_m2']} m²",
        f"{w['surf_unit_per_m2']:,} 원/m²", b["후처리비"])
    print(sep)
    row("소계",     "", "",                  b["소계"])
    row(f"관리비({w['mgmt_rate_%']:.0f}%)",   "", "", b["관리비"])
    row(f"마진({w['margin_rate_%']:.0f}%)",   "", "", b["마진"])
    print(sep)
    print(f"  {'단가':>34} {e['unit_price']:>10,} 원")
    print(f"  {'× 수량 ' + str(e['qty']):>34} {e['total_price']:>10,} 원")
    print("=" * 60)

    if e["warnings"]:
        print("  [주의]")
        for w_msg in e["warnings"]:
            print(f"    - {w_msg}")
        print()


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    base      = Path(__file__).parent
    seed_path = base.parent / "pricing_seed.json"
    pricing   = load_pricing(seed_path)

    for dxf_name, kwargs in [
        ("Drawing2.dxf",         {"bend_mode": "P4",      "surface_type": "분체도장", "qty": 1}),
        ("하부장C 프레임판-01.dxf", {"bend_mode": "general", "surface_type": "분체도장", "qty": 2}),
    ]:
        parsed = parse_dxf(str(base / dxf_name))
        est    = calculate_estimate(parsed, pricing, **kwargs)
        print_estimate(est)
