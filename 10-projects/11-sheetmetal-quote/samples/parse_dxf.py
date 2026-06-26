"""
심플라인 DXF 파서 PoC
레이어 규칙:
  외형선      - 부품 윤곽 + 구멍 (LINE/ARC/LWPOLYLINE/CIRCLE)
  굽힘선아래로 - 절곡선 (LINE)
  굽힘선위로   - 절곡선 (LINE)
  SW_노트     - 제목란 MTEXT (재질/두께/중량/수량)
  나머지       - 무시
"""

import io
import math
import re
import sys
from pathlib import Path
from typing import Optional

import ezdxf

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from ezdxf.entities import DXFGraphic


# ---------------------------------------------------------------------------
# 유니코드 이스케이프 디코더 (\U+XXXX → 문자)
# ---------------------------------------------------------------------------
_UNICODE_RE = re.compile(r"\\U\+([0-9A-Fa-f]{4})")

def decode_dxf_text(text: str) -> str:
    """DXF MTEXT 유니코드 이스케이프 + MTEXT 서식 코드 제거."""
    # \U+XXXX 디코딩
    text = _UNICODE_RE.sub(lambda m: chr(int(m.group(1), 16)), text)
    # MTEXT 서식 태그 제거 ({\fArial;...}, \P, \L 등)
    text = re.sub(r"\{[^}]*\}", "", text)
    text = re.sub(r"\\[A-Za-z][^;]*;?", "", text)
    text = text.replace("\\P", "\n").replace("\\~", " ")
    return text.strip()


# ---------------------------------------------------------------------------
# SW_노트 MTEXT 파싱 — 재질/두께/중량/수량 추출
# ---------------------------------------------------------------------------
_MATERIAL_RE = re.compile(r"(SPCC|SUS304|SUS316|AL5052|AL6061|SECC|SGCC|SS400)", re.I)
_THICKNESS_RE = re.compile(r"(\d+(?:\.\d+)?)\s*t\b", re.I)
_WEIGHT_RE    = re.compile(r"(\d+(?:\.\d+)?)\s*kg", re.I)
_QTY_RE       = re.compile(r"(\d+)\s*(?:ea|pcs?|개)", re.I)


def parse_sw_note(mtext_content: str) -> dict:
    text = decode_dxf_text(mtext_content)
    result = {
        "material": None,
        "thickness_mm": None,
        "weight_kg": None,
        "qty": None,
    }
    m = _MATERIAL_RE.search(text)
    if m:
        result["material"] = m.group(1).upper()
    m = _THICKNESS_RE.search(text)
    if m:
        result["thickness_mm"] = float(m.group(1))
    m = _WEIGHT_RE.search(text)
    if m:
        result["weight_kg"] = float(m.group(1))
    m = _QTY_RE.search(text)
    if m:
        result["qty"] = int(m.group(1))
    return result


# ---------------------------------------------------------------------------
# 외형선 레이어 — 절단장 + 구멍 수
# ---------------------------------------------------------------------------

def _line_length(entity) -> float:
    s = entity.dxf.start
    e = entity.dxf.end
    return math.hypot(e.x - s.x, e.y - s.y)


def _arc_length(entity) -> float:
    r = entity.dxf.radius
    start_angle = math.radians(entity.dxf.start_angle)
    end_angle   = math.radians(entity.dxf.end_angle)
    if end_angle < start_angle:
        end_angle += 2 * math.pi
    return r * (end_angle - start_angle)


def _lwpoly_length(entity) -> float:
    pts = list(entity.get_points("xy"))
    if not pts:
        return 0.0
    total = 0.0
    for i in range(len(pts) - 1):
        dx = pts[i+1][0] - pts[i][0]
        dy = pts[i+1][1] - pts[i][1]
        total += math.hypot(dx, dy)
    if entity.is_closed:
        dx = pts[0][0] - pts[-1][0]
        dy = pts[0][1] - pts[-1][1]
        total += math.hypot(dx, dy)
    return total


def _circle_circumference(entity) -> float:
    return 2 * math.pi * entity.dxf.radius


def parse_outline(msp, layer_name: str = "외형선") -> dict:
    """절단장(mm) + 구멍 수(CIRCLE) 추출."""
    cut_length = 0.0
    hole_count = 0

    for e in msp:
        if e.dxf.layer != layer_name:
            continue
        t = e.dxftype()
        if t == "LINE":
            cut_length += _line_length(e)
        elif t == "ARC":
            cut_length += _arc_length(e)
        elif t == "LWPOLYLINE":
            cut_length += _lwpoly_length(e)
        elif t == "CIRCLE":
            cut_length += _circle_circumference(e)
            hole_count += 1

    return {
        "cut_length_mm": round(cut_length, 2),
        "hole_count": hole_count,
    }


