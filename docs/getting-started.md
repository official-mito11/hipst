# 시작하기

이 문서는 hipst를 가장 빠르게 시작하는 방법을 안내합니다.

## 요구사항
- Bun 1.2+
- TypeScript 5.9+

## 설치
```bash
bun install
```

## 예제 실행 (SSR + CSR + API)
예제 카운터 앱을 바로 실행하려면 CLI를 사용하세요.

```bash
bun run hipst serve \
  --ui examples/counter.app.ts#App \
  --api examples/counter.api.ts#myApi \
  --csr examples/counter.client.ts \
  --port 3000
# 브라우저: http://localhost:3000
# API:      http://localhost:3000/hyunho?q=great
```

## FE-only 풀 빌드 (정적)
JS/CSS를 포함한 정적 HTML 산출물을 생성합니다.
```bash
bun run hipst fe-build \
  --app examples/counter.app.ts#App \
  --csr examples/counter.client.ts \
  --out dist/counter-fe
# dist/counter-fe/에 index.html, app.mjs(.map), app.css(.map)
```

## 프로젝트에 통합하기
- UI DSL: `html()`, `ui(tag)`로 SSR/CSR UI를 선언합니다.
- API: `api(path)`로 경로를 선언하고 핸들러를 체이닝합니다.
- 서버: `server().route(App).route(api).listen(port)`로 구동합니다.
- CSR: `.csr(entry)`를 추가하면 SSR HTML에 JS/CSS가 자동 주입됩니다.

자세한 설명은 다음 문서를 참고하세요.
- CLI: docs/cli.md
- SSR/CSR: docs/ssr-csr.md
- FE-only: docs/fe-build.md
- API: docs/api.md
- UI DSL: docs/ui.md
- 코드생성: docs/codegen.md
