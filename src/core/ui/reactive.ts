// Lightweight fine-grained reactivity (track/trigger/effect)
// Inspired by Vue/Solid patterns, minimal and framework-agnostic

type Eff = (() => void) & { __isEff?: true };
let activeEffect: Eff | null = null;

const bucket = new WeakMap<object, Map<PropertyKey, Set<Eff>>>();

export function effect(fn: () => void): Eff {
  const runner: Eff = (() => {
    activeEffect = runner;
    try {
      fn();
    } finally {
      activeEffect = null;
    }
  }) as Eff;
  runner.__isEff = true;
  // run once to establish dependencies
  runner();
  return runner;
}

export function track(target: object, key: PropertyKey) {
  if (!activeEffect) return;
  let depsMap = bucket.get(target);
  if (!depsMap) bucket.set(target, (depsMap = new Map()));
  let dep = depsMap.get(key);
  if (!dep) depsMap.set(key, (dep = new Set()));
  dep.add(activeEffect);
}

export function trigger(target: object, key: PropertyKey) {
  const depsMap = bucket.get(target);
  if (!depsMap) return;
  const dep = depsMap.get(key);
  if (!dep) return;
  // Copy to avoid infinite loops if effects mutate same key during run
  [...dep].forEach((eff) => eff());
}
