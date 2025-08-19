# SSR + CSR

hipst는 기본적으로 SSR(서버 사이드 렌더링) HTML을 제공합니다. CSR(클라이언트 사이드 상호작용)을 켜면 서버가 자동으로 JS/CSS 번들을 빌드하고 SSR HTML에 주입합니다.

## 사용법
```ts
import { server } from "hipst";
import { App } from "../examples/counter.app";

server()
  .csr("examples/counter.client.ts") // 생략 시 자동 탐색 시도
  .route(App)
  .listen(3000);
```

### 클라이언트 엔트리 예시
```ts
// examples/counter.client.ts
import { mount } from "hipst";
import { App } from "./counter.app";
import "./counter.css"; // 스타일 함께 번들됨

mount(App, document.getElementById("__hipst_app__")!);
```

## 자동 탐색
- package.json: `{ "hipst": { "client": "examples/counter.client.ts" } }`
- 없으면 프로젝트 내 첫 `**/*.client.{ts,tsx,js,jsx}`

## 주입되는 자원
- `<link rel="stylesheet" href="/_hipst/app.css">`
- `<script type="module" src="/_hipst/app.mjs"></script>`

서빙 경로:
- `/_hipst/app.mjs`
- `/_hipst/app.css`
- `/_hipst/app.mjs.map`

본문은 `id="__hipst_app__"` 컨테이너로 감싸지며, CSR에서 `mount(...)`가 해당 요소에 연결됩니다.
