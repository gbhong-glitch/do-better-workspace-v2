#!/usr/bin/env python3
"""
심플라인 도면 통합 파서
==========================
검증된 인식 규칙(예제.dxf 기준)을 한 곳에 모은 파서.

도면 구조:
  도면 1장
   ├─ 용접도(조립체) 좌  = 부품 -01   (X < X_SPLIT)
   │    └─ 세부부품 N개 (각각 재단방식 + 절곡)
   └─ 용접도(조립체) 우  = 부품 -02   (X > X_SPLIT)
        └─ 세부부품 M개

인식 규칙:
  1. 부품(조립체) 구분: '용접도'/'자품번' 레이어 텍스트의 X좌표 (X_SPLIT 기준)
  2. 세부부품 = 재단방식 레이어(레이저/복합기/NCT/절단)의 텍스트 1개
  3. 절곡 = 굽힘선아래로/위로 LINE을 같은 부품 내 Y최근접 재단라벨에 배정
  4. 전개도(재단 길이용) = 굽힘선이 포함된 영역 (삼각도/등각도엔 굽힘선 없음)
  5. 파이프 절단 = '절단' 라벨 근처의 표(품번/규격/재질/수량/길이/각도)
  6. 특수가공 = 블록(INSERT) 이름 패턴
  7. 재질/두께/수량 = SW_노트 텍스트 (세부부품 Y근접)

미해결(정밀도 보완 예정):
  - 부품 경계에서 굽힘선이 인접 세부부품으로 새는 경우가 있어
    재단 길이가 일부 부정확. 여러 도면으로 검증하며 개선 필요.
"""

import sys
import os
import math
import re
from collections import defaultdict

try:
    import ezdxf
except ImportError:
    print("ezdxf 필요: pip install ezdxf --break-system-packages")
    sys.exit(1)

# ── 도면 양식 파라미터 (도면 규격 바뀌면 조정) ──
X_SPLIT = 8000                 # 좌(-01)/우(-02) 경계 X
CUT_LAYERS = ["레이저", "복합기", "NCT", "절단"]
BEND_LAYERS = ["굽힘선아래로", "굽힘선위로"]
OUTLINE_LAYER = "외형선"
NOTE_LAYER = "SW_노트"


def side(x):
    return "-01" if x < X_SPLIT else "-02"


def get_text(e):
    t = e.dxftype()
    if t == "TEXT":
        return e.dxf.text.strip()
    if t == "MTEXT":
        return e.text.strip()
    return None


def classify_block(name):
    n = name.upper()
    if "SW_" in n or "CENTERMARK" in n or "NOTE_" in n:
        return None
    if name.startswith("A$C") or name.startswith("*"):
        return None
    if "BUR" in n and "UP" in n:
        return "버링업"
    if "EM" in n and "UP" in n:
        return "엠보싱업"
    if "버링탭" in name:
        return "버링탭"
    if "TAP" in n:
        return "탭가공"
    if "자석" in name:
        return "자석부착"
    if "RUBBER" in n:
        return "러버"
    return "_unknown:" + name


def parse(dxf_path):
    doc = ezdxf.readfile(dxf_path)
    msp = doc.modelspace()

    # 1) 조립체(용접도) 단위
    assemblies = {}  # side -> {name}
    for e in msp.query('*[layer=="자품번"]'):
        txt = get_text(e)
        if txt:
            txt = re.sub(r"\{.*?;|\}", "", txt)  # \H0.75x; 등 제거
            try:
                assemblies[side(e.dxf.insert.x)] = txt
            except AttributeError:
                pass

    # 2) 세부부품 = 재단방식 라벨
    labels = []  # (cut, x, y, side)
    for ln in CUT_LAYERS:
        for e in msp.query(f'*[layer=="{ln}"]'):
            if e.dxftype() not in ("TEXT", "MTEXT"):
                continue
            try:
                x, y = e.dxf.insert.x, e.dxf.insert.y
            except AttributeError:
                continue
            labels.append({"cut": ln, "x": x, "y": y, "side": side(x),
                           "bends": 0, "mat": "", "thick": "", "qty": "", "cut_len_m": 0.0})

    # 3) 절곡 → 같은 side 내 Y최근접 라벨
    bends = []
    for ln in BEND_LAYERS:
        for e in msp.query(f'LINE[layer=="{ln}"]'):
            mx = (e.dxf.start.x + e.dxf.end.x) / 2
            my = (e.dxf.start.y + e.dxf.end.y) / 2
            bends.append((mx, my, e.dxf.start.x, e.dxf.start.y, e.dxf.end.x, e.dxf.end.y))

    bend_assign = defaultdict(list)
    for mx, my, x1, y1, x2, y2 in bends:
        cand = [(abs(my - L["y"]), i) for i, L in enumerate(labels) if L["side"] == side(mx)]
        if cand:
            idx = min(cand)[1]
            labels[idx]["bends"] += 1
            bend_assign[idx].append((x1, y1, x2, y2))

    # 4) 전개도 재단길이 = 굽힘선 바운딩 내 외형선 길이
    outline = list(msp.query(f'*[layer=="{OUTLINE_LAYER}"]'))
    for i, L in enumerate(labels):
        bl = bend_assign.get(i, [])
        if not bl:
            continue
        bx = [c for b in bl for c in (b[0], b[2])]
        by = [c for b in bl for c in (b[1], b[3])]
        pad = 50
        box = (min(bx) - pad, max(bx) + pad, min(by) - pad, max(by) + pad)
        total = sum(_entity_len(e) for e in outline if _in_box(_entity_center(e), box))
        L["cut_len_m"] = round(total / 1000, 2)

    # 5) 재질/두께/수량 노트 (세부부품 Y근접)
    notes = []
    for e in msp.query(f'*[layer=="{NOTE_LAYER}"]'):
        txt = get_text(e)
        if not txt:
            continue
        try:
            notes.append((e.dxf.insert.x, e.dxf.insert.y, txt))
        except AttributeError:
            pass
    for L in labels:
        near = [(x, y, t) for x, y, t in notes if side(x) == L["side"] and abs(y - L["y"]) < 1100]
        for x, y, t in near:
            if "SPCC" in t or "SUS" in t or t.strip() in ("HR", "SGCC", "AL"):
                L["mat"] = t.strip()
            elif re.match(r"^[\d.]+ ?t$", t.strip()):
                L["thick"] = t.strip()
            elif "ea" in t.lower():
                L["qty"] = t.strip()

    # 6) 파이프 절단 표 (절단 라벨 근처)
    pipes = _parse_pipe_table(msp)

    # 7) 특수가공
    feats = defaultdict(int)
    for e in msp.query("INSERT"):
        c = classify_block(e.dxf.name)
        if c:
            feats[c] += 1

    return {"assemblies": assemblies, "parts": labels, "pipes": pipes, "features": dict(feats)}


