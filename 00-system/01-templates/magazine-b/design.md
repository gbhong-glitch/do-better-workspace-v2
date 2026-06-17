# Magazine B — Design Guide

## Overview

매거진B의 리포트 표면은 **순백(`{colors.paper}` — #ffffff)** 캔버스 위에 **잉크 블랙(`{colors.ink}` — #111111)** 타이포그래피가 거의 전부를 말하는, 광고 없는 에디토리얼의 순도(純度)를 그대로 옮긴 시스템이다. 매거진B는 호마다 하나의 브랜드만 다루고, 그 브랜드의 시그니처 컬러가 표지 전체를 지배한다 — 이 리포트도 같은 문법을 쓴다: 바탕은 종이처럼 비워두고, 한 호(또는 한 문서)에 **단 하나의 액센트 컬러(`{colors.accent}`)** 만 허용해 KPI 숫자·헤드라인 룰·강조 행에만 절제해서 얹는다. 색을 늘리는 대신 **여백과 타이포 위계**로 격을 만든다.

타입 보이스는 **그로테스크 산세리프 단일 패밀리**다. 매거진B의 마스트헤드 'B'가 단순 레터마크이듯, 이 시스템도 세리프를 섞지 않고 산세리프(Pretendard / Helvetica Neue 계열) 하나로 디스플레이부터 캡션까지 위계를 만든다. 헤드라인은 큰 사이즈 + 좁은 자간으로 또렷하게, 본문은 넉넉한 행간으로 가라앉힌다. 라벨·카테고리만 대문자 + 넓은 트래킹으로 "편집물의 인덱스" 같은 인상을 준다.

레이아웃 철학은 **사진 대신 여백, 장식 대신 정렬**이다. 매거진B 지면이 이미지와 짧은 캡션으로 호흡하듯, 리포트는 표·KPI·해석 줄을 넓은 마진 안에 정갈하게 정렬하고 그 사이를 크게 비운다. 그라데이션·텍스처·박스 채움을 쓰지 않는다. 강조가 필요하면 색을 더하지 않고, **헤어라인 한 줄**과 **여백**으로 처리한다. 임원(대표) 보고·주간 경영 리뷰라는 용도에 맞게, 데이터는 또렷하되 표면은 매거진B 지면처럼 조용하다.

**Key Characteristics:**
- 순백 종이 캔버스(`{colors.paper}` — #ffffff)가 기본. 표지·섹션 헤더만 잉크(`{colors.ink}`)로 반전.
- **산세리프 단일 패밀리** — 디스플레이부터 캡션까지 하나로. 세리프·장식체 금지.
- 액센트(`{colors.accent}`)는 **문서당 하나**, 선·강조 전용 — 헤드라인 룰, KPI 숫자, 강조 행 좌측 보더. 면 채움 금지.
- 호별 브랜드 컬러처럼, 액센트는 교체 가능한 토큰. 기본은 매거진B 시그니처 레드(`{colors.accent}` — #e23b2e), 호/문서에 따라 스왑.
- KPI 숫자는 큰 산세리프(`{typography.display-md}`) + 바로 아래 한 줄 해석 라벨이 짝 (숫자만 두지 않는다).
- 표는 가로 헤어라인(`{colors.hairline}`)만, 세로줄 없음. 표 상단에 잉크 1px 룰.
- 모서리는 직각 기조 — `{rounded.none}`(표·밴드), 카드만 `{rounded.sm}`(4px).
- 여백을 크게: 섹션 간 `{spacing.section}`(80px), KPI 밴드 내부 `{spacing.xxl}`(48px).
- 페이지 번호·인덱스 라벨은 매거진 인덱스처럼 대문자 + 넓은 트래킹.

## Colors

### Brand & Accent
- **Ink** (`{colors.ink}` — #111111): 시스템의 권위 색. 표지·섹션 헤더 배경, 디스플레이 헤드라인. 순흑에 가까운 잉크 블랙.
- **Ink Deep** (`{colors.ink-deep}` — #000000): 푸터·하단 스트립 — 한 단계 더 깊은 검정.
- **Accent** (`{colors.accent}` — #e23b2e): 문서당 단 하나의 액센트(매거진B 시그니처 레드, 호/문서별 스왑 가능). 헤드라인 룰, KPI 숫자 강조, 강조 행 좌측 보더, 브랜드 배지 테두리. **선·강조 전용, 면 채움 금지.**
- **Accent Soft** (`{colors.accent-soft}` — #f3a59e): 종이 위 옅은 액센트 — 보조 라벨, 캡션 강조.

### Surface
- **Paper** (`{colors.paper}` — #ffffff): 기본 페이지 바닥. 본문·표·카드의 캔버스. 종이 그대로 비운다.
- **Paper Card** (`{colors.paper-card}` — #fafafa): 카드·표 셀 배경 — 종이보다 한 톤만 낮게.
- **Mist** (`{colors.mist}` — #f0f0ef): 표 헤더 행·구분 스트립의 옅은 회색.
- **Ink Band** (`{colors.ink-band}` — #111111): 표지·섹션 헤더 밴드 (= `{colors.ink}`, 표면 역할 별칭).

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #e3e3e1): 종이 위 1px 구분선. 표 행 사이, 섹션 사이, 카드 외곽.
- **Hairline Ink** (`{colors.hairline-ink}` — #111111): 표 상단·헤드라인 아래 잉크 1px 룰. = `{colors.ink}`.

### Text
- **Ink Text** (`{colors.ink-text}` — #1a1a1a): 종이 위 본문·표 기본 텍스트.
- **Ink Soft** (`{colors.ink-soft}` — #6b6b6b): 보조 텍스트·해석 라벨·캡션.
- **On Ink** (`{colors.on-ink}` — #ffffff): 잉크 밴드 위 텍스트 (= 종이 화이트).
- **Muted** (`{colors.muted}` — #9a9a98): 푸터 링크, 페이지 번호, 메타데이터.

### Semantic
- **Alert** (`{colors.alert}` — #d63227): 적자 부문·마진누수·재고 임박 경보. 액센트 레드 계열이라 톤을 깨지 않는다.
- **Caution** (`{colors.caution}` — #c08a1e): 주의 신호(검토 대기·차이 큼). 머스타드 톤.
- **Positive** (`{colors.positive}` — #3f6f4a): 흑자 우위·목표 초과 — 절제된 그린.

## Typography

### Font Family
디스플레이·본문·표·라벨 **모두 산세리프 단일 패밀리** (`Pretendard`, 영문 `Helvetica Neue` / `Inter`). Fallback 스택: `"Pretendard", "Helvetica Neue", Inter, -apple-system, "Apple SD Gothic Neo", sans-serif`.

위계는 **크기·굵기·자간**으로만 만든다. 세리프·장식체·이탤릭 디스플레이를 섞지 않는다 — 매거진B 마스트헤드처럼 단정한 그로테스크 한 종류가 시스템 전체를 끌고 간다.

### Hierarchy

| Token | Size | Weight | Line Height | Letter Spacing | Use |
|---|---|---|---|---|---|
| `{typography.display-xl}` | 46px | 700 | 1.05 | -0.02em | 표지 타이틀 ("2026 W24 주간 경영 리뷰") |
| `{typography.display-lg}` | 32px | 700 | 1.1 | -0.015em | 섹션 헤더 ("채널×제품 마진 분석") |
| `{typography.display-md}` | 28px | 700 | 1.15 | -0.01em | KPI 숫자 |
| `{typography.title-lg}` | 19px | 600 | 1.3 | -0.005em | 카드 타이틀, 표 캡션 |
| `{typography.label-uppercase}` | 11px | 600 | 1.3 | 0.14em | KPI 라벨, 인덱스 ("OPERATING PROFIT") — 대문자 |
| `{typography.body-md}` | 15px | 400 | 1.7 | 0 | 본문·해석 줄 |
| `{typography.body-sm}` | 13px | 400 | 1.6 | 0 | 표 본문, 보조 설명 |
| `{typography.table-num}` | 14px | 500 | 1.4 | 0 | 표 안 숫자 — tabular-nums 정렬 |
| `{typography.caption}` | 11px | 400 | 1.4 | 0.02em | 캡션, 출처, 페이지 번호 |

### Principles
디스플레이는 700 + 좁은 음수 자간으로 또렷하게, 본문은 400 + 넓은 행간(1.7)으로 가라앉힌다. KPI 라벨·인덱스 카테고리만 대문자 + 0.14em 트래킹으로 "편집물 인덱스" 인상을 준다. 표 안 숫자는 반드시 tabular-nums로 자릿수를 맞춰 매출·수량 정렬이 흐트러지지 않게 한다.

### Note on Font Substitutes
Pretendard가 없으면 `Helvetica Neue` → `Inter` → 시스템 산세리프. 한글은 `Pretendard`가 1순위이며 웹폰트로 임베드한다 (PDF 출력 시 한글 깨짐 방지). 세리프 대체는 쓰지 않는다 (이 시스템은 산세리프 단일).

## Layout

### Spacing System
- **Base unit:** 4px.
- **Tokens:** `{spacing.xxs}` 4px · `{spacing.xs}` 8px · `{spacing.sm}` 12px · `{spacing.md}` 16px · `{spacing.lg}` 24px · `{spacing.xl}` 32px · `{spacing.xxl}` 48px · `{spacing.section}` 80px.
- **섹션 간 수직 패딩:** `{spacing.section}`(80px) — 매거진 지면처럼 크게 비운다.
- **KPI 밴드 내부:** `{spacing.xxl}`(48px) 상하.
- **카드 내부:** `{spacing.lg}`(24px). 표 셀: 세로 `{spacing.sm}`(12px) / 가로 `{spacing.md}`(16px).

### Grid & Container
- **최대 본문 폭:** A4 인쇄 기준 ~720px 콘텐츠 폭, 좌우 여백 넉넉히.
- **KPI 카드:** 데스크탑 4-up, 태블릿 2-up, 인쇄 4-up 고정.
- **표:** 풀 폭. 세로줄 없이 가로 헤어라인으로만 행 구분.

### Whitespace Philosophy
매거진B 리포트는 여백이 곧 격조다. 표와 표 사이, 헤드라인과 본문 사이에 `{spacing.section}` 여백을 일정하게 둔다. 배경 패턴·그라데이션·박스 채움을 넣지 않는다 — 빈 공간은 종이 그대로 둔다. 강조가 필요하면 색이 아니라 여백과 잉크 룰 한 줄로 처리한다.

## Elevation & Depth

| Level | Treatment | Use |
|---|---|---|
| Flat | 그림자·보더 없음 | 본문 섹션, 푸터 |
| Soft hairline | 1px `{colors.hairline}` | 표 행, 섹션 구분, 카드 외곽 |
| Ink rule | 1px `{colors.ink}` 상단 룰 | 표 상단, 헤드라인 아래 |
| Accent rule | 1px `{colors.accent}` 짧은 룰 | 표지·섹션 헤드라인 아래 강조 |
| Card surface | `{colors.paper-card}` 배경 + 미세 그림자 (0 1px 2px rgba(0,0,0,.04)) | KPI 카드 |
| Ink band | `{colors.ink}` 풀 폭 밴드 | 표지, 섹션 헤더 |

드롭섀도는 거의 쓰지 않는다. 깊이는 종이와 잉크 밴드의 명암 대비, 그리고 헤어라인에서 나온다.

### Decorative Depth
- **Accent Rule** (`{component.accent-rule}`): 표지·섹션 헤드라인 아래에 들어가는 폭 40~64px의 짧은 액센트 1px 룰. 시스템의 거의 유일한 장식. 의미를 표시할 때만 절제해서.
- **Issue Badge** (`{component.issue-badge}`): 호(또는 보고 주차)를 감싸는 잉크 테두리 배지 ("W24" / "No.100"). 매거진B 인덱스 감성.

## Shapes

### Border Radius Scale

| Token | Value | Use |
|---|---|---|
| `{rounded.none}` | 0px | 표, 풀폭 밴드, 표지 — 직각 기조 |
| `{rounded.sm}` | 4px | KPI 카드, 입력 — 유일하게 살짝 둥글게 |
| `{rounded.md}` | 8px | 강조 카드 (대표 코멘트 박스) |
| `{rounded.full}` | 9999px | 채널 태그 칩, 상태 칩 |

라운드 위계는 "표·표지는 직각, 카드는 4px, 칩만 원형." 매거진의 클래식한 직각 프레임 감성.

### Photography Geometry
사진을 쓸 경우(표지 브랜드 이미지) 3:4(매거진B 판형 170×240 비율) 또는 1:1, `{rounded.none}` 직각. 본문은 사진보다 타이포·표 중심이라 이미지는 표지에만 절제해서 쓴다.

## Components

### Top / Cover
**`report-cover`** — 잉크 풀 폭 표지. `{colors.ink}` 배경에 화이트 산세리프 `{typography.display-xl}` 타이틀, 그 아래 액센트 룰(`{component.accent-rule}`), 하단에 회사명·기간·작성자를 `{typography.label-uppercase}`로. 좌상단 작은 "B" 레터마크.

**`section-header`** — 각 섹션 시작. 잉크 밴드 또는 종이 위 산세리프 `{typography.display-lg}` + 아래 잉크/액센트 룰. 잉크 밴드일 때 텍스트는 `{colors.on-ink}`.

### KPI
**`kpi-card`** — 한눈 요약 4장. 배경 `{colors.paper-card}`, `{rounded.sm}`, 패딩 `{spacing.lg}`. 상단에 `{typography.label-uppercase}` 라벨(`{colors.ink-soft}`), 가운데 산세리프 `{typography.display-md}` 숫자(`{colors.ink}`, 강조 시 `{colors.accent}`), **하단에 한 줄 해석 라벨**(`{typography.body-sm}`, `{colors.ink-soft}`). 숫자만 두는 카드는 미완성.

**`kpi-band`** — KPI 카드 4장을 감싸는 잉크 풀 폭 밴드(선택). 카드는 밴드 위에 종이로 떠 있다.

### Tables
**`data-table`** — 손익·채널·마진 표. 헤더 행 배경 `{colors.mist}`, 텍스트 `{colors.ink-text}` `{typography.label-uppercase}`. 본문 행은 `{colors.paper}` / `{colors.paper-card}` 교차(zebra) 또는 화이트 단일. 표 상단에 잉크 1px 룰, 행 사이 `{colors.hairline}` 1px. 세로줄 없음. 숫자 셀은 `{typography.table-num}` 우측 정렬 tabular-nums.

**`table-emphasis-row`** — 매출↔마진 순위 역전 행, 적자 부문, 재고 임박 등 강조 행. 배경 옅은 `{colors.mist}`, 첫 셀에 `{colors.accent}` 좌측 3px 보더. 텍스트 굵게(600).

### Callouts
**`exec-comment-box`** — 대표 보고용 헤드라인 코멘트. `{colors.paper-card}` 배경, `{rounded.md}`, 좌측 `{colors.accent}` 4px 보더, 산세리프 `{typography.title-lg}` 굵게. "매출 1등 제품이 마진 1등은 아니다" 같은 한 줄이 여기 들어간다.

**`alert-chip`** — 적자·마진누수·재고 임박 경보 칩. `{rounded.full}`, 배경 투명, 1px `{colors.alert}` 테두리, 텍스트 `{colors.alert}` `{typography.caption}`. 주의(검토 대기·차이 큼)는 `{colors.caution}` 버전, 흑자 우위는 `{colors.positive}` 버전.

**`issue-badge`** — 보고 주차/호 배지. `{rounded.none}` 또는 `{rounded.sm}`, 1px `{colors.ink}` 테두리, 산세리프 라벨, 종이 배경. 매거진 인덱스처럼.

### Inputs & Forms
**`text-input`** — (대시보드 변형 시) 배경 `{colors.paper-card}`, 1px `{colors.hairline}`, `{rounded.sm}`, 포커스 시 보더 `{colors.accent}`. 텍스트 `{typography.body-md}`.

**`channel-tag`** — 채널 필터 칩(자사몰·한남·국내서점·해외). `{rounded.full}`, 비활성은 1px `{colors.hairline}` 테두리 투명 배경, 활성은 `{colors.ink}` 배경 + 화이트 텍스트.

### Footer
**`footer`** — 하단 `{colors.ink-deep}` 스트립. 텍스트 `{colors.on-ink}`, 페이지 번호·작성자·출처를 `{typography.caption}`로. 좌측 "B" 레터마크. 절대 반전하지 않는다 (항상 검정).

## Do's and Don'ts

### Do
- 디스플레이·본문·표 **모두 산세리프 단일 패밀리**로 통일한다. 위계는 크기·굵기·자간으로.
- 액센트는 **문서당 하나만**, 선·강조에만 — 헤드라인 룰, KPI 숫자, 강조 행 좌측 보더.
- KPI 숫자 아래 **한 줄 해석 라벨**을 반드시 짝지운다. 숫자만 둔 카드는 off-brand.
- 표는 가로 헤어라인으로만 행을 가르고, 표 상단에 잉크 1px 룰을 둔다.
- 매출↔마진 역전 행·적자 부문은 `{component.table-emphasis-row}`로 액센트 좌측 보더 강조.
- 여백은 `{spacing.section}`(80px)로 일정하게. 강조는 색이 아니라 여백·헤어라인으로.
- 표 안 숫자는 tabular-nums로 자릿수를 맞춘다.
- 액센트 컬러는 교체 가능한 토큰으로 다룬다 — 호별 브랜드 컬러처럼 문서마다 스왑 가능.

### Don't
- 액센트를 **면(fill)으로 쓰지 않는다.** 액센트 버튼·배경 금지 — 선·강조 전용.
- 한 문서에 액센트 컬러를 둘 이상 넣지 않는다 (매거진B는 호당 하나의 브랜드 컬러).
- 세리프·장식체·이탤릭 디스플레이를 섞지 않는다 (산세리프 단일 시스템).
- 배경에 그라데이션·텍스처·패턴을 깔지 않는다. 빈 공간은 종이 그대로.
- 표 안 숫자에 장식체를 쓰지 않는다 (정렬·판독 저하).
- 경보 색(`{colors.alert}`/`{colors.caution}`)을 본문 전반에 남발하지 않는다 — 경보 칩·행에만.
- 표지·헤더가 아닌 본문 섹션을 잉크로 반전하지 않는다 (가독 저하).

## Responsive Behavior

### Breakpoints

| Name | Width | Key Changes |
|---|---|---|
| Print (A4) | 720px 콘텐츠 | KPI 4-up 고정, 표 풀폭, 페이지 나눔 |
| Mobile | < 768px | KPI 4-up → 2-up; 표 가로 스크롤; 표지 타이틀 46→30px |
| Tablet | 768–1024px | KPI 2-up; 표 풀폭 |
| Desktop | > 1024px | KPI 4-up; 본문 폭 720px 중앙 정렬 |

### Touch Targets
- `{component.channel-tag}` 칩은 높이 36px 이상, 좌우 패딩 16px.
- 필터·버튼 최소 44px 탭 영역.

### Collapsing Strategy
- KPI 카드는 컬럼 수만 줄이고(4→2) 카드 자체는 축소하지 않는다.
- 표는 모바일에서 가로 스크롤. 핵심 컬럼(제품·채널·마진율)은 좌측 고정 권장.
- 잉크 룰·헤어라인 두께는 모든 브레이크포인트에서 1px 유지.

### Image Behavior
- 표지 이미지는 3:4/1:1 유지, 레터박스 금지. 모바일에서 세로 크롭.

## Iteration Guide

1. 한 번에 한 컴포넌트만. 토큰 키로 참조 (`{component.kpi-card}`, `{component.data-table}`).
2. 새 컴포넌트는 `{rounded.none}` 또는 `{rounded.sm}`(4px) 기본. 원형은 칩만.
3. 변형(`-emphasis`, `-active`)은 `components:`에 별도 항목.
4. 토큰 키로만 참조 — 인라인 hex 금지.
5. hover 상태는 문서화하지 않는다. 기본·강조(active)만.
6. 디스플레이·본문 모두 산세리프 — 세리프를 섞어 위계를 만들지 않는다.
7. 액센트는 문서당 하나의 브랜드 시그널 — "주 액션 색"으로 확장하지 않는다.
8. 강조가 고민되면: 색을 더하기 전에 여백을 키우고 헤드라인을 키운다.

## Known Gaps

- 매거진B / 비미디어컴퍼니 공식 BI의 정확한 PANTONE·HEX 값은 **미확인** — 미니멀 에디토리얼 톤(순백+잉크 블랙+시그니처 레드)을 기준으로 한 합리적 추정값. 실제 BI가 확인되면 `{colors.ink}`/`{colors.accent}` 교체.
- 마스트헤드 'B'·본문 정확한 폰트명은 **미확인** — 그로테스크 산세리프(Helvetica 계열로 관찰)를 기준으로 Pretendard 대체. 실제 폰트 확인 시 교체.
- 액센트 레드(`{colors.accent}` — #e23b2e)는 시그니처 레드 추정값. 매거진B는 호마다 브랜드 컬러가 다르므로, 이 토큰은 본래 **교체 전제** — 특정 보고서/호에 맞춰 스왑하는 것이 정상 동작.
- 표지 사진 에셋(브랜드 이미지)은 미포함 — 데모에서는 타이포·표 중심으로 출력하고, 사진은 선택.
- 차트 색 팔레트는 잉크→액센트→그레이 스텝을 권장하나 정확한 단계는 산출물에서 확정.
- 애니메이션·트랜지션(대시보드 변형 시)은 범위 밖.
