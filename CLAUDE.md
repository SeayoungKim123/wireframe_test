# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

PM용 정적 기획서 템플릿 (HTML + CSS + JS). 빌드 시스템·테스트 러너·패키지 매니저 없음 — 검증은 브라우저로 직접 HTML을 여는 것. `README.md`가 진입점, `guide/`에 상세 문서.

## Architecture: 셸 분리

각 기획서는 폴더 안에 세 파일이 함께 산다 (떨어지면 화면이 깨진다):

```
<폴더>/
├── *.html      ← 얇은 본체 (~270줄): HTML 구조 + 인라인 TEMPLATE_CONFIG + spec-data JSON
├── shell.css   ← 공용 스타일 (모든 버전이 공유)
└── shell.js    ← 공용 인프라 JS (모든 버전이 공유)
```

`shell.js` 첫 줄이 `document.documentElement.outerHTML`을 `ORIGINAL_HTML`로 캡처한다. 📌 버전 저장 시 이 캡처본의 `<script id="spec-data">` JSON만 새 데이터로 교체해 다운로드. 따라서:

- **로딩 순서**: 인라인 `<script>`로 `TEMPLATE_CONFIG`(`PAGE_TITLE`, `STORAGE_KEY`)를 먼저 정의 → `<script src="shell.js">`로 인프라 로드. shell.js 앞에 다른 인라인 스크립트를 추가하면 캡처가 흔들린다.
- **다운로드된 HTML도 같은 폴더 구조에 셸 두 파일이 있어야 동작**한다. `versions/v0.X.html` ↔ `../shell.css` / `../shell.js` 관계가 깨지면 화면이 깨진다.

## 편집 앵커 (토큰 절약 + 인프라 보호)

| 앵커 | 수정 주체 |
|---|---|
| `@ANCHOR:CONFIG`  | 사람·AI (페이지 메타) |
| `@ANCHOR:CONTENT` | 사람·AI (와이어프레임 HTML) |
| `@ANCHOR:DATA`    | **브라우저만** — JSON 직접 수정 금지 (구조 깨짐) |

표준 편집 흐름: `Grep("@ANCHOR:...:START")` → `Read(offset, limit)` → 좁은 `Edit`. 콘텐츠 작업에서 `shell.css` / `shell.js`는 건드리지 않는다.

## 두 가지 버전 모델이 공존

| 위치 | 모델 |
|---|---|
| `template/spec_template_base.html` | 단일 파일 + `versions[]` 누적 (자기 모든 버전을 한 HTML에 담음) |
| `sample/reading_log/` | 파일 분리 — 버전마다 `versions/v0.X.html` + `manifest.json` + `index.html` 카탈로그. Vercel 배포용 |

같은 `shell.js`가 두 모델 모두 처리한다. 어느 위치를 작업 중인지 의식할 것. `guide/pending_changes.md`의 "저장 방식 정렬" 항목이 두 모델 통합을 미해결로 추적 중.

## Multi-file edits — 자주 누락되는 함정

`template/spec_template_base.html`, `sample/reading_log/versions/v0.1.html`, `sample/reading_log/versions/v0.2.html` 셋은 **공통 HTML 구조**(컨트롤바·패널·다이얼로그)를 공유한다. 인프라성 변경(토글 위치, 라벨 등)은 보통 셋 모두에 반영해야 한다 — 하나만 고치면 어긋난다.

`shell.css` / `shell.js`도 사본이 두 군데에 존재 (`template/`, `sample/reading_log/`). 인프라 코드 변경 시 두 사본 모두 갱신.

## 검증 방법

- HTML 더블클릭으로 브라우저에서 직접 열기 (`file://` 작동, manifest fetch는 막힘)
- 로컬 서버 필요 시: `npx http-server sample -p 5173`
- 편집 모드 진입: URL에 `?edit=1`
- Vercel 자동 배포 대상은 `sample/` 만 (root 배포 아님)

## Backlog 추적

`guide/pending_changes.md`가 미처리/처리 완료 항목의 단일 진실 소스. 작업 변경이 그 파일에 영향이 있다면 거기에도 반영(처리 완료 섹션에 한 줄 추가).
