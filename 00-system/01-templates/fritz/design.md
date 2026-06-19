# 프릳츠(Fritz Coffee Company) Design Guide

> 단일 출처 비주얼 아이덴티티. PDF 보고서·HTML 대시보드·랜딩·슬라이드 어떤 산출물이든
> 이 파일을 참조하면 프릳츠 톤이 즉시 적용된다.
> 리서치(fritz.co.kr·@fritzcoffeecompany·브랜드 미디어, 2026-06)로 확인된 톤만 반영.
> 정확한 브랜드 Hex는 공개 가이드라인이 없어 **시각 근사값**을 사용한다 (Known Gaps 참조).

## Overview

프릳츠의 비주얼은 **한국 1970~80년대 레트로 빈티지** 미학을 일관되게 끌고 간다. 캔버스는 인쇄지를 닮은 **따뜻한 미색(크림)**(`{colors.canvas}` — 종이 톤)이고, 그 위에 **강한 원색 레드와 딥블루 2색**(`{colors.fritz-red}` / `{colors.fritz-blue}`)이 실크스크린·판화처럼 얹힌다. 미니멀이 아니라 "복잡하지만 일관된 레트로 일러스트레이션" — 커피잔을 든 **물개 캐릭터**(`{component.seal-mark}`)가 전통 문양 사각 프레임 안에 들어간 로고가 시그니처이고, 같은 캐릭터가 포스터·스티커·굿즈에 반복된다.

브랜드의 보이스는 "촌스러움과 세련됨의 공존"이다. 받침을 의도적으로 구자체(프릳**츠**)로 쓰는 한글 타이포처럼, 정제된 스페셜티 제품을 **복고적이고 친근한 손맛**으로 감싼다. voltage(시각적 긴장)는 레드+블루 2색의 강한 대비와 레트로 일러스트에서 나오고, 여백은 종이 질감 위에서 넉넉하게 숨 쉰다.

산출물에 적용할 때 핵심은 **2색 절제**다. 레드와 블루는 강조·구획·도식에만 쓰고, 본문은 거의 잉크에 가까운 딥블루 텍스트(`{colors.ink}`)로 종이 위에 인쇄된 느낌을 낸다. 화려한 그라데이션·드롭섀도는 쓰지 않는다 — 평면 인쇄물의 질감이 프릳츠다.

**Key Characteristics:**
- 캔버스는 종이를 닮은 따뜻한 미색(`{colors.canvas}`) — 순백 배경은 쓰지 않는다.
- 시그니처는 **레드 + 블루 2색**(`{colors.fritz-red}` / `{colors.fritz-blue}`). 강조·구획·도식 전용. 본문 텍스트는 딥블루 잉크(`{colors.ink}`).
- 물개 캐릭터 마크(`{component.seal-mark}`)가 전통 문양 사각 프레임 안에 든 로고. 같은 캐릭터를 액센트로 반복.
- 타이포는 **레트로 세리프/구자체 무드**. 디스플레이는 묵직한 세리프, 본문은 가독 위주 산세리프 또는 세리프.
- 평면 인쇄 질감 — 그라데이션·드롭섀도 최소. 구분선은 1px 헤어라인(`{colors.hairline}`)으로.
- 모서리는 약간만 둥글게(`{rounded.sm}`)거나 직각(`{rounded.none}`). 카드는 인쇄 카드처럼 단정하게.
- 여백은 종이 위 편집물처럼 넉넉히: 섹션 간 `{spacing.section}`, 카드 내부 `{spacing.xl}`.

## Colors

