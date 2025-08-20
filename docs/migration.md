# 마이그레이션 가이드

프로젝트 업데이트에 따라 일부 API/스크립트가 변경되었습니다. 아래 단계에 따라 안전하게 마이그레이션하세요.

## 1) API 변경
- ApiComponent 메서드 이름 변경
  - `handle(req, url)` → `dispatch(req, url)`
  - 서버/라우팅 내부에서 자동 적용됨. 직접 호출하는 사용자라면 이름만 교체하면 됩니다.

## 2) CLI 통합
- 이전 개별 스크립트 대신 `hipst` CLI 사용 권장
  - 서버 실행(SSR/CSR/API):
    ```bash
    bun run hipst serve \
      --ui path/to/app.ts#App \
      --api path/to/api.ts#default \
      --port 3000
    ```
  - FE-only 풀 빌드(HTML + JS + CSS + maps):
    ```bash
    bun run hipst build \
      --app path/to/app.ts#App \
      --out dist/my-app \
    ```
- 참고: `fe-build`는 `build`의 별칭으로 계속 동작합니다.

## 3) 타입/런타임 정리
- DOM/스타일 타입 개선, UI 상태 프록시 일원화 등 내부 리팩터링이 반영되었습니다.
  - 사용자 API 표면은 그대로 사용 가능: `html()`, `ui(tag)`, `server()`, `route()` 등.
  - UI 상태는 `state(key, value)`/`state({ ... })`로 초기화하고 `state.foo = ...`로 갱신합니다.

## 4) CSR 번들 주입
- UI 루트를 `server().route(App)` 또는 `hipst build --app ...`로 지정하면 CSR이 자동 활성화되고 클라이언트 엔트리가 자동 생성/번들되어 SSR HTML에 주입됩니다.
- 직접 엔트리를 사용하고 싶다면 `server().csr(entry)` 또는 `--csr entry`를 선택적으로 지정하세요. 이 경우 엔트리에서 `mount(App, document.getElementById("__hipst_app__")!)`를 호출해야 합니다.

## 체크리스트
- [ ] API에서 `handle` 이름을 사용했다면 `dispatch`로 변경
- [ ] 로컬 스크립트 호출을 `bun run hipst ...`로 교체
- [ ] FE-only 빌드: `--app`, `--out` 경로 점검 (명시 엔트리를 쓸 경우에만 `--csr`)
- [ ] 예제/문서 링크 갱신

문제나 누락된 케이스가 있다면 이슈로 남겨주세요.
