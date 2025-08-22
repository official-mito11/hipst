import { api, middleware } from "../index.ts";

type JwtPayload = { sub: string; name: string };

// For demo: very naive verifier that treats the token as base64(JSON)
function verifyToken(token: string): JwtPayload | undefined {
  try {
    const json = atob(token);
    const obj = JSON.parse(json);
    if (obj && typeof obj.name === "string") return obj as JwtPayload;
  } catch {}
  return undefined;
}

const jwtAuth = middleware<{ user: JwtPayload }>(({ next, headers, status }) => {
  const auth = headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const payload = token ? verifyToken(token) : undefined;
  if (payload) return next({ user: payload });
  return status(401).res({ message: "unauthorized" });
});

const testApi = api("/test")
.use(jwtAuth)
.get(({res, user}) => res(`your name is ${user?.name}`));

export const myApi = api("/auth/me")
  .use(jwtAuth)
  .route(testApi)
  .get(({ user, res }) => res({msg:`your name is ${user.name}`}))
  .post(({body, res}) => {
    const { data } = body;
    return res({ data })
  })
  .put(({body, res}) => {
    const { data } = body;
    return res({ data })
  });