import { expect, test, describe } from "bun:test";
import { generateDocs } from "../src/cli/docs-gen";
import { resolve } from "node:path";

describe("docs-gen", () => {
  test("extracts concise request/response schemas from examples", () => {
    const app = resolve(process.cwd(), "examples/counter.app.ts");
    const api = resolve(process.cwd(), "examples/counter.api.ts");
    const docs = generateDocs([app, api]);

    expect(Array.isArray(docs.methods)).toBe(true);

    const getTest = docs.methods.find((m) => m.path === "/test" && m.method === "GET");
    expect(getTest).toBeTruthy();
    expect(getTest?.schema?.res).toBeTruthy();
    expect(getTest?.schema?.res?.type).toBe("string");

    const authGet = docs.methods.find((m) => m.path === "/auth/me" && m.method === "GET");
    expect(authGet).toBeTruthy();
    expect(authGet?.schema?.res?.properties?.msg?.type).toBe("string");

    const authPost = docs.methods.find((m) => m.path === "/auth/me" && m.method === "POST");
    expect(authPost).toBeTruthy();
    expect(authPost?.schema?.body).toBeTruthy();
    expect(authPost?.schema?.res?.properties?.data).toBeTruthy();
  });
});
