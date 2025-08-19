# FE-only 빌드 (정적 산출물)

CSR 번들을 생성하고 SSR HTML에 자동 주입하여 완전한 정적 산출물을 만듭니다. 정적 호스팅(Netlify, GitHub Pages 등)에 업로드하여 동작할 수 있습니다(단, API는 별도 배포 필요).

## 명령어
```bash
bun run hipst fe-build \
  --app <path/to/App[#Export]> \
  --csr <path/to/clientEntry> \
  --out dist/my-app \
  [--minify true|false] \
  [--sourcemap external|inline|none]
```

- --app: `html()` 루트 컴포넌트가 있는 모듈 경로. export 미지정 시 default 또는 `App` 추정
- --csr: 브라우저 엔트리 파일 (예: `examples/counter.client.ts`)
- --out: 출력 디렉토리 (기본 `dist/fe`)
- --minify: 번들 압축 (기본 true)
- --sourcemap: 소스맵 모드 (기본 external)

## 산출물
- `index.html`: SSR 결과 + CSR 스니펫 주입
- `app.mjs`, `app.mjs.map`
- `app.css`, `app.css.map` (스타일이 있을 때)

## 클라이언트 엔트리 예시
```ts
import { mount } from "hipst";
import { App } from "./counter.app";
import "./counter.css";

mount(App, document.getElementById("__hipst_app__")!);
```

## 정적 호스팅 팁
- 루트 경로에 `index.html`이 있으므로 기본 정적 호스팅 설정으로 동작합니다.
- API 호출이 필요하면 절대 경로나 환경변수 기반 baseUrl을 사용하세요. 코드생성 withBase 참조.
