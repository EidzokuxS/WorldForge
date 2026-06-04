import { describe, expect, it } from "vitest";

import { withSqliteWriteLock } from "../sqlite-write-lock.js";

describe("sqlite write lock", () => {
  it("serializes concurrent write sections", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstCanFinish = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withSqliteWriteLock("first", async () => {
      events.push("first:start");
      await firstCanFinish;
      events.push("first:end");
      return "first";
    });
    await Promise.resolve();

    const second = withSqliteWriteLock("second", async () => {
      events.push("second:start");
      return "second";
    });
    await Promise.resolve();

    expect(events).toEqual(["first:start"]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("is reentrant inside the active write section", async () => {
    const events: string[] = [];

    await withSqliteWriteLock("outer", async () => {
      events.push("outer:start");
      await withSqliteWriteLock("inner", async () => {
        events.push("inner");
      });
      events.push("outer:end");
    });

    expect(events).toEqual(["outer:start", "inner", "outer:end"]);
  });
});
