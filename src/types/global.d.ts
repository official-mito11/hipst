// Ambient module declarations for examples and bundling-time assets
// CSS modules imported by the client entry (e.g., examples/counter.client.ts)
declare module "*.css" {
  const css: string;
  export default css;
}

// Minimal ambient modules for Node builtins used in examples/static.ts
// We keep them as 'any' to avoid adding external type dependencies.
declare module "node:fs" {
  export const mkdirSync: any;
  export const writeFileSync: any;
}

declare module "node:path" {
  export const dirname: any;
}
