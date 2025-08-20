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
  --port 3000
# 브라우저: http://localhost:3000
# API:      http://localhost:3000/hyunho?q=great
```

## FE-only 풀 빌드 (정적)
JS/CSS를 포함한 정적 HTML 산출물을 생성합니다.
```bash
bun run hipst build \
  --app examples/counter.app.ts#App \
  --out dist/counter-fe
# dist/counter-fe/에 index.html, app.mjs(.map), app.css(.map)
# 참고: fe-build는 build의 별칭입니다.
```

## 프로젝트에 통합하기
- UI DSL: `html()`, `ui(tag)`로 SSR/CSR UI를 선언합니다.
- API: `api(path)`로 경로를 선언하고 핸들러를 체이닝합니다.
- 서버: `server().route(App).route(api).listen(port)`로 구동합니다.
- CSR: `server().route(App)`를 호출하면 CSR이 자동 활성화되며 클라이언트 엔트리가 자동 생성/번들되어 주입됩니다. 필요 시 `.csr(entry)`로 명시 엔트리를 사용할 수 있습니다.
- 스타일: `html()` 루트에서 `.css("path/to/file.css")`를 선언하면 CSR 번들에 포함됩니다.

자세한 설명은 다음 문서를 참고하세요.
- CLI: docs/cli.md
- SSR/CSR: docs/ssr-csr.md
- FE-only: docs/fe-build.md
- API: docs/api.md
- UI DSL: docs/ui.md
