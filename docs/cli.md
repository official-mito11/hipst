# CLI 사용법

hipst는 `hipst` CLI를 통해 서버 구동(SSR/CSR/API)과 FE-only 빌드를 제공합니다.

## 설치 없이 소스에서 실행
```bash
# serve: SSR + (선택) CSR + (선택) API
bun run hipst serve \
  --ui examples/counter.app.ts#App \
  --api examples/counter.api.ts#myApi \
  --csr examples/counter.client.ts \
  --port 3000

# fe-build: 정적 산출물(HTML + JS + CSS + source map)
bun run hipst fe-build \
  --app examples/counter.app.ts#App \
  --csr examples/counter.client.ts \
  --out dist/counter-fe
```

## 전역/로컬 bin 사용 (publish 또는 link 후)
```bash
hipst serve --ui path/to/App#Export --api path/to/api#Export --csr path/to/client.ts --port 3000
hipst fe-build --app path/to/App#Export --csr path/to/client.ts --out dist/app
```

## 옵션
- --ui: `path[#ExportName]` 형식. export 미지정 시 default 또는 `App` 추정.
- --api: `path[#ExportName]` 형식. export 미지정 시 default 추정.
- --csr: 브라우저 엔트리 파일 경로. serve에서는 옵션이며 생략 시 자동 탐색을 시도합니다.
  - 자동 탐색 우선순위:
    1) package.json의 `{"hipst": {"client": "..."}}`
    2) 프로젝트 내 첫 번째 `**/*.client.{ts,tsx,js,jsx}`
- --port: 서버 포트 (기본 3000)
- --out: FE 빌드 산출 디렉토리 (기본 `dist/fe`)
- --minify: CSR 번들 압축 여부 (기본 true)
- --sourcemap: `external|inline|none` (기본 external)

## 산출물 (fe-build)
- index.html (SSR 결과 + CSR 스니펫 주입)
- app.mjs, app.mjs.map
- app.css, app.css.map (스타일이 있을 때)
