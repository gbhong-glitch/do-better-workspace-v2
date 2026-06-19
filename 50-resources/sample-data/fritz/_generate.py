#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
프릳츠(Fritz Coffee Company) AX 데모용 더미데이터 생성기.

실제 비즈니스 구조 기반:
  - 직영 매장 6곳 (POS 매출) + 메뉴·원가 마스터
  - B2B 원두 도매 납품 (거래처 발주 + 거래처 마스터)

매장명·메뉴·블렌드는 리서치(fritz.co.kr, 2026-06-19)로 확인된 실제값.
원가·임대료·도매단가·결제조건은 업계 상식 기반 현실 추정값(공개 안 됨).
거래처 실명은 비공개/민감 → 현실적 가공명으로 생성.

출력 (utf-8-sig, BOM — 엑셀 호환):
  store_sales.csv   직영 매장 POS 매출 (매장×날짜×메뉴)
  menu_master.csv   메뉴·원가 마스터
  b2b_orders.csv    B2B 발주 (거래처×날짜×품목)
  b2b_clients.csv   B2B 거래처 마스터
"""

import csv
import random
from datetime import date, timedelta
from collections import defaultdict

random.seed(20260519)  # 재현 가능
OUT = __file__.rsplit("/", 1)[0]

# 분석 기간: 2026년 5월 (월간 회의 대상)
START = date(2026, 5, 1)
DAYS = 31
DATES = [START + timedelta(days=i) for i in range(DAYS)]


# ─────────────────────────────────────────────────────────────
# 1. 메뉴·원가 마스터
# ─────────────────────────────────────────────────────────────
# category, menu_name, price(매장 판매가), cogs(식자재 원가)
# 음료 가격은 도화점 기준 리서치값. 원가는 업계 상식(추정).
MENU = [
    # 에스프레소 음료
    ("에스프레소",   "에스프레소",          4900,  650),
    ("에스프레소",   "아메리카노",          4900,  750),
    ("에스프레소",   "롱블랙",              4900,  750),
    ("에스프레소",   "플랫화이트",          5400, 1250),
    ("에스프레소",   "카푸치노",            5400, 1250),
    ("에스프레소",   "카페라떼",            5400, 1300),
    ("에스프레소",   "바닐라라떼",          5800, 1500),
    ("에스프레소",   "콜드브루라떼",        5800, 1450),
    ("에스프레소",   "카페모카",            6200, 1700),
    # 필터/브루잉
    ("필터",         "브루잉 커피",          6000, 1100),
    ("필터",         "콜드브루",            5500, 1000),
    # 베이커리 (프릳츠 핵심 차별점)
    ("베이커리",     "크루아상",            3800, 1350),
    ("베이커리",     "플레인 스콘",          4000, 1300),
    ("베이커리",     "단팥빵",              2700,  950),
    ("베이커리",     "카스타드 크림빵",      2400,  900),
    ("베이커리",     "소시지빵",            5100, 2050),
    ("베이커리",     "호두 크랜베리 깡빠뉴",  5400, 2150),
    ("베이커리",     "빵 오 누텔라",         5400, 2200),
    ("베이커리",     "블루베리 파이",        4800, 1950),
    # 원두 리테일 (매장 판매) — 블렌드 3종 균일가 200g 16,000
    ("원두리테일",   "올드독 블렌드 200g",       16000, 5800),
    ("원두리테일",   "잘되어가시나 블렌드 200g",  16000, 5800),
    ("원두리테일",   "서울 시네마 블렌드 200g",   16000, 5800),
    ("원두리테일",   "디카페인 콜롬비아 200g",    17000, 6400),
]

MENU_IDS = {}
with open(f"{OUT}/menu_master.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["menu_id", "category", "menu_name", "price", "cogs", "margin_per_unit", "margin_rate"])
    for i, (cat, name, price, cogs) in enumerate(MENU, 1):
        mid = f"M{i:03d}"
        MENU_IDS[name] = (mid, cat, price, cogs)
        margin = price - cogs
        rate = round(margin / price * 100, 1)
        w.writerow([mid, cat, name, price, cogs, margin, rate])


# ─────────────────────────────────────────────────────────────
# 2. 직영 매장 파라미터 (POS 생성용) — 비용은 store_sales 컬럼에 반영
# ─────────────────────────────────────────────────────────────
# 매장명·입지는 리서치 확인값. 임대료·인건비·트래픽은 입지·규모 기반 현실 추정값(추정).
# 도화점은 본점·대형·제빵팀 병설이라 임대료+인건비 고정비가 압도적으로 무겁다.
# → 매출은 1등이지만 영업이익(절대액)은 고정비에 눌려 장충/성산에 역전된다 ("매출1등 != 수익1등").
# 인건비는 매출의 ~30% 수준(스페셜티 카페 현실). 도화 본점은 제빵팀 병설로 45%대(고정비 무거움).
# 기타운영비(other_opex)는 매출의 15%로 매장별 매출에 비례 산정(카드수수료·수도광열·소모품·판촉·감가상각·본사배분).
OTHER_OPEX_RATE = 0.15
STORES = {
    "도화점":   dict(loc="본점·오피스가(대형·제빵병설)", rent=21_000_000, labor=38_000_000, traffic=1.00, mix="balanced"),
    "양재점":   dict(loc="오피스가",                    rent=8_500_000,  labor=13_000_000, traffic=0.62, mix="office"),
    "장충점":   dict(loc="번화가·신규",                 rent=9_500_000,  labor=18_000_000, traffic=0.70, mix="cafe"),
    "독립문점": dict(loc="주택가·상권복합",              rent=6_000_000,  labor=12_500_000, traffic=0.48, mix="residential"),
    "원서점":   dict(loc="주택가(소형·조용)",           rent=5_000_000,  labor=10_000_000, traffic=0.38, mix="residential"),
    "성산점":   dict(loc="제주·관광지",                 rent=7_000_000,  labor=15_000_000, traffic=0.55, mix="tourist"),
}

# 매장 입지별 메뉴 믹스 가중치 (카테고리 선호)
MIX_WEIGHT = {
    "balanced":    {"에스프레소": 1.0, "필터": 1.0, "베이커리": 1.0, "원두리테일": 1.0},
    "office":      {"에스프레소": 1.6, "필터": 0.8, "베이커리": 0.7, "원두리테일": 0.4},  # 빠른 음료 위주
    "cafe":        {"에스프레소": 1.1, "필터": 1.2, "베이커리": 1.3, "원두리테일": 0.7},
    "residential": {"에스프레소": 0.9, "필터": 1.0, "베이커리": 1.2, "원두리테일": 1.1},  # 동네 단골, 원두 구매
    "tourist":     {"에스프레소": 1.0, "필터": 0.9, "베이커리": 1.4, "원두리테일": 1.8},  # 관광객 원두 선물 구매 多
}

CATEGORY_MENUS = {}
for name, (mid, cat, price, cogs) in MENU_IDS.items():
    CATEGORY_MENUS.setdefault(cat, []).append(name)


def is_weekend(d):
    return d.weekday() >= 5


# ─────────────────────────────────────────────────────────────
# 3. 직영 매장 POS 매출 생성
# ─────────────────────────────────────────────────────────────
sales_rows = []
order_seq = 0
for d in DATES:
    weekend = is_weekend(d)
    for store, p in STORES.items():
        # 일 거래 수 기준치: 본점 기준 ~250건/일 (스페셜티 카페 현실 규모)
        base = 250 * p["traffic"]
        if p["mix"] == "office":
            day_factor = 0.55 if weekend else 1.15   # 오피스가는 주말 급감
        elif p["mix"] == "tourist":
            day_factor = 1.45 if weekend else 0.85    # 관광지는 주말 급증
        else:
            day_factor = 1.25 if weekend else 0.95
        n_orders = max(8, int(base * day_factor * random.uniform(0.85, 1.15)))

        mix = MIX_WEIGHT[p["mix"]]

        for _ in range(n_orders):
            order_seq += 1
            order_id = f"POS-{d.strftime('%y%m%d')}-{order_seq:05d}"
            lines = []
            # 음료 1개 거의 항상 (에스프레소/필터)
            drink_cat = random.choices(["에스프레소", "필터"], weights=[mix["에스프레소"], mix["필터"]])[0]
            lines.append(drink_cat)
            # 베이커리
            if random.random() < 0.45 * mix["베이커리"]:
                lines.append("베이커리")
            # 두 번째 음료 (동행)
            if random.random() < 0.30:
                lines.append(random.choices(["에스프레소", "필터"], weights=[mix["에스프레소"], mix["필터"]])[0])
            # 원두 리테일 (가끔 — 관광/주택가에서 多)
            if random.random() < 0.06 * mix["원두리테일"]:
                lines.append("원두리테일")

            for cat in lines:
                menu_name = random.choice(CATEGORY_MENUS[cat])
                mid, mcat, price, cogs = MENU_IDS[menu_name]
                qty = 1
                sales_rows.append([
                    order_id, d.isoformat(), "주말" if weekend else "평일",
                    store, p["loc"], mid, menu_name, mcat, qty, price,
                ])

# 매장별 월매출 → 기타운영비(매출의 15%) 산정 후 비용 3종을 행에 부착
store_month_rev = defaultdict(int)
for r in sales_rows:
    store_month_rev[r[3]] += r[9] * r[8]
store_other_opex = {s: int(round(store_month_rev[s] * OTHER_OPEX_RATE, -4)) for s in STORES}

with open(f"{OUT}/store_sales.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["order_id", "date", "day_type", "store", "store_loc",
                "menu_id", "menu_name", "category", "qty", "unit_price",
                "store_monthly_rent", "store_monthly_labor", "store_monthly_other_opex"])
    for r in sales_rows:
        p = STORES[r[3]]
        w.writerow(r + [p["rent"], p["labor"], store_other_opex[r[3]]])


# ─────────────────────────────────────────────────────────────
# 4. B2B 거래처 마스터
# ─────────────────────────────────────────────────────────────
# 거래처 실명 비공개 → 현실적 가공명. 도매단가/결제조건/납품주기는 업계 상식(추정).
# 도매단가(원/kg): 리테일 환산 80,000/kg 대비 도매 28,000~38,000/kg (물량·등급별).
B2B_CLIENTS = [
    # id, name, type, region, main_blend, wholesale_price/kg, cogs/kg, payment_terms, order_cycle, tier
    ("C01", "연남 로스터리 카페",     "개인카페",  "마포",   "올드독",       33000, 21500, 30, 7,  "A"),
    ("C02", "북촌 한옥카페",          "개인카페",  "종로",   "서울 시네마",   35000, 21500, 30, 14, "B"),
    ("C03", "판교 오피스 카페테리아",  "기업급식",  "성남",   "올드독",       30000, 21500, 60, 7,  "A"),
    ("C04", "을지로 디저트바",        "개인카페",  "중구",   "잘되어가시나",  35000, 21500, 30, 14, "B"),
    ("C05", "제주 게스트하우스 카페",  "숙박병설",  "제주",   "서울 시네마",   34000, 21500, 30, 14, "B"),
    ("C06", "강남 베이커리 체인",      "체인",     "강남",   "올드독",       29000, 21500, 60, 7,  "A"),
    ("C07", "성수 편집숍 카페",       "개인카페",  "성동",   "잘되어가시나",  35000, 21500, 30, 14, "B"),
    ("C08", "분당 브런치 레스토랑",    "외식",     "성남",   "올드독",       31000, 21500, 45, 14, "B"),
    ("C09", "홍대 코워킹 라운지",      "오피스",    "마포",   "서울 시네마",   33000, 21500, 30, 14, "B"),
    ("C10", "이태원 와인바",          "외식",     "용산",   "잘되어가시나",  36000, 21500, 30, 14, "B"),
    ("C11", "여의도 호텔 라운지",      "호텔",     "영등포", "올드독",       30000, 21500, 60, 7,  "A"),
    ("C12", "광교 신도시 카페",        "개인카페",  "수원",   "서울 시네마",   34000, 21500, 30, 14, "C"),
]

with open(f"{OUT}/b2b_clients.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["client_id", "client_name", "client_type", "region", "main_blend",
                "wholesale_price_per_kg", "cogs_per_kg", "payment_terms_days",
                "order_cycle_days", "tier"])
    for row in B2B_CLIENTS:
        w.writerow(row)


# ─────────────────────────────────────────────────────────────
# 5. B2B 발주 데이터 (거래처×날짜×품목)
# ─────────────────────────────────────────────────────────────
# 정기 발주 주기로 생성. 일부 거래처는 5월 후반 발주 급감(이탈 위험 — 미션2의 아하).
BLEND_OPTIONS = ["올드독", "잘되어가시나", "서울 시네마"]
CHURN_RISK = {"C05", "C10"}     # 후반 발주 급감/끊김
GROWING = {"C01", "C06"}        # 발주 증가 추세

b2b_rows = []
b2b_seq = 0
for cid, name, ctype, region, main_blend, wprice, cogs, terms, cycle, tier in B2B_CLIENTS:
    base_kg = {"A": 18, "B": 9, "C": 5}[tier]
    # 이탈 위험 거래처는 월초부터 정상 발주 → 후반 급감이 대비되게 첫 발주를 1~3일로 고정
    if cid in CHURN_RISK:
        day = 1 + random.randint(0, 2)
    else:
        day = 1 + random.randint(0, cycle - 1)  # 첫 발주 오프셋
    while day <= DAYS:
        d = START + timedelta(days=day - 1)
        b2b_seq += 1
        order_id = f"B2B-{d.strftime('%y%m%d')}-{b2b_seq:04d}"

        progress = day / DAYS
        factor = random.uniform(0.9, 1.1)
        if cid in CHURN_RISK and progress > 0.5:
            # 후반 들어 발주량 뚝뚝 감소 (전반은 정상 → 대비가 보이게)
            factor *= max(0.0, 1.0 - (progress - 0.5) * 2.2)
        if cid in GROWING:
            factor *= 1.0 + progress * 0.6                       # 후반 증가

        kg = round(base_kg * factor, 1)
        if kg < 1.0:
            day += cycle  # 발주 스킵 (이탈 신호 — 주기 도래해도 발주 안 함)
            continue

        items = [main_blend]
        if random.random() < 0.35:
            other = random.choice([b for b in BLEND_OPTIONS if b != main_blend])
            items.append(other)
        for idx, blend in enumerate(items):
            line_kg = kg if len(items) == 1 else (round(kg * 0.7, 1) if idx == 0 else round(kg * 0.3, 1))
            if line_kg < 0.5:
                continue
            amount = int(line_kg * wprice)
            b2b_rows.append([
                order_id, d.isoformat(), cid, name, blend,
                line_kg, wprice, amount, terms, tier,
            ])
        day += cycle

with open(f"{OUT}/b2b_orders.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["order_id", "date", "client_id", "client_name", "blend",
                "qty_kg", "unit_price_per_kg", "amount", "payment_terms_days", "tier"])
    w.writerows(b2b_rows)


# ─────────────────────────────────────────────────────────────
# 검증 출력
# ─────────────────────────────────────────────────────────────
print(f"menu_master.csv   : {len(MENU)} 메뉴")
print(f"store_sales.csv   : {len(sales_rows)} 매출 라인")
print(f"b2b_clients.csv   : {len(B2B_CLIENTS)} 거래처")
print(f"b2b_orders.csv    : {len(b2b_rows)} 발주 라인")

cogs_map = {name: c for name, (m, cat, pr, c) in MENU_IDS.items()}
store_rev = defaultdict(int); store_cogs = defaultdict(int)
for r in sales_rows:
    store_rev[r[3]] += r[9] * r[8]
    store_cogs[r[3]] += cogs_map[r[6]] * r[8]
print("\n[검증] 매장별 매출 vs 매장 영업이익 — '매출1등 != 수익1등' 성립 여부:")
print("  (매장 영업이익 = 매출 − 원가 − 임대 − 인건 − 기타운영비. 전사 연결 영업이익률(4.2%)은 본사·로스터리·온라인 포함이라 별개)")
ranking_rev = sorted(STORES, key=lambda s: -store_rev[s])
ranking_op = []
for store, p in STORES.items():
    rev = store_rev[store]; gm = rev - store_cogs[store]
    op = gm - p["rent"] - p["labor"] - store_other_opex[store]
    ranking_op.append((store, op))
    print(f"  {store:6s} 매출 {rev:>11,}  매출총이익 {gm:>11,}  영업이익 {op:>11,}  ({op/rev*100:5.1f}%)")
ranking_op = [s for s, _ in sorted(ranking_op, key=lambda x: -x[1])]
print(f"  매출 순위 : {ranking_rev}")
print(f"  이익 순위 : {ranking_op}")
print(f"  => 1위 역전? {'YES' if ranking_rev[0] != ranking_op[0] else 'NO'}")

half = START + timedelta(days=15)
first = defaultdict(float); second = defaultdict(float)
for r in b2b_rows:
    dd = date.fromisoformat(r[1])
    (first if dd < half else second)[r[2]] += r[5]
print("\n[검증] B2B 거래처 5월 전반/후반 발주량(kg) — 이탈 위험 검출:")
for cid, name, *_ in B2B_CLIENTS:
    f1, f2 = first[cid], second[cid]
    flag = "  <== 이탈위험" if f2 < f1 * 0.4 else ("  (증가)" if f2 > f1 * 1.3 else "")
    print(f"  {cid} {name:18s} 전반 {f1:6.1f}kg  후반 {f2:6.1f}kg{flag}")
