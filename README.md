# 화면 설계 템플릿 (Wireframe Spec Template)

HTML 한 폴더로 와이어프레임 + 핀 설명 + 버전 기록을 담는 PM용 기획서 템플릿.

## 폴더 구조

```
.
├── template/    ← 새 기획서 시작 시 이 폴더 통째로 복사
├── guide/       ← 사용 가이드 / 내부 스펙 / 설계 문서 / 대기 항목
└── sample/      ← 실제 적용 예시 (vercel 배포 대상)
```

## 빠른 시작

1. **`template/` 폴더를 통째로 복사**해서 새 위치에 두기
2. 폴더 안 `spec_template_base.html`을 원하는 이름(`reading_log.html` 등)으로 변경
3. 자세한 내용은 [`guide/template_guide.md`](guide/template_guide.md)

## 문서

| 대상 | 문서 |
|---|---|
| PM (이 템플릿으로 기획서를 작성) | [`guide/template_guide.md`](guide/template_guide.md) |
| 개발자 / AI (템플릿 내부 수정) | [`guide/template_spec.md`](guide/template_spec.md) |
| 편집 모드 설계 근거 | [`guide/edit_mode_design.md`](guide/edit_mode_design.md) |
| 대기 중 개선 항목 | [`guide/pending_changes.md`](guide/pending_changes.md) |

## 예시

`sample/reading_log/` — 실제 분리 모델로 운영 중인 기획서 (vercel 배포본).
