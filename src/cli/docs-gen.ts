import ts from "typescript";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type MethodName = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface JsonSchema {
  type?: "string" | "number" | "boolean" | "integer" | "null" | "undefined" | "object" | "array" | "unknown" | "any";
  enum?: Array<string | number>;
  anyOf?: JsonSchema[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  prefixItems?: JsonSchema[];
}

export type GeneratedMethodDoc = {
  path?: string;
  method: MethodName;
  specText?: string;
  file: string;
  line: number;
  column: number;
  schema?: {
    query?: JsonSchema;
    params?: JsonSchema;
    body?: JsonSchema;
    res?: JsonSchema;
  };
};

export type GeneratedDocs = {
  methods: GeneratedMethodDoc[];
};

function getSource(filePath: string): ts.SourceFile {
  const code = readFileSync(filePath, "utf-8");
  return ts.createSourceFile(filePath, code, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
}

function methodFromName(name: string | ts.__String | undefined): MethodName | undefined {
  const n = String(name || "").toUpperCase();
  if (n === "GET" || n === "POST" || n === "PUT" || n === "PATCH" || n === "DELETE") return n as MethodName;
  return undefined;
}

function tryFindApiBasePath(node: ts.Node): string | undefined {
  // Walk back the chain to find a CallExpression like api("/path")
  let cur: ts.Node | undefined = node;
  let hops = 0;
  while (cur && hops < 50) {
    hops++;
    if (ts.isCallExpression(cur)) {
      const callee = cur.expression;
      // api("/foo") or something.api("/foo")
      if (
        (ts.isIdentifier(callee) && callee.text === "api") ||
        (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) && callee.name.text === "api")
      ) {
        const firstArg = cur.arguments[0];
        if (firstArg && ts.isStringLiteralLike(firstArg)) return firstArg.text;
      }
      // Dive into the callee expression to continue walking
      cur = cur.expression;
      continue;
    }
    if (ts.isPropertyAccessExpression(cur)) {
      cur = cur.expression;
      continue;
    }
    if (cur.parent) { cur = cur.parent; continue; }
    break;
  }
  return undefined;
}

function extractDocsFromSource(sf: ts.SourceFile, checker: ts.TypeChecker): GeneratedMethodDoc[] {
  const out: GeneratedMethodDoc[] = [];

  function typeToSchema(type: ts.Type, depth = 0): JsonSchema {
    if (depth > 5) return { type: "any" };
    // Prefer original flags to detect primitives before using apparent wrapper types
    const f0 = type.flags;
    if (f0 & ts.TypeFlags.Any) return { type: "any" };
    if (f0 & ts.TypeFlags.Unknown) return { type: "unknown" };
    if (f0 & (ts.TypeFlags.StringLike | ts.TypeFlags.StringLiteral)) return { type: "string" };
    if (f0 & (ts.TypeFlags.NumberLike | ts.TypeFlags.NumberLiteral)) return { type: "number" };
    if (f0 & (ts.TypeFlags.BooleanLike | ts.TypeFlags.BooleanLiteral)) return { type: "boolean" };
    if (f0 & ts.TypeFlags.BigIntLike) return { type: "integer" };
    if (f0 & ts.TypeFlags.Null) return { type: "null" };
    if (f0 & ts.TypeFlags.Undefined) return { type: "undefined" };

    // Unions (based on original type)
    if (f0 & ts.TypeFlags.Union) {
      const ut = type as ts.UnionType;
      const litValues: Array<string | number> = [];
      const otherSchemas: JsonSchema[] = [];
      for (const m of ut.types) {
        const mf = m.flags;
        if (mf & ts.TypeFlags.StringLiteral) litValues.push((m as ts.StringLiteralType).value);
        else if (mf & ts.TypeFlags.NumberLiteral) litValues.push((m as ts.NumberLiteralType).value);
        else otherSchemas.push(typeToSchema(m, depth + 1));
      }
      if (litValues.length && !otherSchemas.length) return { enum: litValues };
      return { anyOf: [...(litValues.length ? [{ enum: litValues } as JsonSchema] : []), ...otherSchemas] };
    }

    const t = checker.getApparentType(type);
    // Array<T>
    if (checker.isArrayType?.(t)) {
      const tr = t as ts.TypeReference;
      const args: readonly ts.Type[] = checker.getTypeArguments ? checker.getTypeArguments(tr) : [];
      return { type: "array", items: args[0] ? typeToSchema(args[0], depth + 1) : { type: "any" } };
    }

    // Tuple
    if (checker.isTupleType?.(t)) {
      const tt = t as ts.TupleType;
      const getArgs = checker.getTypeArguments as ((type: ts.TypeReference) => readonly ts.Type[]) | undefined;
      const e: readonly ts.Type[] = getArgs ? getArgs(tt as ts.TypeReference) : [];
      return { type: "array", prefixItems: e.map((x) => typeToSchema(x, depth + 1)) };
    }

    // Object
    const props = checker.getPropertiesOfType(t);
    if (props.length > 0 || (t.flags & ts.TypeFlags.Object) !== 0) {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const p of props) {
        const decl = p.valueDeclaration || p.declarations?.[0] || sf;
        const pt = checker.getTypeOfSymbolAtLocation(p, decl);
        properties[p.getName()] = typeToSchema(pt, depth + 1);
        if (!(p.flags & ts.SymbolFlags.Optional)) required.push(p.getName());
      }
      const objSchema: JsonSchema = { type: "object", properties };
      if (required.length) objSchema.required = required;
      return objSchema;
    }

    // Fallback display name
    return { type: "unknown" };
  }

  function getPropTypeFromType(objType: ts.Type, prop: string): ts.Type | undefined {
    const s = checker.getPropertyOfType(objType, prop);
    if (!s) return undefined;
    const decl = s.valueDeclaration || s.declarations?.[0] || sf;
    return checker.getTypeOfSymbolAtLocation(s, decl);
  }

  function schemaFromSpecType(specType: ts.Type): { query?: JsonSchema; params?: JsonSchema; body?: JsonSchema; res?: JsonSchema } {
    const queryT = getPropTypeFromType(specType, "query");
    const paramsT = getPropTypeFromType(specType, "params");
    const bodyT = getPropTypeFromType(specType, "body");
    const resT = getPropTypeFromType(specType, "res");
    const schema: { query?: JsonSchema; params?: JsonSchema; body?: JsonSchema; res?: JsonSchema } = {};
    if (queryT) schema.query = typeToSchema(queryT);
    if (paramsT) schema.params = typeToSchema(paramsT);
    if (bodyT) schema.body = typeToSchema(bodyT);
    if (resT) schema.res = typeToSchema(resT);
    return schema;
  }

  function tryInferFromHandler(handler: ts.ArrowFunction | ts.FunctionExpression): { query?: JsonSchema; params?: JsonSchema; body?: JsonSchema; res?: JsonSchema } | undefined {
    try {
      const schema: { query?: JsonSchema; params?: JsonSchema; body?: JsonSchema; res?: JsonSchema } = {};
      // Param could be identifier or object binding pattern
      if (handler.parameters.length > 0) {
        const p0 = handler.parameters[0]!;
        const pType = checker.getTypeAtLocation(p0);
        // Try to read from context type
        const qT = getPropTypeFromType(pType, "query");
        const pmT = getPropTypeFromType(pType, "param");
        const bT = getPropTypeFromType(pType, "body");
        if (qT) schema.query = typeToSchema(qT);
        if (pmT) schema.params = typeToSchema(pmT);
        if (bT) schema.body = typeToSchema(bT);
        // Try find res(...) call in body
        const resSymbol = (() => {
          // If destructured parameter provides a local identifier named 'res'
          if (ts.isObjectBindingPattern(p0.name)) {
            for (const el of p0.name.elements) {
              if (ts.isIdentifier(el.name)) {
                const n = el.name.text;
                const pn = el.propertyName && ts.isIdentifier(el.propertyName) ? el.propertyName.text : n;
                if (pn === "res") {
                  const sym = checker.getSymbolAtLocation(el.name);
                  if (sym) return sym;
                }
              }
            }
          }
          return undefined;
        })();
        let resArg: ts.Expression | undefined;
        const walk = (n: ts.Node) => {
          if (ts.isCallExpression(n)) {
            const callee = n.expression;
            // res(...) when destructured
            if (ts.isIdentifier(callee) && callee.text === "res" && resSymbol) {
              const s = checker.getSymbolAtLocation(callee);
              if (s && s === resSymbol) resArg = n.arguments[0];
            }
            // ctx.res(...)
            if (ts.isPropertyAccessExpression(callee) && callee.name.text === "res") {
              resArg = n.arguments[0];
            }
          }
          if (!resArg) ts.forEachChild(n, walk);
        };
        if (handler.body) walk(handler.body);
        if (resArg) {
          const rType = checker.getTypeAtLocation(resArg);
          schema.res = typeToSchema(rType);
        }
      }
      return schema;
    } catch {
      return undefined;
    }
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const method = methodFromName(expr.name.escapedText);
        if (method) {
          const path = tryFindApiBasePath(expr.expression);
          const { line, character } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          let specText: string | undefined;
          let schema: GeneratedMethodDoc["schema"] | undefined;
          if (node.typeArguments && node.typeArguments.length > 0) {
            const t0 = node.typeArguments[0]!;
            specText = t0.getText(sf);
            const specType = checker.getTypeFromTypeNode(t0);
            schema = schemaFromSpecType(specType);
          } else {
            // Try infer from handler argument
            const firstArg = node.arguments[0];
            if (firstArg && (ts.isArrowFunction(firstArg) || ts.isFunctionExpression(firstArg))) {
              schema = tryInferFromHandler(firstArg) || undefined;
            }
          }
          out.push({ path, method, specText, file: sf.fileName, line: line + 1, column: character + 1, schema });
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  return out;
}

export function generateDocs(entryPaths: string[]): GeneratedDocs {
  const files = entryPaths.map((p) => resolve(process.cwd(), p));
  const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: (ts as any).ModuleResolutionKind?.NodeNext ?? ts.ModuleResolutionKind.NodeNext,
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.Preserve,
    strict: false,
    skipLibCheck: true,
    noEmit: true,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  });
  const checker = program.getTypeChecker();
  const methods: GeneratedMethodDoc[] = [];
  for (const f of files) {
    try {
      const sf = program.getSourceFile(f) || getSource(f);
      methods.push(...extractDocsFromSource(sf, checker));
    } catch (e) {
      // ignore parse errors for now
    }
  }
  return { methods };
}