def _entity_len(e):
    t = e.dxftype()
    try:
        if t == "LINE":
            return math.hypot(e.dxf.end.x - e.dxf.start.x, e.dxf.end.y - e.dxf.start.y)
        if t == "CIRCLE":
            return 2 * math.pi * e.dxf.radius
        if t == "ARC":
            return 2 * math.pi * e.dxf.radius * (abs(e.dxf.end_angle - e.dxf.start_angle) % 360) / 360
        if t == "LWPOLYLINE":
            pts = list(e.get_points("xy"))
            L = sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
            if e.closed and len(pts) > 1:
                L += math.hypot(pts[0][0]-pts[-1][0], pts[0][1]-pts[-1][1])
            return L
        if t == "SPLINE":
            pts = [p for p in e.flattening(0.5)]
            return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
    except Exception:
        return 0
    return 0


def _entity_center(e):
    t = e.dxftype()
    try:
        if t == "LINE":
            return ((e.dxf.start.x + e.dxf.end.x) / 2, (e.dxf.start.y + e.dxf.end.y) / 2)
        if t in ("CIRCLE", "ARC"):
            return (e.dxf.center.x, e.dxf.center.y)
        if t == "LWPOLYLINE":
            pts = list(e.get_points("xy"))
            return (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))
        if t == "SPLINE":
            pts = [p for p in e.flattening(2.0)]
            if pts:
                return (sum(p[0] for p in pts)/len(pts), sum(p[1] for p in pts)/len(pts))
    except Exception:
        return None
    return None


def _in_box(c, box):
    if not c:
        return False
    return box[0] <= c[0] <= box[1] and box[2] <= c[1] <= box[3]


def _parse_pipe_table(msp):
    """절단 표(품번/규격/재질/수량/길이/각도) 파싱. 헤더='품번' 기준."""
    texts = []
    for e in msp:
        if e.dxftype() not in ("TEXT", "MTEXT"):
            continue
        if e.dxf.layer != "0":
            continue
        try:
            x, y = e.dxf.insert.x, e.dxf.insert.y
        except AttributeError:
            continue
        txt = get_text(e)
        if txt:
            texts.append((x, y, txt.replace("\\U+00B0", "°")))

    # '품번' 헤더 찾기
    headers = [(x, y) for x, y, t in texts if t == "품번"]
    pipes = []
    for hx, hy in headers:
        # 헤더 아래(Y < hy) 같은 X대(±1500)의 행들
        rows = defaultdict(list)
        for x, y, t in texts:
            if abs(x - hx) < 1500 and hy - 300 < y < hy:
                key = round(y / 30)
                rows[key].append((x, t))
        for k in sorted(rows, reverse=True):
            cols = [t for x, t in sorted(rows[k])]
            if len(cols) >= 5 and cols[0].isdigit():
                pipes.append(cols)
    return pipes


def main(dxf_path):
    r = parse(dxf_path)
    print("=" * 56)
    print(f"심플라인 도면 인식 — {os.path.basename(dxf_path)}")
    print("=" * 56)

    print("\n[조립체 (용접도)]")
    for sd, name in sorted(r["assemblies"].items()):
        print(f"  {sd}: {name}")

    print("\n[세부부품]")
    for sd in ["-01", "-02"]:
        parts = [p for p in r["parts"] if p["side"] == sd]
        if not parts:
            continue
        print(f"  부품 {sd} ({len(parts)}개):")
        for p in sorted(parts, key=lambda p: -p["y"]):
            print(f"    재단 {p['cut']:<4} 절곡 {p['bends']:>2}곡  "
                  f"재단길이 {p['cut_len_m']:>5}m  {p['mat']:<5}{p['thick']:<6}{p['qty']}")

    if r["pipes"]:
        print("\n[파이프 절단]")
        for row in r["pipes"]:
            print("  " + " · ".join(row))

    print("\n[특수가공]")
    for k, v in sorted(r["features"].items()):
        print(f"  {k}: {v}개")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)
    main(sys.argv[1])