# ---------------------------------------------------------------------------
# 굽힘선 레이어 — 절곡 횟수
# ---------------------------------------------------------------------------

def parse_bends(msp) -> dict:
    up_lines   = [e for e in msp if e.dxf.layer == "굽힘선위로"  and e.dxftype() == "LINE"]
    down_lines = [e for e in msp if e.dxf.layer == "굽힘선아래로" and e.dxftype() == "LINE"]
    bend_up   = len(up_lines)
    bend_down = len(down_lines)
    len_up    = sum(_line_length(e) for e in up_lines)
    len_down  = sum(_line_length(e) for e in down_lines)
    return {
        "bend_up":              bend_up,
        "bend_down":            bend_down,
        "bend_total":           bend_up + bend_down,
        "bend_length_up_mm":   round(len_up, 2),
        "bend_length_down_mm": round(len_down, 2),
        "bend_length_mm":      round(len_up + len_down, 2),
    }


# ---------------------------------------------------------------------------
# 순중량 계산 (폴백 전용 — SW_노트에 중량이 없을 때)
# ---------------------------------------------------------------------------
DENSITY = {"SPCC": 7.85, "SECC": 7.85, "SGCC": 7.85, "SS400": 7.85,
           "SUS304": 7.93, "SUS316": 7.93,
           "AL5052": 2.71, "AL6061": 2.71}

def _lwpoly_area(entity) -> float:
    pts = list(entity.get_points("xy"))
    if len(pts) < 3:
        return 0.0
    n = len(pts)
    area = sum(pts[i][0]*pts[(i+1)%n][1] - pts[(i+1)%n][0]*pts[i][1] for i in range(n))
    return abs(area) / 2.0


def calc_flat_area_mm2(msp) -> float:
    """외형선 LWPOLYLINE 면적 합산 (구멍 미차감 — 근사값)."""
    return sum(_lwpoly_area(e) for e in msp
               if e.dxf.layer == "외형선" and e.dxftype() == "LWPOLYLINE")


def calc_surface_area_mm2(flat_area_mm2: float, cut_length_mm: float,
                           thickness_mm: float) -> float:
    """표면적 근사: 양면 + 측면(외곽둘레 × 두께).
    절단장은 외곽+구멍 합산이므로 측면 과대 추정될 수 있음 — 근사값."""
    return flat_area_mm2 * 2 + cut_length_mm * thickness_mm


def calc_weight_fallback(msp, material: Optional[str], thickness_mm: Optional[float]) -> Optional[float]:
    if not material or not thickness_mm:
        return None
    density = DENSITY.get(material.upper())
    if not density:
        return None

    area_mm2 = calc_flat_area_mm2(msp)
    if area_mm2 == 0:
        return None

    area_cm2   = area_mm2 / 100.0
    thick_cm   = thickness_mm / 10.0
    volume_cm3 = area_cm2 * thick_cm
    return round(volume_cm3 * density / 1000.0, 4)  # kg


# ---------------------------------------------------------------------------
# 레이어 목록 확인 (디버그용)
# ---------------------------------------------------------------------------

def list_layers(doc) -> list[str]:
    return [layer.dxf.name for layer in doc.layers]


# ---------------------------------------------------------------------------
# 비표준 도면 판정
# ---------------------------------------------------------------------------
STANDARD_LAYERS = {"외형선", "굽힘선아래로", "굽힘선위로", "SW_노트"}

def is_standard(doc) -> bool:
    layers = {layer.dxf.name for layer in doc.layers}
    return bool(layers & STANDARD_LAYERS)  # 1개라도 있으면 partial standard


# ---------------------------------------------------------------------------
# 메인 파서
# ---------------------------------------------------------------------------

