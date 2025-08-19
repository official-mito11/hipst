# API

hipst의 API 라우팅은 `api(path)`(공개 별칭: `route`)로 시작합니다. 각 노드는 체이닝으로 HTTP 메서드 핸들러를 추가하고, 트리 구조로 합성할 수 있습니다.

## 기본 사용
```ts
import { route, server } from "hipst";

const hello = route("/api/hello")
  .get(({ res, query }) => res({ ok: true, q: query }))
  .post(async ({ res, body }) => res({ created: true, body }));

server().route(hello).listen(3000);
```

## 핸들러 컨텍스트
핸들러는 `(ctx) => res(value)` 형태이며, `ctx`는 다음을 포함합니다:
- `req`: Request
- `query`: URLSearchParams로 파싱된 쿼리 객체
- `param`: 경로 파라미터 (e.g. `/user/:id` → `{ id }`)
- `headers(name?)`: 읽기 헬퍼
- `status(code)`, `header(name, value)`: 응답 설정
- `res(value)`: 값 → 응답으로 직렬화(JSON/텍스트/바이너리)
- `body<T=any>()`: JSON 또는 텍스트/바이너리 본문 파싱(비동기)

## 트리 합성
```ts
const users = route("/users")
  .get(({ res }) => res(["a", "b"]))
  .child(route("/:id").get(({ res, param }) => res({ id: param.id })));

server().route(users).listen(3000);
```

## 에러 처리
핸들러 내부에서 예외가 발생하면 500으로 응답합니다. 필요한 경우 `status(4xx/5xx)`와 함께 에러 메시지를 반환하세요.

## CORS/미들웨어
간단한 전처리는 부모 노드에서 공통 로직을 수행하고 자식으로 내려보내는 방식으로 구성할 수 있습니다. (전용 미들웨어 레이어는 이후 추가 예정)
