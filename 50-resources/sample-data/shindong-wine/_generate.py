#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
신동와인 AX 데모용 더미데이터 생성기 (4종 CSV).
실제 신동와인 유통 브랜드/제품 기반 (web 리서치 확인). 가격은 데모용 합리적 추정.

산출:
  wine_master.csv   : 40종 마스터 (도착가·환율·채널마진 등 수익 계산 기준)
  shipments.csv     : 출고 2,000건+ (채널별 출고매출)
  promotions.csv    : 프로모션/신제품출시 캘린더
  inventory.csv     : 재고·입고일·빈티지 (품절임박/장기재고 경보용)

검출 메커니즘:
  - 프로모션/신제품 연동일은 일 총매출이 평균 대비 +30% 이상 튀게 설계
  - 대상 SKU는 평소 대비 수 배로 집중
"""

import csv, random, datetime as dt
from collections import defaultdict

random.seed(20260613)  # 캠프 Day1 날짜 시드 고정

OUT = lambda name: f"/Users/rhim/Projects/do-better-workspace-v2/50-resources/sample-data/shindong-wine/{name}"

# ──────────────────────────────────────────────────────────────
# 1) 와인 마스터 (40종) — 실제 브랜드/제품, 도착가·환율·채널마진
#    필드: arrival_ccy 통화로 도착가 → 환율로 원화 도착원가 산출
# ──────────────────────────────────────────────────────────────
# (sku, brand, product, country, region, grape, type, vol_ml, ccy, arrival_price_ccy, list_price_krw, tier)
MASTER_RAW = [
    # 볼링저 (프랑스 샹파뉴) — 프리미엄/하이엔드
    ("BOL-SC-750", "볼링저", "Special Cuvée Brut", "프랑스", "샹파뉴", "피노누아/샤르도네/피노뮈니에", "스파클링", 750, "EUR", 58.0, 186000, "프리미엄"),
    ("BOL-RO-750", "볼링저", "Rosé Brut", "프랑스", "샹파뉴", "피노누아/샤르도네/피노뮈니에", "스파클링", 750, "EUR", 78.0, 250000, "하이엔드"),
    ("BOL-GA-750", "볼링저", "La Grande Année", "프랑스", "샹파뉴", "피노누아/샤르도네", "스파클링", 750, "EUR", 95.0, 267000, "하이엔드"),
    ("BOL-GAR-750", "볼링저", "La Grande Année Rosé", "프랑스", "샹파뉴", "피노누아/샤르도네", "스파클링", 750, "EUR", 150.0, 400000, "하이엔드"),
    # 토레스 (스페인) — 엔트리~하이엔드 (30년 독점)
    ("TOR-GC-750", "토레스", "Gran Coronas Reserva", "스페인", "페네데스", "카베르네소비뇽/템프라니요", "레드", 750, "EUR", 7.5, 24900, "엔트리"),
    ("TOR-CE-750", "토레스", "Celeste Crianza", "스페인", "리베라델두에로", "템프라니요", "레드", 750, "EUR", 16.0, 48000, "중가"),
    ("TOR-MP-750", "토레스", "Mas La Plana", "스페인", "페네데스", "카베르네소비뇽", "레드", 750, "EUR", 45.0, 140000, "하이엔드"),
    ("TOR-SA-750", "토레스", "Salmos", "스페인", "프리오라트", "가르나차/카리네나/시라", "레드", 750, "EUR", 28.0, 90000, "프리미엄"),
    # 카스텔라레 (이탈리아 토스카나)
    ("CAS-CC-750", "카스텔라레", "Chianti Classico", "이탈리아", "키안티클라시코", "산지오베제", "레드", 750, "EUR", 15.0, 48000, "중가"),
    ("CAS-RI-750", "카스텔라레", "Chianti Classico Riserva", "이탈리아", "키안티클라시코", "산지오베제", "레드", 750, "EUR", 26.0, 85000, "프리미엄"),
    ("CAS-SN-750", "카스텔라레", "I Sodi di San Niccolò", "이탈리아", "토스카나", "산지오베토/말바시아네라", "레드", 750, "EUR", 55.0, 180000, "하이엔드"),
    # 로버트 몬다비 (미국 캘리포니아)
    ("MON-NC-750", "로버트몬다비", "Napa Valley Cabernet", "미국", "나파밸리", "카베르네소비뇽", "레드", 750, "USD", 28.0, 89000, "프리미엄"),
    ("MON-FB-750", "로버트몬다비", "Napa Valley Fumé Blanc", "미국", "나파밸리", "소비뇽블랑", "화이트", 750, "USD", 14.0, 45000, "중가"),
    ("MON-TK-750", "로버트몬다비", "To Kalon Reserve Cabernet", "미국", "나파밸리오크빌", "카베르네소비뇽", "레드", 750, "USD", 110.0, 320000, "하이엔드"),
    # 칼리테라 (칠레) — 엔트리
    ("CAL-CS-750", "칼리테라", "Reserva Cabernet", "칠레", "콜차구아밸리", "카베르네소비뇽", "레드", 750, "USD", 6.5, 25000, "엔트리"),
    ("CAL-CR-750", "칼리테라", "Reserva Carmenere", "칠레", "콜차구아밸리", "카르메네르", "레드", 750, "USD", 6.5, 25000, "엔트리"),
    ("CAL-TC-750", "칼리테라", "Tributo Gran Reserva Carmenere", "칠레", "콜차구아밸리", "카르메네르", "레드", 750, "USD", 12.0, 45000, "중가"),
    ("CAL-TS-750", "칼리테라", "Tributo Gran Reserva Sauvignon Blanc", "칠레", "레이다밸리", "소비뇽블랑", "화이트", 750, "USD", 12.0, 45000, "중가"),
    # 빌라 마리아 (뉴질랜드)
    ("VIL-SB-750", "빌라마리아", "Private Bin Sauvignon Blanc", "뉴질랜드", "말보로", "소비뇽블랑", "화이트", 750, "USD", 9.5, 34000, "엔트리"),
    ("VIL-PG-750", "빌라마리아", "Private Bin Pinot Gris", "뉴질랜드", "말보로", "피노그리", "화이트", 750, "USD", 11.0, 38000, "중가"),
    ("VIL-CS-750", "빌라마리아", "Cellar Selection Sauvignon Blanc", "뉴질랜드", "말보로", "소비뇽블랑", "화이트", 750, "USD", 15.0, 50000, "중가"),
    ("VIL-PN-750", "빌라마리아", "Earth Garden Pinot Noir", "뉴질랜드", "말보로", "피노누아", "레드", 750, "USD", 14.0, 45900, "중가"),
    # Dr. 뷔르클린-볼프 (독일 리슬링)
    ("BUR-ER-750", "뷔르클린볼프", "Estate Riesling Trocken", "독일", "팔츠", "리슬링", "화이트", 750, "EUR", 24.0, 80000, "프리미엄"),
    ("BUR-WV-750", "뷔르클린볼프", "Wachenheim Village Riesling", "독일", "팔츠바헨하임", "리슬링", "화이트", 750, "EUR", 35.0, 110000, "프리미엄"),
    ("BUR-GE-750", "뷔르클린볼프", "Gerumpel P.C. Riesling", "독일", "팔츠", "리슬링", "화이트", 750, "EUR", 60.0, 180000, "하이엔드"),
    # 샤토 클라크 (프랑스 보르도)
    ("CLK-RD-750", "샤토클라크", "Château Clarke Rouge", "프랑스", "리스트락메독", "메를로/카베르네소비뇽", "레드", 750, "EUR", 26.0, 85000, "프리미엄"),
    ("CLK-MB-750", "샤토클라크", "Le Merle Blanc", "프랑스", "리스트락메독", "뮈스카델/소비뇽블랑/세미용", "화이트", 750, "EUR", 22.0, 72000, "중가"),
    # 파스칼 졸리베 (프랑스 루아르)
    ("JOL-AT-750", "파스칼졸리베", "Attitude Sauvignon Blanc", "프랑스", "루아르뚜렌", "소비뇽블랑", "화이트", 750, "EUR", 24.0, 78000, "프리미엄"),
    ("JOL-SA-750", "파스칼졸리베", "Sancerre Blanc", "프랑스", "상세르", "소비뇽블랑", "화이트", 750, "EUR", 35.0, 110000, "프리미엄"),
    ("JOL-PF-750", "파스칼졸리베", "Pouilly-Fumé", "프랑스", "푸이퓌메", "소비뇽블랑", "화이트", 750, "EUR", 32.0, 100000, "프리미엄"),
    # 라 샤블리지엔 (프랑스 샤블리)
    ("CHA-PE-750", "라샤블리지엔", "Chablis La Pierrelée", "프랑스", "샤블리", "샤르도네", "화이트", 750, "EUR", 18.0, 56000, "중가"),
    ("CHA-PC-750", "라샤블리지엔", "Chablis 1er Cru Fourchaume", "프랑스", "샤블리프르미에크뤼", "샤르도네", "화이트", 750, "EUR", 25.0, 78900, "프리미엄"),
    ("CHA-PT-750", "라샤블리지엔", "Petit Chablis", "프랑스", "쁘띠샤블리", "샤르도네", "화이트", 750, "EUR", 14.0, 45000, "중가"),
    ("CHA-GC-750", "라샤블리지엔", "Chablis Grand Cru", "프랑스", "샤블리그랑크뤼", "샤르도네", "화이트", 750, "EUR", 40.0, 130000, "하이엔드"),
    # 룬가로티 (이탈리아 움브리아)
    ("LUN-RU-750", "룬가로티", "Rubesco Rosso di Torgiano", "이탈리아", "토르자노", "산지오베제/카나이올로", "레드", 750, "EUR", 14.0, 48000, "중가"),
    ("LUN-RM-750", "룬가로티", "Rubesco Riserva Vigna Monticchio", "이탈리아", "토르자노", "산지오베제", "레드", 750, "EUR", 38.0, 120000, "하이엔드"),
    ("LUN-SG-750", "룬가로티", "San Giorgio", "이탈리아", "움브리아", "카베르네소비뇽", "레드", 750, "EUR", 33.0, 102000, "프리미엄"),
    # 토카이 (헝가리 스위트)
    ("TOK-A5-250", "로얄토카이", "Aszú 5 Puttonyos Blue Label", "헝가리", "토카이헤지알야", "푸르민트/하르슬레벨뤼", "스위트", 250, "EUR", 18.0, 60000, "프리미엄"),
    ("TOK-A6-500", "로얄토카이", "Aszú 6 Puttonyos", "헝가리", "토카이헤지알야", "푸르민트/하르슬레벨뤼", "스위트", 500, "EUR", 38.0, 120000, "하이엔드"),
    # 생수 (이탈리아) — 대량회전 저마진
    ("SPL-SP-750", "산펠레그리노", "Sparkling 750ml", "이탈리아", "산펠레그리노", "-", "탄산수", 750, "EUR", 1.1, 4200, "엔트리"),
    ("APN-ST-750", "아쿠아파나", "Still 750ml", "이탈리아", "토스카나", "-", "생수", 750, "EUR", 1.0, 3800, "엔트리"),
]

# 환율 (도착 통화 → 원화). 데모용 합리적 값.
FX = {"EUR": 1480.0, "USD": 1370.0}

# 채널 정의: 채널마진(=신동와인이 채널에 줘야 하는 수수료/마진율, 출고가 대비)
# 백화점이 마진을 가장 많이 떼고, 직거래(와인샵/HORECA)는 상대적으로 적게.
CHANNELS = {
    "백화점-현대":   0.32,   # 현대백화점 입점 — 수수료 높음
    "백화점-갤러리아": 0.34,
    "HORECA":        0.18,   # 호텔·레스토랑 직거래
    "와인샵":         0.22,   # 전문 와인샵
    "온라인":         0.15,   # 자사 외 제휴 온라인 (낮은 수수료)
}

def round_krw(v):  # 100원 단위 반올림
    return int(round(v / 100.0) * 100)

master = []
for (sku, brand, prod, country, region, grape, wtype, vol, ccy, arr_ccy, listp, tier) in MASTER_RAW:
    fx = FX[ccy]
    arrival_krw = round_krw(arr_ccy * fx)   # 원화 도착원가 (통관·관세·주세 전 단순 도착가)
    master.append({
        "sku": sku, "brand": brand, "product": prod, "country": country,
        "region": region, "grape": grape, "type": wtype, "volume_ml": vol,
        "arrival_ccy": ccy, "arrival_price_ccy": arr_ccy, "fx_rate": fx,
        "arrival_cost_krw": arrival_krw, "list_price_krw": listp, "tier": tier,
    })

with open(OUT("wine_master.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(master[0].keys()))
    w.writeheader(); w.writerows(master)
print(f"wine_master.csv: {len(master)}종")

# 채널마진 마스터도 별도 컬럼 참조용으로 master에 채널 정보가 없으니 shipments에서 channel별로 적용
master_by_sku = {m["sku"]: m for m in master}

# ──────────────────────────────────────────────────────────────
# 2) 프로모션 캘린더 (백화점행사·신제품출시)
# ──────────────────────────────────────────────────────────────
# 기간: 2026-03-01 ~ 2026-05-31 (3개월)
START = dt.date(2026, 3, 1)
END = dt.date(2026, 5, 31)
DAYS = (END - START).days + 1
all_dates = [START + dt.timedelta(days=i) for i in range(DAYS)]

# 프로모션: (promo_id, name, type, channel, start, end, target_skus)
PROMOS = [
    ("PR-2603-01", "현대백화점 봄 와인페어", "백화점행사", "백화점-현대",
     dt.date(2026,3,13), dt.date(2026,3,22),
     ["TOR-GC-750","CAL-CS-750","CAL-CR-750","CAS-CC-750","CHA-PE-750"]),
    ("PR-2603-02", "볼링저 La Grande Année 신제품 출시", "신제품출시", "HORECA",
     dt.date(2026,3,27), dt.date(2026,4,5),
     ["BOL-GA-750","BOL-GAR-750"]),
    ("PR-2604-01", "갤러리아 이탈리아 와인 기획전", "백화점행사", "백화점-갤러리아",
     dt.date(2026,4,10), dt.date(2026,4,19),
     ["CAS-CC-750","CAS-RI-750","LUN-RU-750","LUN-SG-750"]),
    ("PR-2604-02", "칼리테라 Tributo 신빈티지 입고 프로모션", "신제품출시", "와인샵",
     dt.date(2026,4,24), dt.date(2026,5,3),
     ["CAL-TC-750","CAL-TS-750"]),
    ("PR-2605-01", "현대백화점 화이트와인 시즌", "백화점행사", "백화점-현대",
     dt.date(2026,5,8), dt.date(2026,5,17),
     ["VIL-SB-750","JOL-AT-750","CHA-PC-750","BUR-ER-750","MON-FB-750"]),
    ("PR-2605-02", "로얄토카이 디저트와인 기프트 프로모션", "신제품출시", "백화점-갤러리아",
     dt.date(2026,5,22), dt.date(2026,5,29),
     ["TOK-A5-250","TOK-A6-500"]),
]

with open(OUT("promotions.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["promo_id","promo_name","promo_type","channel","start_date","end_date","target_skus","discount_rate"])
    for (pid, name, ptype, ch, s, e, skus) in PROMOS:
        disc = 0.10 if ptype == "백화점행사" else 0.05
        w.writerow([pid, name, ptype, ch, s.isoformat(), e.isoformat(), "|".join(skus), disc])
print(f"promotions.csv: {len(PROMOS)}건")

# 프로모션 빠른 조회: 날짜→해당 프로모션 / sku→가중치
promo_by_date = defaultdict(list)
for p in PROMOS:
    pid, name, ptype, ch, s, e, skus = p
    d = s
    while d <= e:
        promo_by_date[d].append({"pid":pid,"channel":ch,"skus":set(skus),"type":ptype})
        d += dt.timedelta(days=1)

# ──────────────────────────────────────────────────────────────
# 3) 출고 데이터 (shipments) — 2,000건+
#    order 단위로 채널·거래처·날짜 1회 결정. 라인=주문 내 SKU.
# ──────────────────────────────────────────────────────────────
CHANNEL_CODE = {"백화점-현대":"HDH","백화점-갤러리아":"GLR","HORECA":"HRC","와인샵":"WSH","온라인":"ONL"}
# 거래처 풀 (채널별)
VENDORS = {
    "백화점-현대":   ["현대 압구정본점","현대 무역센터점","현대 판교점","현대 더현대서울"],
    "백화점-갤러리아": ["갤러리아 명품관","갤러리아 타임월드","갤러리아 광교"],
    "HORECA":        ["그랜드하얏트","시그니엘호텔","JW메리어트","비스트로꼼므","리스토란테에오"],
    "와인샵":         ["와인앤모어 청담","비노쿠스","와인타임 분당","보틀벙커 잠실"],
    "온라인":         ["네이버 신동와인몰","카카오선물하기","마켓컬리"],
}
CHANNEL_LIST = list(CHANNELS.keys())
# 채널별 기본 주문 빈도 가중치
CHANNEL_W = {"백화점-현대":0.26,"백화점-갤러리아":0.18,"HORECA":0.24,"와인샵":0.20,"온라인":0.12}

# SKU별 기본 인기도(주문 시 선택 확률 가중). 엔트리·중가가 회전 빠름.
def base_pop(m):
    tierw = {"엔트리":5.0,"중가":3.0,"프리미엄":1.6,"하이엔드":0.7}[m["tier"]]
    if m["type"] in ("탄산수","생수"):
        tierw = 6.5  # 생수 대량회전
    return tierw

skus = [m["sku"] for m in master]
sku_w = {m["sku"]: base_pop(m) for m in master}

# 채널별로 취급 안 하는 조합 약간 (현실감) — 생수는 HORECA·온라인 위주
def channel_sku_ok(channel, m):
    if m["type"] in ("탄산수","생수"):
        return channel in ("HORECA","온라인","와인샵")
    if m["tier"] == "하이엔드" and channel == "온라인":
        return random.random() < 0.3  # 하이엔드는 온라인 드뭄
    return True

# 채널별 일 기본 주문수 (평일 기준). 주말 가중.
def day_base_orders(channel, d):
    base = {"백화점-현대":7,"백화점-갤러리아":5,"HORECA":7,"와인샵":6,"온라인":4}[channel]
    if d.weekday() >= 5:  # 주말
        base = int(base * (1.25 if channel.startswith("백화점") else 0.8))
    return base

def list_price_for(m):
    return m["list_price_krw"]

# 채널별 출고단가: list price 기준에서 채널별 약간 차등 (백화점 정가 가까이, 온라인 약간 할인)
def channel_unit_price(m, channel, discount=0.0):
    lp = list_price_for(m)
    ch_factor = {"백화점-현대":1.00,"백화점-갤러리아":1.00,"HORECA":0.92,"와인샵":0.90,"온라인":0.88}[channel]
    price = lp * ch_factor * (1.0 - discount)
    return round_krw(price)

rows = []
order_seq = defaultdict(int)  # (channel, yymmdd) -> seq

for d in all_dates:
    ymd = d.strftime("%y%m%d")
    todays_promos = promo_by_date.get(d, [])
    for channel in CHANNEL_LIST:
        n_orders = day_base_orders(channel, d)
        # 프로모션 연동일: 해당 채널에 프로모션 있으면 주문수 자체를 크게 끌어올림 (일 총매출 +30% 보장)
        active = [p for p in todays_promos if p["channel"] == channel]
        if active:
            n_orders = int(n_orders * random.uniform(6.0, 7.5))  # 주문 수 급증 (프로모션 연동일)
        else:
            n_orders = max(1, n_orders + random.randint(-1, 2))
        for _ in range(n_orders):
            order_seq[(channel, ymd)] += 1
            seq = order_seq[(channel, ymd)]
            order_id = f"{CHANNEL_CODE[channel]}-{ymd}-{seq:03d}"
            vendor = random.choice(VENDORS[channel])
            # 주문 내 라인 수
            n_lines = random.choices([1,2,3,4], weights=[40,32,18,10])[0]
            # 후보 SKU
            cand = [m for m in master if channel_sku_ok(channel, m)]
            # 프로모션 대상 SKU 강하게 가중
            promo_skus = set()
            for p in active:
                promo_skus |= p["skus"]
                disc_map = p["type"]
            for li in range(n_lines):
                weights = []
                for m in cand:
                    w_ = sku_w[m["sku"]]
                    if m["sku"] in promo_skus:
                        w_ *= 20.0  # 프로모션 SKU 집중 (항목 단위 급등)
                    weights.append(w_)
                m = random.choices(cand, weights=weights)[0]
                # 수량
                if m["type"] in ("탄산수","생수"):
                    qty = random.choice([12,24,24,48])
                else:
                    qty = random.choices([1,2,3,6,12], weights=[28,24,18,20,10])[0]
                # 프로모션 SKU면 수량도 약간 큼
                discount = 0.0
                is_promo = m["sku"] in promo_skus
                if is_promo:
                    qty = int(qty * random.uniform(1.3, 1.8)) or 1
                    # 해당 프로모션 할인율
                    for p in active:
                        if m["sku"] in p["skus"]:
                            discount = 0.10 if p["type"]=="백화점행사" else 0.05
                            break
                unit = channel_unit_price(m, channel, discount)
                amount = unit * qty
                rows.append({
                    "order_id": order_id,
                    "order_date": d.isoformat(),
                    "channel": channel,
                    "vendor": vendor,
                    "sku": m["sku"],
                    "brand": m["brand"],
                    "product": m["product"],
                    "qty": qty,
                    "unit_price_krw": unit,
                    "amount_krw": amount,
                    "is_promo": "Y" if is_promo else "N",
                })

with open(OUT("shipments.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader(); w.writerows(rows)
print(f"shipments.csv: {len(rows)}건 (주문 {sum(order_seq.values())}건)")

# ──────────────────────────────────────────────────────────────
# 4) 재고 데이터 (inventory) — 품절임박/장기재고 경보용
#    필드: 현재고, 입고일, 빈티지, 최근30일 일평균출고
# ──────────────────────────────────────────────────────────────
# 최근 30일 출고량 집계 (소진일수 계산용)
last30_start = END - dt.timedelta(days=29)
sku_recent_qty = defaultdict(int)
for r in rows:
    rd = dt.date.fromisoformat(r["order_date"])
    if rd >= last30_start:
        sku_recent_qty[r["sku"]] += r["qty"]

inv_rows = []
for m in master:
    sku = m["sku"]
    avg_daily = round(sku_recent_qty[sku] / 30.0, 2)
    # 현재고: 평균 일출고 기준 일부는 임박, 일부는 과재고
    # 빈티지: 와인은 노후 빈티지 일부 섞기 (생수는 N/A)
    if m["type"] in ("탄산수","생수"):
        vintage = "NV"
        receive_days_ago = random.randint(10, 60)
    else:
        # 하이엔드/프리미엄은 오래된 빈티지가 안 빠지고 남는 케이스
        if m["tier"] in ("하이엔드","프리미엄") and random.random() < 0.45:
            vintage = str(random.choice([2017, 2018, 2019]))  # 장기재고 후보
            receive_days_ago = random.randint(420, 900)
        else:
            vintage = str(random.choice([2021, 2022, 2023]))
            receive_days_ago = random.randint(20, 200)
    receive_date = (END - dt.timedelta(days=receive_days_ago)).isoformat()
    # 현재고 설계
    if avg_daily <= 0.1:
        # 거의 안 나가는 것 → 과재고로
        stock = random.randint(40, 120)
    else:
        days_target = random.choices([4, 9, 20, 45, 120], weights=[12,18,30,25,15])[0]
        stock = max(1, int(avg_daily * days_target) + random.randint(-3, 5))
    days_of_supply = round(stock / avg_daily, 1) if avg_daily > 0 else 999.0
    inv_rows.append({
        "sku": sku, "brand": m["brand"], "product": m["product"],
        "type": m["type"], "vintage": vintage,
        "stock_qty": stock, "receive_date": receive_date,
        "avg_daily_out_30d": avg_daily,
        "days_of_supply": days_of_supply,
    })

with open(OUT("inventory.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.DictWriter(f, fieldnames=list(inv_rows[0].keys()))
    w.writeheader(); w.writerows(inv_rows)
print(f"inventory.csv: {len(inv_rows)}종")

# 채널마진 마스터 별도 파일은 만들지 않고, wine_master에 채널마진 참조표를 주석으로 안내.
# 대신 채널마진을 별도 작은 CSV로 — 분석에서 교차하기 쉽게.
with open(OUT("channel_margin.csv"), "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["channel","channel_margin_rate","note"])
    notes = {
        "백화점-현대":"현대백화점 입점 수수료(출고매출 대비)",
        "백화점-갤러리아":"갤러리아 입점 수수료",
        "HORECA":"호텔·레스토랑 직거래",
        "와인샵":"전문 와인샵 직거래",
        "온라인":"제휴 온라인 채널",
    }
    for ch, rate in CHANNELS.items():
        w.writerow([ch, rate, notes[ch]])
print("channel_margin.csv: 5채널")

# ──────────────────────────────────────────────────────────────
# 검증: 프로모션 연동일 일총매출이 평균 대비 +30%↑ 인지
# ──────────────────────────────────────────────────────────────
import statistics

# (A) 채널별 일매출 — 프로모션 채널의 연동일이 그 채널 평소대비 +30%↑ 인가
chan_daily = defaultdict(lambda: defaultdict(int))   # channel -> date -> amount
sku_daily = defaultdict(lambda: defaultdict(int))    # sku -> date -> qty
for r in rows:
    chan_daily[r["channel"]][r["order_date"]] += r["amount_krw"]
    sku_daily[r["sku"]][r["order_date"]] += r["qty"]

# 채널별 비프로모션 baseline (해당 채널이 어떤 프로모션에도 안 묶인 날의 평균)
promo_channel_dates = defaultdict(set)
for (pid,name,ptype,ch,s,e,pskus) in PROMOS:
    d=s
    while d<=e:
        promo_channel_dates[ch].add(d.isoformat()); d+=dt.timedelta(days=1)
chan_base = {}
for ch in CHANNELS:
    vals=[v for dte,v in chan_daily[ch].items() if dte not in promo_channel_dates[ch]]
    chan_base[ch]=statistics.mean(vals) if vals else 0

print(f"\n[검증A] 채널별 연동일 매출 급등 (채널 평소 baseline 대비)")
okA=True
for (pid,name,ptype,ch,s,e,pskus) in PROMOS:
    base=chan_base[ch]; d=s; spike=0; tot=0
    while d<=e:
        tot+=1
        if chan_daily[ch].get(d.isoformat(),0) >= base*1.30: spike+=1
        d+=dt.timedelta(days=1)
    flag="OK" if spike>=tot*0.7 else "WEAK"
    if flag=="WEAK": okA=False
    print(f"  {pid} {name[:18]:20} {ch:12} 급등일 {spike}/{tot} (base {base/1e6:.1f}M) [{flag}]")

# (B) 대상 SKU 일출고량 — 연동기간 SKU 출고가 평소대비 수배 튀는가
print(f"\n[검증B] 대상 SKU 출고량 급등 (SKU 평소 baseline 대비)")
okB=True
for (pid,name,ptype,ch,s,e,pskus) in PROMOS:
    worst=None
    for sku in pskus:
        days={dt.date.fromisoformat(k):v for k,v in sku_daily[sku].items()}
        in_p=[v for dte,v in days.items() if s<=dte<=e]
        out_p=[v for dte,v in days.items() if not(s<=dte<=e)]
        avg_in=statistics.mean(in_p) if in_p else 0
        avg_out=statistics.mean(out_p) if out_p else 0.01
        ratio=avg_in/avg_out if avg_out>0 else 99
        if worst is None or ratio<worst[1]: worst=(sku,ratio)
    flag="OK" if worst[1]>=2.0 else "WEAK"
    if flag=="WEAK": okB=False
    print(f"  {pid} {name[:18]:20} 최저배율 SKU {worst[0]} {worst[1]:.1f}x [{flag}]")

print("\n[검증] 채널급등:", "PASS" if okA else "REVIEW", "| SKU급등:", "PASS" if okB else "REVIEW")
