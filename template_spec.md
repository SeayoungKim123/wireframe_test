# 화면 설계 템플릿 — 스펙

*작성일: 2026-04-18*

**독자**: 이 템플릿 내부를 이해하거나 수정해야 하는 AI / 개발자.
편집 모드의 **설계 근거**는 [edit_mode_design.md](edit_mode_design.md) 참조 (본 문서는 중복 방지).

---

## 1. 개요

**한 줄**: 한 개의 HTML 파일 안에 와이어프레임 · 핀 설명 · 버전 기록을 모두 담은 self-contained 화면 설계 템플릿.

**언제 쓰나**: PM이 서버·외부 툴 없이 파일 하나로 기획서를 공유·버전관리하고 싶을 때.

**핵심 설계 원칙**

| 원칙 | 설명 |
|---|---|
| HTML = SoT | HTML 파일이 정본(Single Source of Truth). localStorage는 포스트잇. |
| Self-export | 파일이 스스로를 다운로드 (`ORIGINAL_HTML` 캡처 → 데이터만 교체). |
| AI 친화 | `@ANCHOR` 주석으로 수정 영역을 좁혀 토큰 소모 최소화. |

---

## 2. 파일 구조

`spec_template_base.html` 한 파일에 전부 들어있음 (≈2050줄).

```
[1~707]    HEAD + CSS              공용 인프라
[709~744]  상단 컨트롤 바            공용
[746~787]  App / Main + 컨텐츠      공용 틀 + 사용자 영역(@ANCHOR:CONTENT)
[789~805]  스펙 사이드 패널          공용
[807~815]  편집 툴바                공용
[817~820]  힌트                    공용
[822~921]  다이얼로그               공용
[923~941]  Embedded Data           @ANCHOR:DATA
[942~951]  TEMPLATE_CONFIG         @ANCHOR:CONFIG
[952~2050] JS 공용 로직             공용
```

---

## 3. 앵커 시스템

AI가 파일을 수정할 때 **전체 재작성 대신** 앵커로 범위를 좁힘.

| 앵커 | 위치 | 수정 주체 | 비고 |
|---|---|---|---|
| `@ANCHOR:CONFIG`  | `<script>` 상단 | 사람 / AI | `PAGE_TITLE`, `STORAGE_KEY` |
| `@ANCHOR:CONTENT` | `<main>` 내부 | 사람 / AI | 와이어프레임 HTML |
| `@ANCHOR:DATA`    | `<script id="spec-data">` | **브라우저 자동** | 버전 JSON (AI 직접수정 금지) |

**권장 워크플로우**

```
Grep("@ANCHOR:CONTENT:START")   → 라인 번호
Read(offset, limit=20)           → 해당 영역만 읽기
Edit(좁은 범위)                   → 부분 수정
```

---

## 4. 저장 모델 (3단계)

비유는 [edit_mode_design.md §1.2](edit_mode_design.md) 참조.

| 단계 | 저장 위치 | 트리거 | 휘발성 |
|---|---|---|---|
| 자동 저장 | `localStorage[STORAGE_KEY]` | 편집 즉시 | ⚠ 있음 |
| 💾 작업본 저장 | `fileData.draft` 슬롯 + HTML 다운로드 | 툴바 버튼 | ✅ 파일 |
| 📌 버전 저장 | `fileData.versions[]` push + HTML 다운로드 | 툴바 버튼 | ✅ 파일 |

**localStorage 휘발 시나리오**
브라우저 데이터 초기화 / 시크릿 모드 / 다른 PC·브라우저 / 파일 경로·이름 변경 / 브라우저 재설치
→ 이때 `💾`·`📌`로 저장한 것만 살아남음.

---

## 5. 데이터 스키마

### `fileData` (HTML `<script id="spec-data">` JSON)

```js
{
  versions: [ Version, ... ],
  current:  'v0.3' | null,       // 최신 버전 id
  nextId:   Number,              // 다음 핀 id (신규 핀 할당용)
  draft?:   Draft | null         // 💾 저장 시 슬롯 (없을 수 있음)
}
```

### `Version`

```js
{
  id:        'v0.3',                         // major.minor
  timestamp: ISO8601 string,
  author:    'claude' | 'manual',            // 🤖 / ✏️
  memo:      String,                         // 선택
  specs:     { [pinId: string]: Spec },      // 해당 버전의 전체 스냅샷
  changes:   [ Change, ... ]                 // 이 버전에서 바뀐 것 요약
}
```

### `Spec` (핀 하나)