### Brand & Accent
- **Fritz Red** (`{colors.fritz-red}` — #D6312B): 시그니처 2색 중 강조 레드. 실크스크린 원색 느낌. 헤드라인 강조·주요 도식·핵심 수치 하이라이트. CTA 가능.
- **Fritz Blue** (`{colors.fritz-blue}` — #1E3A8C): 시그니처 2색 중 딥블루. 구획·표 헤더·보조 도식. 본문 잉크와 같은 계열.
- **Accent Soft Red** (`{colors.accent-soft-red}` — #E8746E): 레드의 옅은 변형. 배경 칩·태그·은은한 강조.

### Surface
- **Canvas** (`{colors.canvas}` — #F4EDE0): 기본 페이지 바닥. 따뜻한 미색 종이 톤.
- **Surface Soft** (`{colors.surface-soft}` — #EFE6D6): 표 셀·푸터 인접 스트립용 한 톤 진한 종이색.
- **Surface Card** (`{colors.surface-card}` — #FBF6EC): 카드 배경. 캔버스보다 살짝 밝아 종이 위 카드처럼 떠 보임.
- **Surface Ink** (`{colors.surface-ink}` — #1E3A8C): 반전 밴드(히어로·강조 섹션) 배경. 딥블루 위 크림 텍스트.

### Hairlines & Borders
- **Hairline** (`{colors.hairline}` — #D8CBB4): 종이 위 1px 구분선. 섹션·표 행·카드 외곽.
- **Hairline Strong** (`{colors.hairline-strong}` — #C2B393): 강조 구분선·표 헤더 하단 라인.

### Text
- **Ink** (`{colors.ink}` — #1A2A52): 본문·헤드라인 기본 잉크. 딥블루에 가까운 짙은 톤 — 검정 대신 인쇄 잉크 느낌.
- **Body** (`{colors.body}` — #3E4A6B): 본문 러닝 텍스트. 잉크보다 한 톤 부드럽게.
- **Muted** (`{colors.muted}` — #8A8273): 캡션·메타·푸터 링크. 종이에 묻어나는 회갈색.
- **On Ink** (`{colors.on-ink}` — #F4EDE0): 딥블루 반전 밴드 위 텍스트(캔버스 크림과 동일).

### Semantic
- **Positive** (`{colors.positive}` — #2E7D5B): 매출 상승·달성 등 긍정 지표 (절제해서).
- **Negative** (`{colors.negative}` — #D6312B): 하락·위험 — Fritz Red와 동일 톤 재사용.
- **Warning** (`{colors.warning}` — #C8901F): 과재고·마진누수 등 주의 신호.

## Typography

### Font Family
디스플레이는 **레트로 무드의 세리프**, 본문은 가독 위주. 프릳츠 공식 폰트명은 미공개이므로 시스템 대체 스택을 쓴다.
- 디스플레이/헤드라인: `"Nanum Myeongjo", "Noto Serif KR", Georgia, serif` — 구자체·복고 무드.
- 본문/UI: `"Pretendard", "Noto Sans KR", -apple-system, sans-serif` — 가독성.

### Hierarchy
| 토큰 | 용도 | 크기/두께(데스크톱) |
|------|------|---------------------|
| `{typography.display-xl}` | 표지·히어로 타이틀 | 44–52px / 700 serif |
| `{typography.display-lg}` | 섹션 대제목 | 32px / 700 serif |
| `{typography.heading}` | 소제목 | 22px / 600 serif |
| `{typography.label-uppercase}` | 라벨·카테고리 | 12px / 600 / letter-spacing 0.08em |
| `{typography.body-lg}` | 리드 문단 | 18px / 400 |
| `{typography.body-md}` | 기본 본문 | 15px / 400 |
| `{typography.caption}` | 캡션·메타 | 12px / 400 muted |
| `{typography.number}` | KPI 수치 | 28–36px / 700 serif, Fritz Red 강조 가능 |

### Principles
- 디스플레이는 세리프로 복고 무드, 본문은 산세리프로 가독 — 둘을 섞되 역할을 흐리지 않는다.
- 라벨은 작게·자간 넓게(`{typography.label-uppercase}`) 인쇄물 캡션처럼.
- 숫자(KPI)는 세리프로 크게, 강조가 필요하면 Fritz Red.

### Note on Font Substitutes
프릳츠 실제 서체는 비공개. 위 스택은 "구자체 세리프 + 가독 산세리프"라는 확인된 무드를 시스템 폰트로 근사한 것. 실제 패키지 서체와 다를 수 있음.

## Layout

### Spacing System
- `{spacing.section}` — 64px (섹션 간)
- `{spacing.xxl}` — 48px (히어로 밴드 내부)
- `{spacing.xl}` — 32px (카드 내부)
- `{spacing.lg}` — 24px
- `{spacing.md}` — 16px
- `{spacing.sm}` — 8px

### Grid & Container
- 최대 콘텐츠 폭 960–1080px, 중앙 정렬. 인쇄물 한 단~두 단 편집 느낌.
- 카드 그리드는 12컬럼 기준, KPI 카드는 3–4열.

### Whitespace Philosophy
종이 편집물처럼 여백을 충분히. 요소를 빽빽이 채우기보다, 2색 강조가 여백 위에서 도드라지게.

## Elevation & Depth

| Level | 용도 | 처리 |
|-------|------|------|
| 0 | 캔버스 | 그림자 없음 |
| 1 | 카드 | 1px 헤어라인 테두리(`{colors.hairline}`) + 거의 없는 그림자 |
| 2 | 강조 카드/반전 밴드 | 딥블루 면(`{colors.surface-ink}`)으로 구분, 그림자 대신 색면 |

### Decorative Depth
깊이는 **그림자가 아니라 색면과 헤어라인**으로 만든다. 평면 인쇄 질감 유지. 물개 마크·전통 문양 일러스트를 워터마크처럼 옅게 깔 수 있다.

## Shapes

### Border Radius Scale
| 토큰 | 값 | 용도 |
|------|----|----|
| `{rounded.none}` | 0px | 표·구획 라인·인쇄 카드 |
| `{rounded.sm}` | 4px | 버튼·칩·작은 카드 |
| `{rounded.md}` | 8px | 큰 카드 (최대치 — 그 이상 둥글게 X) |
| `{rounded.full}` | 9999px | 물개 마크 원형 배지·아이콘 버튼만 |

### Photography Geometry
제품 사진은 종이 위 인쇄물처럼 직각 또는 4px 라운드. 풀블리드 대신 여백을 두고 배치. 일러스트(물개)와 사진을 섞을 때 일러스트가 액센트.

## Components

### Top Navigation
크림 캔버스 위 딥블루 잉크 텍스트. 로고(물개 마크) 좌측, 메뉴 우측. 하단 1px 헤어라인. 그림자 없음.

### Buttons
- **Primary** (`{component.button-primary}`): Fritz Red 면 + 크림 텍스트, `{rounded.sm}`. 호버 시 한 톤 진하게.
- **Secondary**: 투명 배경 + 딥블루 테두리 1px + 딥블루 텍스트.
- **Ghost**: 텍스트만, 밑줄 호버.

### Cards & Containers
`{colors.surface-card}` 배경 + `{colors.hairline}` 1px 테두리 + `{rounded.sm/md}`. 인쇄 카드처럼 단정. KPI 카드는 큰 세리프 숫자(`{typography.number}`) + 아래 해석 한 줄.

### Inputs & Forms
크림 배경 + 헤어라인 테두리. 포커스 시 Fritz Blue 테두리. `{rounded.sm}`.

### Signature Components
- **Seal Mark** (`{component.seal-mark}`): 물개 캐릭터가 전통 문양 사각/원형 프레임 안에 든 로고. 표지·푸터·워터마크.
- **Two-Color Rule** (`{component.two-color-rule}`): 레드+블루 2색 굵은 구분선(4px) — 섹션 구획 시그니처.
- **Paper Band** (`{component.paper-band}`): 딥블루 반전 밴드(`{colors.surface-ink}`) — 히어로·핵심 인용에 사용, 위에 크림 텍스트.

### Footer
`{colors.surface-soft}` 배경 + 물개 마크 + 매장/연락처 + 헤어라인 상단 구분. muted 텍스트.

## Do's and Don'ts

### Do
- 캔버스는 따뜻한 미색 종이 톤으로.
- 레드+블루 2색을 강조·구획·도식에만 절제해서.
- 본문은 딥블루 잉크로 — 인쇄물 느낌.
- 물개 마크를 표지·푸터·워터마크에 시그니처로.
- KPI 숫자는 세리프로 크게, 필요 시 Fritz Red.
- 평면 인쇄 질감 — 헤어라인과 색면으로 구획.

### Don't
- 순백(#FFFFFF) 배경 쓰지 않기 — 종이 톤이 프릳츠.
- 레드·블루를 본문 전체에 남발하지 않기 (강조력 소실).
- 화려한 그라데이션·드롭섀도 쓰지 않기.
- 과하게 둥근 모서리(16px+) 쓰지 않기.
- 물개 마크를 변형·왜곡하지 않기.
- 다른 브랜드 톤(다크 모드·네온) 섞지 않기.

## Responsive Behavior

### Breakpoints
| 이름 | 폭 |
|------|----|
| Mobile | < 640px |
| Tablet | 640–1024px |
| Desktop | > 1024px |

### Touch Targets
버튼·링크 최소 44×44px.

### Collapsing Strategy
KPI 4열 → 모바일 1–2열. 표는 가로 스크롤 또는 카드형 전환.

### Image Behavior
제품 사진은 비율 유지, 여백 두고 축소. 워터마크 물개는 모바일에서 생략 가능.

## Iteration Guide
1. 새 산출물은 캔버스(크림) + 잉크(딥블루) 2색 본문에서 시작.
2. 강조가 필요한 곳에만 Fritz Red.
3. 구획은 Two-Color Rule 또는 헤어라인.
4. 표지·핵심 인용엔 Paper Band(딥블루 반전).
5. 숫자는 세리프로 크게.
6. 그림자 대신 색면·헤어라인으로 깊이.
7. 물개 마크는 시그니처로 1회 이상.
8. 2색 원칙을 깨야 할 것 같으면 멈추고 여백·타이포로 먼저 푼다.

## Known Gaps
- **정확한 브랜드 Hex 미확인**: 공개 브랜드 가이드라인 없음. 위 Fritz Red/Blue는 "강한 원색 레드+딥블루"라는 확인된 무드의 **시각 근사값**. 실제 패키지 실물 스캔으로 보정 필요.
- **공식 서체명 미확인**: 시스템 대체 스택 사용.
- **물개 마크 에셋**: 본 가이드는 톤만 정의. 실제 로고 파일은 별도 확보 필요.
- 모션/인터랙션 가이드 미스코프(정적 산출물 우선).
