#!/usr/bin/env python3
"""
절곡비 통합 계산 모듈
- 자동: DXF 굽힘선 레이어에서 산출된 절곡(bending) 길이 리스트
- 수동: 헤밍/V컷/포밍/비딩은 사용자가 입력 (DXF 자동분류 불가 → 수동)

bending_pricing.json 단가표를 사용한다.
"""

import json
import os

PRICING_PATH = os.path.join(os.path.dirname(__file__), "bending_pricing.json")


def load_pricing():
    with open(PRICING_PATH, encoding="utf-8") as f:
        return json.load(f)["bending_processes"]


def _tier_price(tiers, length):
    for t in tiers:
        if t["max_mm"] is None or length <= t["max_mm"]:
            return t["price"]
    return tiers[-1]["price"]


def calc_bending(auto_bend_lengths, manual, pricing=None):
    """
    auto_bend_lengths: list[float]
        DXF에서 자동 산출된 '절곡' 굽힘선 길이(mm) 리스트.
        예: [400.0, 800.0, 1200.0]

    manual: dict
        수동 입력 공정. 단위 주의:
        {
            "hemming": [list of mm],   # 헤밍 각 선의 길이(mm) 리스트 (구간별 단가)
            "v_cutting": float,        # V컷 총길이(mm)
            "forming": int,            # 포밍 개수
            "beading": int,            # 비딩 개수
        }
        없는 항목은 생략 가능.

    반환: dict (공정별 내역 + 합계)
    """
    if pricing is None:
        pricing = load_pricing()

    result = {"items": [], "total": 0.0}

    # ── 자동: 절곡 (길이 구간별) ──
    bp = pricing["bending"]
    bend_cost = 0.0
    for L in auto_bend_lengths:
        bend_cost += _tier_price(bp["tiers"], L)
    if auto_bend_lengths:
        result["items"].append({
            "proc": "절곡(자동)", "count": len(auto_bend_lengths),
            "detail": f"총길이 {sum(auto_bend_lengths):.0f}mm", "cost": bend_cost
        })
        result["total"] += bend_cost

    # ── 수동: 헤밍 (길이 구간별) ──
    hems = manual.get("hemming", [])
    if hems:
        hp = pricing["hemming"]
        hem_cost = sum(_tier_price(hp["tiers"], L) for L in hems)
        result["items"].append({
            "proc": "헤밍(수동)", "count": len(hems),
            "detail": f"총길이 {sum(hems):.0f}mm", "cost": hem_cost
        })
        result["total"] += hem_cost

    # ── 수동: V컷팅 (길이 비례) ──
    vlen = manual.get("v_cutting", 0)
    if vlen:
        vp = pricing["v_cutting"]
        v_cost = vlen * vp["per_mm"]
        result["items"].append({
            "proc": "V컷팅(수동)", "count": 1,
            "detail": f"{vlen:.0f}mm × {vp['per_mm']}원/mm", "cost": v_cost
        })
        result["total"] += v_cost

    # ── 수동: 포밍 / 비딩 (개당 단일) ──
    for key, label in [("forming", "포밍(수동)"), ("beading", "비딩(수동)")]:
        n = manual.get(key, 0)
        if n:
            price = pricing[key]["price"]
            cost = price * n
            result["items"].append({
                "proc": label, "count": n,
                "detail": f"{n}개 × {price:.0f}원", "cost": cost
            })
            result["total"] += cost

    return result


def print_result(r):
    print("─" * 50)
    for it in r["items"]:
        print(f"  {it['proc']:<12} {it['count']:>3}개  {it['detail']:<22} {it['cost']:>8.1f}원")
    print("─" * 50)
    print(f"  절곡 공정 합계(셋업 제외): {r['total']:,.1f}원")


if __name__ == "__main__":
    # 데모: 자동 절곡 3개 + 수동(헤밍2, V컷, 포밍, 비딩)
    auto = [400.0, 800.0, 1200.0]
    manual = {
        "hemming": [300.0, 700.0],
        "v_cutting": 300.0,
        "forming": 2,
        "beading": 1,
    }
    print_result(calc_bending(auto, manual))