```js
{
  title:      String,
  component:  String,                        // [data-component] 값과 매칭
  position:   { x: Number, y: Number },      // 컴포넌트 내 상대좌표(px)
  role:       String,                        // 역할 설명
  states:     [ String, ... ],               // 상태 리스트
  props:      [ [key, value], ... ],         // 속성 테이블
  confluence: String                         // URL
}
```

### `Change`

```js
{ pin: Number, action: '추가'|'삭제'|'수정', field?: '역할'|'상태'|'속성'|... }
```

### `Draft` (localStorage)

```js
{
  specs:        { [id]: Spec },
  baseVersion:  'v0.3' | null,   // 편집 시작 시점의 latest — 충돌 감지에 사용
  nextId:       Number,
  lastModified: ISO8601
}
```

---

## 6. 모드 체계

`<body>` 클래스로 전환. 일부 조합 가능.

| 클래스 | 의미 | 진입 조건 |
|---|---|---|
| (none) | 순수 읽기 | 기본 |
| `.spec-mode` | 핀 노출 | 상단바 스펙 토글 |
| `.edit-mode` | 편집 필드 활성, 툴바 노출 | URL `?edit=1` + 편집 토글 |
| `.compare-mode` | diff 하이라이트 | 상단바 🔀 토글 |
| `.readonly-view` | 과거 버전 표시 중 | 버전 드롭다운에서 구버전 선택 |
| `.pin-placing` | 새 핀 배치 대기 | 툴바 `+ 새 핀` 클릭 |

**제약**
- `.edit-mode` ↔ `.readonly-view` 배타 (과거 버전은 편집 불가)
- `.pin-placing` 중에는 다른 상호작용 잠김 (ESC로 취소)

---

## 7. 주요 흐름

### 7.1 로딩

1. `loadFileData()` — HTML의 `#spec-data` JSON 파싱
2. `loadDraft()` — `localStorage[STORAGE_KEY]` 복구
3. **충돌 감지**: `draft.baseVersion !== fileData.current` → 모달
4. **draft 복원 제안**: draft 있으면 "이어서 하기" 다이얼로그
5. `renderAllPins()` — 현재 specs 기준 핀 DOM 생성

### 7.2 📌 버전 저장

1. 버튼 → 메이저/마이너 + 메모 다이얼로그
2. `commitNewVersion()` — 새 `Version` 객체 `versions[]`에 push
3. `computeChanges(prevSpecs, newSpecs)` — diff → `changes[]`
4. `exportHtml(newId)` — `ORIGINAL_HTML`의 `#spec-data`만 교체 → 파일 저장
5. `clearDraft()` — localStorage 비움

### 7.3 Self-export

페이지 로드 시점:
```js
const ORIGINAL_HTML = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
```
런타임 DOM 변형(편집 상태 등)이 저장 파일에 섞이는 것을 막음. 다운로드 시 이 원본에서 `#spec-data` 블록만 새 JSON으로 교체.

### 7.4 Diff 스코프 (비교 모드)

- **핀 레벨**: 추가(초록) / 삭제(회색 고스트) / 수정(주황)
- **필드 레벨**: 바뀐 섹션(역할 · 상태 · 속성 · confluence)에 노란 배경
- **값 레벨 (글자 단위 diff)**: 범위 밖

---

## 8. 확장 포인트

| 수정 대상 | 방법 | 예시 |
|---|---|---|
| 페이지 메타 | `@ANCHOR:CONFIG` 안 2줄 | 타이틀, storage key |
| 와이어프레임 | `@ANCHOR:CONTENT` 안 HTML | 컴포넌트 추가·배치 |
| 핀 데이터 | 브라우저 편집 모드 (AI 직접수정 금지) | 역할·상태·속성 |
| 스타일 | `<style>` 내 CSS 변수 | 색상·간격 |
| 저장 형식 | `commitNewVersion()` / 스키마 | 필드 추가 (주의: 기존 파일 호환 고려) |

---

## 9. 한계와 향후 검토

- **풀 스냅샷 버전**: 버전마다 전체 `specs`를 복사. 버전이 수십 개 쌓이면 파일 비대화 → 베이스+패치 방식 검토 여지.
- **자동 머지 없음**: 충돌 시 "버리기 / 새 버전으로" 선택만. 필드 단위 머지는 미지원.
- **단일 페이지**: 템플릿 1 파일 = 화면 1개. 다화면 기획서는 파일 분리.
- **실시간 동시편집 불가**: localStorage 기반이므로 한 사람 편집 → 💾/📌 → 공유 흐름.
