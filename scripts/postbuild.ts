import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { mkdirSync } from "node:fs";

const cwd = process.cwd();
const target = resolve(cwd, "dist/src/cli/hipst.js");

try {
  // Ensure directory exists (in case of different tsconfig include)
  mkdirSync(dirname(target), { recursive: true });
  const content = readFileSync(target, "utf-8");
  if (!content.startsWith("#!/")) {
    const shebang = "#!/usr/bin/env bun\n";
    writeFileSync(target, shebang + content, "utf-8");
    console.log("postbuild: shebang added to", target);
  } else {
    console.log("postbuild: shebang already present");
  }
} catch (e) {
  console.warn("postbuild: could not update CLI bin shebang:", (e as Error).message);
}
