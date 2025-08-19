# UI DSL

hipst의 UI는 체이닝 가능한 DSL로 정의합니다. `html()`은 페이지 루트, `ui(tag)`는 엘리먼트를 생성합니다.

## 기본 예시
```ts
import { html, ui } from "hipst";

export const App = html().title("Demo")(
  ui("div").flexCol().p(16)(
    ui("h1")("Hello"),
    ui("button")
      .state("count", 0)
      .p(({ self }) => (self.state.count as number) * 2)
      .onClick(({ self }) => { self.state.count = (self.state.count as number) + 1; })
      (({ self }) => `Count: ${self.state.count}`),
  ),
);
```

## 상태(state)
- `state`는 함수이자 프록시입니다.
  - 초기화: `state(key, value)` 또는 `state({ ... })`
  - 읽기: `state.foo`
  - 쓰기: `state.foo = 123` (반응형 트리거)
- 타입 선언 도우미:
  - `stateInit({ ... })`: 여러 키 초기화 + 타입 정제
  - `typed<{ foo: number }>()`: 런타임 변경 없이 타입만 정제
  - `parentTyped<{ ... }>()`: 자식에서 `parent.state` 타입 힌트

## 스타일/속성
- `style(key, value)` 또는 `style({ ... })`
- 공통 단축어:
  - `.p(16)`, `.m(8)`, `.flexCol()`, `.flexRow()`, `.textCenter()`
  - `.class("btn")`, `.classes(["btn", ({ state }) => state.on && "on"])`
  - `.id(...)`, `.htmlFor(...)`, `.type(...)`, `.checked(...)`, `.value(...)`

## 자식(children)
- 문자열, 다른 `UIComponent`, 또는 `(ctx) => string` 함수 가능
- `ctx`: `{ self, parent?, root?, state, styles, attributes }`

## 이벤트
- `.onClick((ctx, ev?) => { ... })`
- 기타 이벤트는 추후 `.prop()`으로 확장 가능

## 사용자 정의 체이닝 메서드
`.prop(name, (ctx, value) => this)`를 사용해 커스텀 메서드를 추가할 수 있습니다.
```ts
ui("div").prop("bg", (c, v: string) => c.self.style({ background: v }))
  .bg("red")
  .p(12);
```

## CSR 마운트
SSR HTML 내 컨테이너(`#__hipst_app__`)에 클라이언트에서 마운트합니다.
```ts
import { mount } from "hipst";
import { App } from "./app";

mount(App, document.getElementById("__hipst_app__")!);
```
