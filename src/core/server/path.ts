export function compilePath(pattern: string) {
  const parts = pattern.split("/").filter(Boolean);
  const keys: string[] = [];
  const regexParts = parts.map((p) => {
    if (p.startsWith(":")) { keys.push(p.slice(1)); return "([^/]+)"; }
    return p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  });
  const regex = new RegExp("^/" + regexParts.join("/") + "/*$");
  return { regex, keys };
}

export function applyParams(pattern: string, params?: Record<string, string | number>): string {
  if (!params) return pattern;
  return pattern.replace(/:([A-Za-z0-9_]+)/g, (_, k) => {
    const v = (params as any)[k];
    if (v === undefined || v === null) throw new Error(`Missing param :${k}`);
    return encodeURIComponent(String(v));
  });
}
