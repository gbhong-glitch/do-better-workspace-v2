# Do Better Workspace 가이드

> Claude Code + Johnny Decimal 기반 PKM 워크스페이스.
> 이 파일은 Claude Code가 매 세션 시작 시 자동으로 읽는 프로젝트 지침입니다.
> 본인 프로필(이름, 역할, 관심사)은 이 파일 하단의 "내 프로필" 섹션을 직접 작성하거나 `/setup-workspace` 스킬로 채우세요.

## 폴더 구조 (Johnny Decimal)

```
00-inbox/      # 임시 캡처 (20개 미만 유지, 주간 처리)
00-system/     # 시스템 설정, 템플릿, 가이드
10-projects/   # 활성 프로젝트 (시한부)
20-operations/ # 지속적 운영 (종료일 없음)
30-knowledge/  # 지식 (00-wiki + 도메인 아카이브)
40-personal/   # 개인 노트 (daily, weekly, ideas, reflections, todos)
50-resources/  # 외부 자료, 첨부파일
90-archive/    # 완료/중단 항목
```

### 주요 하위 폴더

| 번호 | 폴더 | 용도 |
|------|------|------|
| **00-wiki** | 30-knowledge/ | **지식 위키 (복리 축적). 아래 Wiki Schema 참조** |
| 41-daily | 40-personal/ | Daily Notes (월별: 41-daily/YYYY-MM/) |
| 42-weekly | 40-personal/ | Weekly Review |
| 43-ideas | 40-personal/ | 아이디어 캡처 |
| 44-reflections | 40-personal/ | 회고 및 학습 |
| 46-todos | 40-personal/ | active-todos.md |
| 37-claude-code | 30-knowledge/ | Claude Code 관련 지식 |

## Wiki (30-knowledge/00-wiki/)

지식이 복리로 축적되는 위키. 주제에 대해 물으면 **00-wiki/index.md를 먼저 확인**.

@30-knowledge/00-wiki/SCHEMA.md

## 파일 명명 규칙

| 유형 | 형식 | 예시 |
|------|------|------|
| Daily Note | `YYYY-MM-DD.md` | 2026-04-24.md |
| 주제 노트 | `주제명.md` | thinking-partner.md |
| JD 폴더 | `XX-name` 또는 `XX.YY-name` | 37-claude-code, 37.01-learning |
| 중복 파일명 | JD prefix 필수 | 18-progress-tracker.md |

## Inbox 관리 (00-inbox)

- **목적**: 임시 캡처, 영구 저장소 아님
- **규칙**: 20개 미만 유지
- **주기**: 주간 처리 (Capture → Process → Organize)

## 첨부파일 (50-resources/attachments/)

- 모든 비텍스트 파일 저장
- 명명: `[관련노트]_[설명].[ext]`

## Skills 사용

이 워크스페이스의 `.claude/skills/`에 프로젝트 전용 스킬이 있습니다.
스킬은 키워드 기반으로 **자동 트리거**됩니다. (수동 슬래시 커맨드 아님)

예: "오늘 daily note 만들어줘" → `daily-note` 스킬 자동 실행
예: "할 일 추가해줘" → `todo` 스킬 자동 실행

## Agents 사용

`.claude/agents/`에 서브에이전트가 있습니다. 복잡한 작업을 Claude가 자동으로 위임하거나, 명시적으로 "research-worker로 조사해줘" 같이 호출할 수 있습니다.

---

## panel-mfg 웹앱 컨텍스트

심플라인 사내 제조관리 웹앱. 판금 부품 수주·생산·불량·개선 흐름을 디지털화.

| 항목 | 내용 |
|------|------|
| **기술스택** | Next.js + TypeScript, Tailwind CSS |
| **배포** | Vercel (`panel-mfg.vercel.app`) |
| **DB** | Google Sheets (Sheets API) |
| **인증** | Google OAuth + 커스텀 쿠키 세션 |

### Google Sheets 탭 구조 (6탭)

| 탭 | 역할 |
|----|------|
| 업체 | 거래처 마스터 |
| 프로젝트 | 수주 프로젝트 목록 |
| 부품 | 프로젝트별 부품 명세 |
| 활동로그 | 생산 진행 이력 |
| 불량 | 불량 접수·처리 기록 |
| 개선요청 | 설계·공정 개선 요청 |

### 코드 리뷰·의사결정 시 유의사항

- Sheets API 호출은 읽기/쓰기 모두 `googleapis` 클라이언트 경유
- 인증 쿠키 세션은 서버사이드에서만 검증 (클라이언트 노출 금지)
- Vercel 환경변수로 Google 서비스 계정 키·OAuth 클라이언트 ID 관리

---

## 내 프로필

**이름**: 보기님
**역할**: 판금 제조회사 심플라인의 설계 실무자. SolidWorks·AutoCAD로 판금(sheet metal) 부품 설계, Salvagnini P4 패널벤더 프로그래밍 담당. 사내 제조관리 디지털화를 위해 Next.js·TypeScript 기반 웹앱을 직접 개발 중.
**관심사**:
- 판금 제조관리 웹앱(panel-mfg) 개발 — Next.js·TypeScript·Tailwind, Vercel 배포, Google Sheets/Drive 연동
- AI 도구를 판금 설계·견적 실무에 접목 (CadQuery/STEP 기반 견적 자동화 등)
- P4 패널벤더 프로그래밍과 설계 워크플로우를 데이터로 체계화
**이 워크스페이스 용도**:
- 일일 업무 기록(daily note)과 할 일 관리
- 진행 중인 프로젝트 관리 — panel-mfg 앱, STEP 견적 시스템 개발 추적
- 판금 설계·P4 프로그래밍 실무 노하우와 AI 활용법을 지식 위키로 누적
- 결정·검토가 필요할 때 Claude와 코드 리뷰 및 의사결정 정리
- **핵심 목표**: 업무 지식이 흩어지지 않고 한 곳에 쌓여 재활용되는 워크스페이스

_작성일: 2026-06-24_

---

**Last Updated**: 2026-06-26
