import { describe, it, expect } from "bun:test";
import { effect, track, trigger, stop } from "../src/core/ui/reactive";
import { compilePath } from "../src/core/server/path";

// Basic reactive behavior: track/trigger/stop
describe("reactive core", () => {
  it("tracks and triggers, stops correctly", () => {
    const store: Record<string, unknown> = {};
    let runs = 0;
    const runner = effect(() => {
      runs++;
      track(store, "x");
    });
    expect(runs).toBe(1);
    trigger(store, "x");
    expect(runs).toBe(2);
    trigger(store, "x");
    expect(runs).toBe(3);
    stop(runner);
    trigger(store, "x");
    expect(runs).toBe(3);
  });

  it("cleans up dependencies when dep set changes across runs", () => {
    const store: Record<string, unknown> = {};
    let sel: "x" | "y" = "x";
    let xRuns = 0;
    let yRuns = 0;
    const runner = effect(() => {
      if (sel === "x") {
        xRuns++;
        track(store, "x");
      } else {
        yRuns++;
        track(store, "y");
      }
    });
    expect(xRuns).toBe(1);
    expect(yRuns).toBe(0);

    // Re-run effect via current dep; inside the run it switches to tracking 'y'
    sel = "y";
    trigger(store, "x");
    expect(xRuns).toBe(1); // branch changed to 'y', x branch did not increment
    expect(yRuns).toBe(1);

    // Further triggers on 'x' should not run effect (now tracks 'y')
    trigger(store, "x");
    expect(xRuns).toBe(1);
    expect(yRuns).toBe(1);

    // Triggering 'y' should run effect now
    trigger(store, "y");
    expect(yRuns).toBe(2);

    stop(runner);
  });
});

// Path compile cache
describe("path compile cache", () => {
  it("returns the same compiled object for identical patterns", () => {
    const a = compilePath("/a/:id");
    const b = compilePath("/a/:id");
    expect(a).toBe(b);
    const c = compilePath("/a/:name");
    expect(c).not.toBe(a);
  });
});
