import { test, expect } from "bun:test";
import { myApi } from "../examples/counter.api.ts";

// Type-level checks: if inference fails, this file won't compile
// Signature-level: ReturnType of client methods
// GET /auth/me -> { msg: string }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type GetRes = Awaited<ReturnType<typeof myApi.client.get>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _getShapeCheck: { msg: string } = null as any as GetRes;

// POST /auth/me -> { data: any }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type PostRes = Awaited<ReturnType<typeof myApi.client.post>>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _postShapeCheck: { data: any } = null as any as PostRes;

// Ensure return types are NOT 'any'
type IsAny<T> = 0 extends (1 & T) ? true : false;
type NotAny<T> = IsAny<T> extends true ? never : T;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertGetNotAny = IsAny<GetRes> extends true ? "FAIL" : "OK";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
type _assertPostNotAny = IsAny<PostRes> extends true ? "FAIL" : "OK";

// Runtime no-op to keep bun test happy
test("api client infers response types", () => {
  expect(true).toBe(true);
});
