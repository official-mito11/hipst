# hipst

[![DeepWiki](https://img.shields.io/badge/DeepWiki-Explore-blue)](https://deepwiki.com/official-mito11/hipst)
 
간결한 Bun 기반 풀스택 프레임워크입니다. UI(SSR/CSR)와 API를 하나의 타입 안전 DSL로 구성합니다.

## 요구사항
- Bun 1.2+
- TypeScript 5.9+

## 설치
```bash
bun install
```

## 문서
- 시작하기: docs/getting-started.md
- CLI: docs/cli.md
- SSR/CSR: docs/ssr-csr.md
- FE-only 빌드: docs/fe-build.md
- API: docs/api.md
- UI DSL: docs/ui.md
- 마이그레이션: docs/migration.md

## 실행 예시
```bash
# 소스에서 CLI 사용 (설치 불필요)
bun run hipst serve --ui examples/counter.app.ts#App --api examples/counter.api.ts#myApi --port 3000

# FE-only 풀 빌드
bun run hipst build --app examples/counter.app.ts#App --out dist/counter-fe
# 참고: fe-build는 build의 별칭입니다.
```

자세한 내용은 위 문서를 참고하세요.

참고: `server().route(App)` 또는 `hipst build --app ...`를 사용하면 CSR이 자동 활성화되고 클라이언트 엔트리가 자동 생성/번들됩니다. 스타일은 `html()` 루트에서 `.css(path)`로 선언하면 번들에 포함됩니다.
