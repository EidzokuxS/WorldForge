import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  resetLoggerForTest,
  __setTurnFileDispatchForTest,
} from "../logger-test-utils.js";

class BufferSink extends Writable {
  public chunks: string[] = [];
  override _write(
    chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.chunks.push(
      typeof chunk === "string" ? chunk : chunk.toString("utf8"),
    );
    cb();
  }
  get text(): string {
    return this.chunks.join("");
  }
}

describe("logger redact — payload.* at depths 1..6", () => {
  let tmpDir: string;
  let sink: BufferSink;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-redact-"));
    resetLoggerForTest({ logRoot: tmpDir });
    sink = new BufferSink();
    __setTurnFileDispatchForTest(sink);
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  const secrets = [
    "SEC_TOP",
    "SEC1",
    "SEC2",
    "SEC3",
    "SEC4",
    "SEC5",
    "SEC6",
    "BRAVE_SEC5",
    "BRAVE_SEC6",
    "ZAI_SEC5",
    "ZAI_SEC6",
  ];

  function emitAllSecretShapes() {
    const log = createLogger("test");
    // Top-level apiKey (bypasses payload wrapper when someone logs { apiKey })
    // which still goes through payload.* due to createLogger's wrapping.
    log.info("d1-apikey", { apiKey: "SEC1" });
    log.info("d2-nested-apikey", { provider: { apiKey: "SEC2" } });
    log.info("d3-array-apikey", { providers: [{ apiKey: "SEC3" }] });
    log.info("d4-auth", {
      headers: { auth: { Authorization: "Bearer SEC4" } },
    });
    log.info("d5-auth", {
      config: { transport: { headers: { Authorization: "Bearer SEC5" } } },
    });
    log.info("d6-apikey", {
      layer1: {
        layer2: { layer3: { layer4: { layer5: { apiKey: "SEC6" } } } },
      },
    });
    // Explicit depth-5 + depth-6 cases for brave/zai keys
    log.info("d5-brave", {
      a: { b: { c: { d: { braveApiKey: "BRAVE_SEC5" } } } },
    });
    log.info("d6-brave", {
      a: { b: { c: { d: { e: { braveApiKey: "BRAVE_SEC6" } } } } },
    });
    log.info("d5-zai", {
      a: { b: { c: { d: { zaiApiKey: "ZAI_SEC5" } } } },
    });
    log.info("d6-zai", {
      a: { b: { c: { d: { e: { zaiApiKey: "ZAI_SEC6" } } } } },
    });
    // Top-level secret (no wrapper)
    log.info("top-apikey", { apiKey: "SEC_TOP" });
  }

  it("redacts apiKey at depths 1-6 (including payload wrapper)", () => {
    emitAllSecretShapes();
    const text = sink.text;
    expect(text).toContain("[REDACTED]");
    for (const s of secrets) {
      expect(text).not.toContain(s);
    }
  });

  it("redacts braveApiKey at depths 5 and 6", () => {
    const log = createLogger("test");
    log.info("d5-brave-only", {
      a: { b: { c: { d: { braveApiKey: "BRAVE_ONLY_5" } } } },
    });
    log.info("d6-brave-only", {
      a: { b: { c: { d: { e: { braveApiKey: "BRAVE_ONLY_6" } } } } },
    });
    const text = sink.text;
    expect(text).not.toContain("BRAVE_ONLY_5");
    expect(text).not.toContain("BRAVE_ONLY_6");
    expect(text).toContain("[REDACTED]");
  });

  it("redacts zaiApiKey at depths 5 and 6", () => {
    const log = createLogger("test");
    log.info("d5-zai-only", {
      a: { b: { c: { d: { zaiApiKey: "ZAI_ONLY_5" } } } },
    });
    log.info("d6-zai-only", {
      a: { b: { c: { d: { e: { zaiApiKey: "ZAI_ONLY_6" } } } } },
    });
    const text = sink.text;
    expect(text).not.toContain("ZAI_ONLY_5");
    expect(text).not.toContain("ZAI_ONLY_6");
    expect(text).toContain("[REDACTED]");
  });

  it("redacts Authorization header (bearer) at depth 5", () => {
    const log = createLogger("test");
    log.info("d5-auth-only", {
      a: { b: { c: { d: { Authorization: "Bearer AUTH_SEC_5" } } } },
    });
    const text = sink.text;
    expect(text).not.toContain("AUTH_SEC_5");
    expect(text).toContain("[REDACTED]");
  });

  it("non-secret fields survive redaction untouched", () => {
    const log = createLogger("test");
    log.info("mixed", {
      apiKey: "SHOULD_VANISH",
      publicField: "HELLO_WORLD",
      nested: { publicInner: "KEEP_ME" },
    });
    const text = sink.text;
    expect(text).not.toContain("SHOULD_VANISH");
    expect(text).toContain("HELLO_WORLD");
    expect(text).toContain("KEEP_ME");
  });
});
