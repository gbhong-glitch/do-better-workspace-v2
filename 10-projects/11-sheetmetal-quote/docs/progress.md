# 판금 견적 웹앱 — 작업 진행 현황

최종 업데이트: 2026-06-28

---

## 완성된 기능 (지시 1~5)

### 지시 1 · DXF 뷰어
- DXF 파일 업로드 → SVG 렌더링 (LINE / ARC / CIRCLE / LWPOLYLINE / SPLINE / MTEXT / INSERT)
- 레이어별 색상 구분, pan/zoom (핀치 포함), `vector-effect="non-scaling-stroke"` 1px 선
- Y축 플립 (`matrix(1,0,0,-1,0,K)`) — DXF Y-up → SVG Y-down 정규화

### 지시 2 · 드래그 조립체 선택
- 모드 전환: 이동 ↔ 선택
- 드래그로 여러 박스 생성, 박스마다 이름 편집 가능
- 스크린 픽셀 → DXF 좌표 역변환으로 박스 좌표 계산
- `selectStart.current` stale closure 버그 수정 (로컬 변수 캡처)

### 지시 3 · 영역 인식 (parse_simpleline.py → TypeScript 이식)
- 재단방식 레이어(레이저/복합기/NCT/절단) TEXT → 세부부품 라벨 생성
- 절곡선 → Y최근접 라벨 자동 배정 (굽힘선아래로 / 굽힘선위로)
- 재단길이 = 절곡 바운딩박스 ±50mm 안 외형선 합계
- SW_노트 → 재질(MAT_RE) / 두께(THICK_RE) / 수량(QTY_RE) 추출
- INSERT 블록 이름 분류 → 버링업 / 엠보싱업 / 버링탭 / 탭가공 / 자석부착 / 러버
- layer-0 TEXT 파이프 절단 표(`품번` 헤더 기준)
- 박스 생성 시 클라이언트 사이드 동기 실행 (API 왕복 없음)

### 지시 4 · 인식 결과 테이블
- 하단 패널 (240px): 박스별 탭 전환
- 부품 테이블: 순번 / 재단방식(배지) / 절곡↓(red) / 절곡↑(orange) / 합계 / 재단길이(blue) / 재질 / 두께 / 수량
- 합계 행: 총 절곡수 + 미배정 카운트
- 특수가공 인라인 표시, 파이프 절단 테이블

### 지시 5 · 단품 도면 대응 & 검증
- **문제 발견**: 샘플 파일(Drawing2, 하부장C)은 레이저/복합기 레이어 없는 단품 전개도
  - SW_노트(SPCC, 1t)가 도면 우측 제목란에 위치 — 박스에서 ~2000mm 떨어짐
  - `하부장C` 수량 `"ea / Set"` (숫자 없음) → QTY_RE 미매칭 (실제 미기재, 정상)
- **수정 ①** `recognizer.ts` — SW_노트 전역 폴백: 200mm 여유 박스 내 미검출 시 도면 전체 검색
- **수정 ②** `recognizer.ts` — 단품 폴백: 재단 라벨 없고 절곡/외형선 있으면 부품 1개로 생성, 외형선 전체 합을 재단길이로 사용
- **수정 ③** `viewer/page.tsx` — 단품 도면 안내 배너 + 재단방식 수동 드롭다운 (레이저/복합기/NCT/절단)

---

## 만든 파일

| 경로 | 역할 |
|------|------|
| `web/app/viewer/page.tsx` | DXF 뷰어 UI — 렌더, 드래그, 인식 결과 패널 |
| `web/app/api/viewer/route.ts` | POST /api/viewer — DXF → ViewerData JSON |
| `web/lib/dxf-viewer.ts` | DXF 파서 (렌더링용) — DrawEntity 추출 |
| `web/lib/recognizer.ts` | 박스 영역 인식 엔진 — parse_simpleline.py 이식 |
| `web/scripts/test-parser.ts` | 파서 검증 스크립트 (Drawing2 / 하부장C 대조) |
| `samples/parse_dxf.py` | Python PoC — 지상 검증용 |
| `samples/parse_simpleline.py` | Python 원본 — 인식 알고리즘 레퍼런스 |

---

## 다음 할 일

1. **Vercel Neon DB 연결** — Vercel 대시보드에서 Neon Postgres 생성 → `.env.local` 설정 → `npm run db:migrate` 실행
2. **실제 단가 입력** — `/admin/pricing` 에서 재질/두께/공정별 단가 입력 (`pricing_seed.json` 값 현재 전부 0)
3. **견적 계산 연동** — 인식 결과(절곡수, 재단길이, 재질, 두께, 수량) → 원가 공식 적용 → 결과 패널에 금액 표시
4. **PDF 다운로드** — 결과 페이지 버튼 연결 (UI 준비 완료, 구현 미완)
5. **STEP 파싱** — MVP 이후 단계
