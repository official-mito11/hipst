# UI DSL

- Create elements with `ui(tag)` and the HTML root with `html()`.
- Compose by calling the component as a function with children.

```ts
import { html, ui } from "hipst";

export const App = html()
  .title("Title")
  .meta("description", "desc")
  (
    ui("div").p(16).flexCol(
      ui("h1")("Hello"),
      ui("button")
        .state("count", 0)
        .onClick(({ self }) => { self.state.count++; })
        (({ self }) => `Count: ${self.state.count}`)
    )
  );
```

## State

- `state` is a callable facade and a reactive property bag:
  - Initialize: `.state("key", value)` or `.state({ key: value })` via the callable.
  - Read/write: `self.state.key` inside value functions and event handlers.
  - Advanced typing helpers: `.stateInit(obj)`, `.typed<T>()`, `.parentTyped<T>()`.

## Attributes and styles

- Attributes: `.attr(name, value)` with values supporting `ValueOrFn` (`(ctx)=>...`).
- Styles: `.style(key, value)` or `.style({ ... })` (typed via `csstype`).
- Shorthands:
  - `.id()`, `.className()`, `.class()`, `.classes()`
  - `.htmlFor()`, `.type()`, `.checked()`, `.value()`
  - `.display()`, `.flexDirection()`, `.flexCol()`, `.flexRow()`
  - `.p()`, `.m()`, `.textCenter()`

Spacing helpers:
- `.p(value)` sets padding. `value` can be a number, string, or `(ctx)=>number|string`.
  - Numbers are auto-suffixed with `px`.
  - Functions are resolved with `UIContext` each render/effect.
- `.m(value)` sets margin with the same rules as `.p()`.

## Events

- Example: `.onClick((ctx, ev) => { ... })`.

## Custom chainable methods

- Use `.prop(name, (ctx, value) => comp)` to define fluent methods at runtime.

## HtmlRoot extras

- `title(value)`, `meta(name, content)`, `css(path)` to include CSS in builds/server CSR.
