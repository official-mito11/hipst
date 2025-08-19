// Lightweight fine-grained reactivity (track/trigger/effect)
// Inspired by Vue/Solid patterns, minimal and framework-agnostic

export type Eff = (() => void) & { __deps?: Set<Set<Eff>>; __stopped?: true };
let activeEffect: Eff | null = null;

const bucket = new WeakMap<object, Map<PropertyKey, Set<Eff>>>();

function cleanup(eff: Eff) {
  const deps = eff.__deps;
  if (!deps) return;
  for (const dep of deps) dep.delete(eff);
  deps.clear();
}

export function effect(fn: () => void): Eff {
  const runner: Eff = (() => {
    if ((runner as Eff).__stopped) return;
    activeEffect = runner;
    try {
      cleanup(runner);
      fn();
    } finally {
      activeEffect = null;
    }
  }) as Eff;
  runner.__deps = new Set();
  // run once to establish dependencies
  runner();
  return runner;
}

export function stop(eff: Eff) {
  (eff as Eff).__stopped = true;
  cleanup(eff as Eff);
}

export function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) bucket.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
  (activeEffect.__deps ||= new Set()).add(dep);
}

export function trigger(target: object, key: PropertyKey) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (!dep) return;
  // Copy to avoid infinite loops if effects mutate same key during run
  [...dep].forEach((eff) => { if (!eff.__stopped) eff(); });
}
