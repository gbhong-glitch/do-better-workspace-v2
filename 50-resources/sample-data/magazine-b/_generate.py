#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
매거진B (비미디어컴퍼니) AX 데모 더미데이터 생성기.

설계 의도:
- 미션1 = "취합 자동화": 편집장 주간 현황 / 재무 월간 손익 / 유통 주간 출고·판매
  세 소스를 각기 다른 포맷·기준으로 만든다 (취합의 현실감).
    * editorial_weekly.csv  : 주차 = "2026-W21" 라벨, 텍스트/상태 중심
    * finance_monthly.csv   : 월 = "2026-05", 사업부문별 손익, 한글 컬럼
    * distribution_weekly.csv: 기간 = "05/25~05/31" 범위, 채널×제품 수량·금액, 자체 SKU 코드
- 미션2 = "마진 분석": product_master.csv 로 채널별 판매가·수수료·원가 교차.
  매출 1등 제품이 마진 1등인가? (직판 vs 위탁 수수료 차이가 핵심 반전)

리서치 확인 사실(2026-06, research-worker):
- 비미디어컴퍼니, 김명수 대표, 14명 규모, 광고 없는 판매 수익 모델
- 잡지 본편 정가 24,000원, Magazine F 18,000원
- 채널: 자사몰(magazine-b.com/en) · 국내서점(교보/예스24/알라딘) · 해외(reading-b 북미) · 매거진B 한남 오프라인 · 위탁
- 구독 2024-10 종료 → 단권 판매 중심
- 실제 발행 호 예시: FREITAG(1) · LEGO(13) · Leica(34) · MUJI(53) · %ARABICA(92) · Magazine B(100)
- 서점 위탁 수수료율은 미공개 → 업계 통설(30~40%) 기준 "(가정)"
"""
import csv
import random
from pathlib import Path

random.seed(20260616)
OUT = Path(__file__).parent

# ── 1. 제품 마스터 (미션2 마진 분석의 기준) ────────────────────────────
# 실제 발행 호 + 라인 기반. 정가/원가는 프리미엄 잡지 합리적 추정.
# 채널 판매가/수수료는 채널 정책 가정값.
#  - 자사몰(직판): 수수료 0%, 배송비 자부담, 가장 남는 채널
#  - 국내서점(위탁): 수수료 35% (가정), 정가 판매
#  - 해외(북미수입): 정가는 높지만 수입사 마진/물류로 수수료 효과 큼
#  - 한남 오프라인(직영): 수수료 0%이나 공간 운영비 별도(여기선 제외, 직판가)
PRODUCTS = [
    # sku, 제품명, 라인, 정가, 제작원가
    ("MB-100", "Magazine B No.100 (Magazine B)", "잡지본편", 24000, 8200),
    ("MB-092", "Magazine B No.92 (% Arabica)",   "잡지본편", 24000, 8200),
    ("MB-053", "Magazine B No.53 (MUJI)",        "잡지본편", 24000, 8200),
    ("MB-034", "Magazine B No.34 (Leica)",       "잡지본편", 24000, 8200),
    ("MB-013", "Magazine B No.13 (LEGO)",        "잡지본편", 24000, 8200),
    ("MB-001", "Magazine B No.1 (FREITAG)",      "잡지본편", 24000, 8200),
    ("MF-025", "Magazine F No.25 (Tea)",         "매거진F",  18000, 6400),
    ("MF-021", "Magazine F No.21 (Salt)",        "매거진F",  18000, 6400),
    ("BK-JOBS-ED", "JOBS - Editor",              "단행본",   18000, 6000),
    ("BK-JOBS-PD", "JOBS - Programmer",          "단행본",   18000, 6000),
    ("BK-SER-01",  "THE SERIES No.1",            "단행본",   22000, 7000),
    ("BK-SER-02",  "THE SERIES No.2",            "단행본",   22000, 7000),
]

# 채널: 코드, 이름, 유형, 수수료율(가정), 비고
CHANNELS = [
    ("OWN", "자사몰",        "직판", 0.00),
    ("HNM", "매거진B 한남",  "직영", 0.00),
    ("BKR", "국내서점(위탁)", "위탁", 0.35),
    ("INT", "해외(북미수입)", "수입", 0.45),
]

with open(OUT / "product_master.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["sku", "product_name", "line", "list_price", "unit_cost",
                "channel_code", "channel_name", "channel_type",
                "commission_rate", "channel_price"])
    for sku, name, line, price, cost in PRODUCTS:
        for ccode, cname, ctype, comm in CHANNELS:
            # 해외 수입판은 정가를 높게(환율/수입마진), 그러나 수수료가 매출에서 빠짐
            if ccode == "INT":
                channel_price = round(price * 1.45 / 100) * 100  # 약 +45% 표시가
            else:
                channel_price = price  # 국내는 정가 판매
            w.writerow([sku, name, line, price, cost,
                        ccode, cname, ctype, f"{comm:.2f}", channel_price])

print("product_master.csv 생성")

# ── 2. 유통 주간 출고/판매 (distribution_weekly.csv) ────────────────────
# 포맷 특징: 기간을 "MM/DD~MM/DD" 범위로, 자체 SKU 코드(위 마스터와 동일 sku),
#           채널은 한글명, 수량/금액만. 5월 5주차 ~ 6월 2주차 (6주).
WEEK_RANGES = [
    "05/04~05/10", "05/11~05/17", "05/18~05/24",
    "05/25~05/31", "06/01~06/07", "06/08~06/14",
]
# 제품별 주간 기본 판매 강도 (권/주, 채널 합산 기준)
BASE_DEMAND = {
    "MB-100": 220,  # 신간 100호 — 가장 잘 나감
    "MB-092": 70, "MB-053": 95, "MB-034": 55, "MB-013": 80, "MB-001": 60,
    "MF-025": 65, "MF-021": 40,
    "BK-JOBS-ED": 45, "BK-JOBS-PD": 38, "BK-SER-01": 30, "BK-SER-02": 50,
}
# 채널 분배 가중치 — 제품마다 채널 믹스가 다르다 (마진 반전의 핵심).
#  * 디자인 아이콘 호(Leica·FREITAG·LEGO)는 해외 수입 비중↑ → 수수료 45%로 마진 깎임
#  * 단행본(JOBS·THE SERIES)·100호는 자사몰 직판 비중↑ → 수수료 0%로 마진 두툼
# 결과: 매출 순위와 순마진 순위가 어긋나는 제품이 생긴다.
CH_WEIGHT_DEFAULT = {"OWN": 0.42, "HNM": 0.13, "BKR": 0.30, "INT": 0.15}
CH_WEIGHT_BY_SKU = {
    # 해외 인기 디자인 아이콘 → 해외 수입 비중 큼 (수수료 잠식)
    "MB-034": {"OWN": 0.18, "HNM": 0.07, "BKR": 0.25, "INT": 0.50},  # Leica
    "MB-001": {"OWN": 0.18, "HNM": 0.07, "BKR": 0.25, "INT": 0.50},  # FREITAG
    "MB-013": {"OWN": 0.22, "HNM": 0.08, "BKR": 0.28, "INT": 0.42},  # LEGO
    # 단행본·100호 → 자사몰 직판 충성 구매 (수수료 0)
    "BK-JOBS-ED": {"OWN": 0.70, "HNM": 0.18, "BKR": 0.10, "INT": 0.02},
    "BK-JOBS-PD": {"OWN": 0.70, "HNM": 0.18, "BKR": 0.10, "INT": 0.02},
    "BK-SER-01":  {"OWN": 0.66, "HNM": 0.20, "BKR": 0.12, "INT": 0.02},
    "BK-SER-02":  {"OWN": 0.60, "HNM": 0.25, "BKR": 0.13, "INT": 0.02},
    "MB-100":     {"OWN": 0.55, "HNM": 0.15, "BKR": 0.22, "INT": 0.08},
}
PRICE_LOOKUP = {}  # (sku, ccode) -> channel_price
for sku, name, line, price, cost in PRODUCTS:
    for ccode, cname, ctype, comm in CHANNELS:
        cp = round(price * 1.45 / 100) * 100 if ccode == "INT" else price
        PRICE_LOOKUP[(sku, ccode)] = cp

CH_NAME = {c[0]: c[1] for c in CHANNELS}

dist_rows = []
for wi, wr in enumerate(WEEK_RANGES):
    # 100호 신간 출시 직후(첫 2주) 부스트 — 일/항목 양쪽에서 급등 검출되게
    for sku, base in BASE_DEMAND.items():
        # 100호 런칭 스파이크: 1~2주차 매우 높음 (일/주 총액도 +30% 넘게 끌어올림)
        if sku == "MB-100":
            launch_factor = [4.2, 3.2, 1.4, 1.1, 1.0, 0.95][wi]
        else:
            launch_factor = 1.0
        # %Arabica 호: 카페 컬래버 이벤트로 6월 1주차 급등(콘텐츠 연동일 효과)
        # 컬래버 주에는 본편 라인 전반이 동반 상승(매장 유입 효과)하도록 가산
        if sku == "MB-092" and wi == 4:
            launch_factor = 5.5
        elif wi == 4 and sku in ("MB-053", "MB-034", "MB-013", "MB-001"):
            launch_factor = 1.4  # 컬래버 유입으로 본편 동반 상승
        week_total = base * launch_factor * random.uniform(0.9, 1.1)
        ch_weight = CH_WEIGHT_BY_SKU.get(sku, CH_WEIGHT_DEFAULT)
        for ccode, weight in ch_weight.items():
            qty = int(round(week_total * weight * random.uniform(0.85, 1.15)))
            if qty <= 0:
                continue
            cp = PRICE_LOOKUP[(sku, ccode)]
            dist_rows.append([wr, ccode, CH_NAME[ccode], sku, qty, qty * cp])

with open(OUT / "distribution_weekly.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    # 유통팀 양식: 한글 헤더 섞임, 기간 범위, 채널 한글명
    w.writerow(["기간", "채널코드", "채널", "SKU", "출고수량", "판매액"])
    for r in dist_rows:
        w.writerow(r)
print(f"distribution_weekly.csv 생성 ({len(dist_rows)}행)")

# ── 3. 재무 월간 손익 (finance_monthly.csv) ──────────────────────────────
# 포맷 특징: 월 단위("2026-04","2026-05"), 사업부문별, 한글 컬럼, 손익까지.
# 유통의 주간 판매와 "기준이 다르다"(월 vs 주, 부문 vs 제품) — 취합의 현실감.
SEGMENTS = [
    # 부문, 4월 매출, 5월 매출, 매출원가율, 판관비배부
    ("잡지 본편 판매", 96_000_000, 138_000_000, 0.34, 38_000_000),
    ("단행본 판매",    28_000_000, 31_000_000, 0.33, 11_000_000),
    ("IP·라이선스",    42_000_000, 19_000_000, 0.08, 6_000_000),
    ("브랜드 콘텐츠",  55_000_000, 61_000_000, 0.22, 18_000_000),
    ("오프라인(한남)", 17_000_000, 16_000_000, 0.55, 9_000_000),
]
with open(OUT / "finance_monthly.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["월", "사업부문", "매출", "매출원가", "매출총이익", "판관비배부", "영업이익"])
    for seg, rev_apr, rev_may, cogs_rate, sga in SEGMENTS:
        for month, rev in (("2026-04", rev_apr), ("2026-05", rev_may)):
            cogs = int(rev * cogs_rate)
            gross = rev - cogs
            op = gross - sga
            w.writerow([month, seg, rev, cogs, gross, sga, op])
print("finance_monthly.csv 생성")

# ── 4. 편집장 주간 현황 (editorial_weekly.csv) ────────────────────────────
# 포맷 특징: 주차 = "2026-W19" ISO 라벨, 상태/메모 텍스트 중심(숫자 거의 없음).
# 가장 비정형적인 소스 — 취합 자동화의 난이도를 보여줌.
ED_WEEKS = ["2026-W19", "2026-W20", "2026-W21", "2026-W22", "2026-W23", "2026-W24"]
ED_PROJECTS = [
    # 프로젝트, 단계 시퀀스(주차별), 담당 에디터
    ("No.101 후보 브랜드 선정", ["리서치", "리서치", "후보 3개 압축", "대표 검토 대기", "확정", "킥오프"], "박지윤"),
    ("No.100 발간 후속(아카이브전)", ["기획", "장소 협의", "장소 협의", "셋업", "오픈", "운영"], "이수민"),
    ("Magazine F 재개 검토", ["보류", "보류", "내부 논의", "내부 논의", "방향 제안", "대표 검토 대기"], "박지윤"),
    ("%Arabica 호 카페 컬래버", ["섭외", "섭외", "콘텐츠 촬영", "콘텐츠 촬영", "SNS 공개", "리뷰 수집"], "정하늘"),
    ("JOBS 신규 직업 인터뷰", ["섭외", "인터뷰", "인터뷰", "원고 정리", "교정", "디자인"], "이수민"),
    ("신규 브랜드 협업 콘텐츠 기획", ["킥오프", "범위 협의", "범위 협의", "초안", "대표 검토 대기", "수정"], "정하늘"),
]
with open(OUT / "editorial_weekly.csv", "w", encoding="utf-8-sig", newline="") as f:
    w = csv.writer(f)
    w.writerow(["주차", "프로젝트", "담당에디터", "단계", "특이사항"])
    notes = {
        ("%Arabica 호 카페 컬래버", "2026-W23"): "SNS 공개일(6/1) 트래픽 급증, 92호 재고 문의 다수",
        ("No.101 후보 브랜드 선정", "2026-W23"): "대표 확정 필요 — 주간 리뷰 안건",
        ("Magazine F 재개 검토", "2026-W24"): "재무 손익 보고 후 판단하기로",
        ("신규 브랜드 협업 콘텐츠 기획", "2026-W23"): "대표 검토 대기 — 예산 규모 확인 필요",
    }
    for proj, stages, editor in ED_PROJECTS:
        for wi, week in enumerate(ED_WEEKS):
            note = notes.get((proj, week), "")
            w.writerow([week, proj, editor, stages[wi], note])
print("editorial_weekly.csv 생성")

# ── 5. 스파이크 검증 ─────────────────────────────────────────────────────
print("\n=== 스파이크 검증 ===")
# 유통 주간 판매액 합계 (일/주 총액 급등 검출)
from collections import defaultdict
wk_total = defaultdict(int)
sku_wk = defaultdict(int)
for wr, ccode, cname, sku, qty, amt in dist_rows:
    wk_total[wr] += amt
    sku_wk[(sku, wr)] += qty
avg_wk = sum(wk_total.values()) / len(wk_total)
print("주간 총 판매액 / 평균 대비:")
for wr in WEEK_RANGES:
    ratio = wk_total[wr] / avg_wk
    flag = " ◀ 급등" if ratio >= 1.30 else ""
    print(f"  {wr}: {wk_total[wr]:>12,}원  ({ratio:.0%}){flag}")
# 100호 런칭주 SKU 급등
mb100_w1 = sku_wk[("MB-100", "05/04~05/10")]
mb100_avg = sum(sku_wk[("MB-100", w)] for w in WEEK_RANGES[2:]) / 4
print(f"\nMB-100 런칭주(1주) {mb100_w1}권 vs 안정기 평균 {mb100_avg:.0f}권 = {mb100_w1/mb100_avg:.1f}배")
# %Arabica 6월1주 급등
arab_w5 = sku_wk[("MB-092", "06/01~06/07")]
arab_base = sum(sku_wk[("MB-092", w)] for w in WEEK_RANGES[:4]) / 4
print(f"MB-092(%Arabica) 컬래버주 {arab_w5}권 vs 평소 평균 {arab_base:.0f}권 = {arab_w5/arab_base:.1f}배")
print("\n생성 완료.")