def parse_dxf(path: str) -> dict:
    result = {
        "file": Path(path).name,
        "standard": False,
        "material": None,    "material_ok": False,
        "thickness_mm": None, "thickness_ok": False,
        "weight_kg": None,   "weight_ok": False,
        "weight_source": None,
        "qty": None,         "qty_ok": False,
        "bend_up": None,      "bend_down": None,
        "bend_total": None,   "bend_length_mm": None, "bend_ok": False,
        "cut_length_mm": None, "cut_ok": False,
        "hole_count": None,  "hole_ok": False,
    }

    try:
        doc = ezdxf.readfile(path)
    except Exception as exc:
        result["error"] = str(exc)
        return result

    msp = doc.modelspace()
    layers = {layer.dxf.name for layer in doc.layers}
    result["standard"] = bool(layers & STANDARD_LAYERS)

    # --- SW_노트 파싱 ---
    note_raw = []
    for e in msp:
        if e.dxf.layer == "SW_노트" and e.dxftype() == "MTEXT":
            note_raw.append(e.text)
    combined_note = "\n".join(note_raw)
    meta = parse_sw_note(combined_note) if note_raw else {}

    result["material"]     = meta.get("material")
    result["material_ok"]  = result["material"] is not None
    result["thickness_mm"] = meta.get("thickness_mm")
    result["thickness_ok"] = result["thickness_mm"] is not None
    result["qty"]          = meta.get("qty")
    result["qty_ok"]       = result["qty"] is not None

    # --- 중량 (1순위: 제목란, 2순위: 역산) ---
    if meta.get("weight_kg") is not None:
        result["weight_kg"]     = meta["weight_kg"]
        result["weight_ok"]     = True
        result["weight_source"] = "SW_노트"
    else:
        fb = calc_weight_fallback(msp, result["material"], result["thickness_mm"])
        if fb is not None:
            result["weight_kg"]     = fb
            result["weight_ok"]     = True
            result["weight_source"] = "면적역산(근사)"
        else:
            result["weight_source"] = "미검출"

    # --- 절곡 ---
    bends = parse_bends(msp)
    result["bend_up"]         = bends["bend_up"]
    result["bend_down"]       = bends["bend_down"]
    result["bend_total"]      = bends["bend_total"]
    result["bend_length_mm"]  = bends["bend_length_mm"]
    result["bend_ok"]         = bends["bend_total"] > 0 or "굽힘선아래로" in layers or "굽힘선위로" in layers

    # --- 절단장·구멍 ---
    outline = parse_outline(msp)
    result["cut_length_mm"] = outline["cut_length_mm"]
    result["hole_count"]    = outline["hole_count"]
    result["cut_ok"]        = outline["cut_length_mm"] > 0
    result["hole_ok"]       = True  # 0개도 유효

    # --- 면적·표면적 ---
    # SW_노트 중량이 있으면 역산이 LWPOLYLINE 면적보다 정확 (LINE+ARC 외형선은 면적 직접 계산 불가)
    if result["weight_source"] == "SW_노트" and result["weight_kg"] and result["thickness_mm"] and result["material"]:
        density = DENSITY.get(result["material"].upper(), 7.85)
        area_m2 = result["weight_kg"] / (result["thickness_mm"] / 1000.0 * density * 1000)
        result["flat_area_mm2"]    = round(area_m2 * 1e6, 2)
        result["surface_area_mm2"] = round(
            calc_surface_area_mm2(area_m2 * 1e6, outline["cut_length_mm"], result["thickness_mm"]), 2
        )
    else:
        flat_area = calc_flat_area_mm2(msp)
        result["flat_area_mm2"] = round(flat_area, 2)
        if flat_area > 0 and result["thickness_mm"]:
            result["surface_area_mm2"] = round(
                calc_surface_area_mm2(flat_area, outline["cut_length_mm"], result["thickness_mm"]), 2
            )
        else:
            result["surface_area_mm2"] = None

    return result


# ---------------------------------------------------------------------------
# 출력 포맷
# ---------------------------------------------------------------------------

def ok(flag: bool) -> str:
    return "[OK]" if flag else "[--]"


def print_report(r: dict):
    print("=" * 60)
    print(f"  파일: {r['file']}")
    print(f"  도면 유형: {'표준' if r['standard'] else '⚠ 비표준 (수동 입력 필요)'}")
    if "error" in r:
        print(f"  오류: {r['error']}")
        return
    print("-" * 60)
    print(f"  {ok(r['material_ok'])} 재질        : {r['material'] or '미검출'}")
    print(f"  {ok(r['thickness_ok'])} 두께(mm)    : {r['thickness_mm'] or '미검출'}")
    print(f"  {ok(r['weight_ok'])} 순중량(kg)  : {r['weight_kg'] or '미검출'}  [{r['weight_source']}]")
    print(f"  {ok(r['qty_ok'])} 수량        : {r['qty'] or '미검출'}")
    print("-" * 60)
    bend_m = (r['bend_length_mm'] or 0) / 1000
    print(f"  {ok(r['bend_ok'])} 절곡 횟수   : 총 {r['bend_total']}회  (위로 {r['bend_up']} / 아래로 {r['bend_down']})  길이 {bend_m:.3f} m")
    print(f"  {ok(r['cut_ok'])} 절단장(mm)  : {r['cut_length_mm']}")
    print(f"  {ok(r['hole_ok'])} 구멍 수     : {r['hole_count']}개")
    print("=" * 60)
    print()


# ---------------------------------------------------------------------------
# 실행
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    base = Path(__file__).parent
    targets = sys.argv[1:] if len(sys.argv) > 1 else [
        str(base / "Drawing2.dxf"),
        str(base / "하부장C 프레임판-01.dxf"),
    ]

    for path in targets:
        r = parse_dxf(path)
        print_report(r)
