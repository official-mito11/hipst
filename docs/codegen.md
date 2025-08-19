# API 클라이언트 코드생성

`ApiComponent` 트리에서 fetch 기반 클라이언트 함수를 생성합니다. 각 엔드포인트는 `METHOD_path` 이름으로 생성됩니다.

## 사용 방법
### 1) FE 빌드와 함께(권장)
FE-only 빌드를 수행할 때 동시에 클라이언트 코드를 생성할 수 있습니다.
```bash
bun run hipst build \
  --app <path/to/App[#Export]> \
  --csr <path/to/clientEntry> \
  --out dist/fe \
  --codegen-api <path/to/api[#Export]> \
  [--codegen-out dist/client/myapi.client.ts] \
  [--codegen-base-url http://localhost:3000]
```

## 사용 예시
```ts
import { GET_hyunho } from "./dist/client/counter.client.ts";

const data = await GET_hyunho({ query: { q: "123" } });
```

## 옵션
빌드 통합 시 다음 옵션을 지원합니다:
- `--codegen-api`: API 루트 모듈(`path[#Export]`)
- `--codegen-out`: 출력 파일 또는 디렉토리(생략 시 `dist/client/<apiName>.client.ts`)
- `--codegen-base-url`: 고정 baseUrl 헬퍼 `withBase(baseUrl)` 포함
- 각 호출에 `RequestInit`과 `{ baseUrl, fetchImpl }`를 전달할 수 있습니다.

## 경로/파라미터 규칙
- 경로 파라미터(`/:id`)는 `args.params`로 전달합니다.
- 쿼리는 `args.query` 오브젝트로 전달합니다.
- 본문이 필요한 경우 `args.body`에 값(객체일 경우 JSON 직렬화) 또는 `Blob/ArrayBuffer/FormData/string`을 넣어 사용합니다.
