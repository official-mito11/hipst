# SSR + CSR

hipst는 기본적으로 SSR(서버 사이드 렌더링) HTML을 제공합니다. UI 루트를 `server().route(App)`로 등록하면 CSR(클라이언트 사이드 상호작용)이 자동으로 활성화되어 JS/CSS 번들을 빌드하고 SSR HTML에 주입합니다.

## 사용법
```ts
import { server } from "hipst";
import { App } from "../examples/counter.app";

server()
  .route(App) // UI 루트를 라우트하면 CSR 자동 활성화 (클라이언트 엔트리 자동 생성)
  .listen(3000);
```

### 선택: 엔트리 명시적으로 지정
```ts
server()
  .csr("examples/counter.client.ts") // 자동 생성 대신 직접 지정 가능
  .route(App)
  .listen(3000);
```

### 스타일 포함 (선택)
`html()` 루트에서 `.css(path)`를 선언하면 해당 CSS가 CSR 번들에 포함됩니다.
```ts
// examples/counter.app.ts
import { html, ui } from "hipst";

export const App = html()
  .title("Counter")
  .css("examples/counter.css") // CSR 번들에 포함
  (
    ui("h1")("Hello")
  );
```

## 동작 개요
- `server().route(App)` 호출 시 CSR이 자동 활성화되며, `App`이 있는 모듈에서 클라이언트 엔트리를 자동 생성/번들합니다.
- `server().csr(path)`로 명시하면 해당 엔트리를 사용합니다.

## 주입되는 자원
- `<link rel="stylesheet" href="/_hipst/app.css">`
- `<script type="module" src="/_hipst/app.mjs"></script>`

서빙 경로:
- `/_hipst/app.mjs`
- `/_hipst/app.css`
- `/_hipst/app.mjs.map`

본문은 `id="__hipst_app__"` 컨테이너로 감싸지며, CSR에서 `mount(...)`가 해당 요소에 연결됩니다.
