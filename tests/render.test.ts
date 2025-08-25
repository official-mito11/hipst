import { describe, it, expect } from "bun:test";
import { renderToString, ui, html, component } from "../index";

// Helper to assert common SSR safety conditions
function expectNoObjectObject(html: string): void {
  expect(html.includes("[object Object]")).toBe(false);
}

describe("SSR renderToString", () => {
  it("renders a simple component tree without [object Object] and with nested tags", () => {
    const child = ui("span").class("msg")("world");
    const root = ui("div").state("n", 1).class("wrap").style("padding", "4px")(
      ui("h1")("hello"),
      child,
      ({ self }) => String(self.state.n)
    );

    const out: string = renderToString(root);
    expect(out).toContain("<div");
    expect(out).toContain("<h1>hello</h1>");
    expect(out).toContain("<span class=\"msg\">world</span>");
    expect(out).toContain(
      "style=\"padding:4px\"" // styleToString should render css as kebab + joined
    );
    expect(out.endsWith("</div>")).toBe(true);
    expectNoObjectObject(out);
  });

  it("renders HtmlRoot with <head> and <body> and preserves children", () => {
    const page = html().title("T").meta("description", "D")(
      ui("div").id("app")("content")
    );

    const out: string = renderToString(page);
    // Basic structure
    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<html");
    expect(out).toContain("<head>");
    expect(out).toContain("<title>T</title>");
    expect(out).toContain('<meta name="description" content="D">');
    expect(out).toContain("<body>");
    expect(out).toContain('<div id="app">content</div>');
    expect(out).toContain("</body></html>");
    expectNoObjectObject(out);
  });

  it("escapes attribute values and text content correctly", () => {
    const dangerousText = '<script>alert("x")</script>';
    const dangerousAttr = '"quoted" & <tag>';

    const root = ui("div").attr("data-x", dangerousAttr)(dangerousText);
    const out: string = renderToString(root);

    // Attribute escape
    expect(out).toContain('data-x=\"&quot;quoted&quot; &amp; &lt;tag&gt;\"');
    // Text escape
    expect(out).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expectNoObjectObject(out);
  });

  it("renders component created via component() factory and respects define() call-time args", () => {
    const Tmpl = ui("span").define(({ self }) =>
      self.attr("data-val", (ctx) => String(ctx.children[0]))
    );
    const F = component(Tmpl);

    const inst = F("abc");
    const out: string = renderToString(ui("div")(inst));

    expect(out).toContain('<span data-val="abc"></span>');
    expectNoObjectObject(out);
  });
});
