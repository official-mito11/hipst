# CLI 사용법

hipst는 `hipst` CLI를 통해 서버 구동(SSR/CSR/API)과 FE-only 빌드를 제공합니다.

## 간단한 사용법 (권장)
```bash
# serve: 기본 SSR. `--csr`로 CSR-only 전환
bun run hipst serve examples/counter.app.ts#App -p 3000
bun run hipst serve examples/counter.app.ts#App --csr -p 3000

# build: 정적 산출물(SSR HTML + CSR 자산). `--client`로 CSR-only HTML 생성
bun run hipst build examples/counter.app.ts#App --out dist/counter-fe \
  [--minify true|false] [--sourcemap external|inline|none]
bun run hipst build examples/counter.app.ts#App --client --out dist/counter-client

# 참고: `fe-build`는 `build`의 별칭입니다.
```

## 전역/로컬 bin 사용 (publish 또는 link 후)
```bash
hipst serve path/to/App#Export -p 3000 [--csr]
hipst build path/to/App#Export --out dist/app [--client]
```

## 옵션
- __serve__
  - `--csr`: SSR 대신 CSR-only 모드로 서비스(빈 컨테이너 + 클라이언트 마운트)
  - `--port, -p <number>`: 포트 (기본 3000)
  - `--watch, -w`: 핫 리로드 (예정)
- __build__
  - `--client`: FE 클라이언트 모드. HTML 본문이 비워지고 마운트 컨테이너만 포함됨. 클라이언트 앱은 default export 여야 합니다.
  - `--out <dir>`: 출력 디렉토리 (기본 `dist/fe`)
  - `--minify <bool>`: 번들 압축 (기본 true)
  - `--sourcemap <mode>`: `external|inline|none` (기본 external)

## 산출물 (build)
- index.html (SSR 또는 CSR-only HTML + 스니펫 주입)
- app.entry.mjs, app.entry.mjs.map (UI 모듈 번들)
- runtime.mjs, runtime.mjs.map (런타임 번들)
- app.mjs (래퍼; 위 두 모듈을 import하여 mount)
- app.css (선언된 스타일이 있을 때)

## 레거시 호환
- 기존 플래그도 동작합니다: `serve --ui/--api ...`, `build --app ... [--csr <entry>]`

## 개발(HMR)
- 소스에서 바로 개발 시: `bun --hot src/cli/hipst.ts serve ...` 권장
- 내부 `--watch` 옵션은 추후 제공 예정
