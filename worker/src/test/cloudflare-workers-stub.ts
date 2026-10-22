// Stand-in for the `cloudflare:workers` module in Node tests (the real one
// exists only in the Workers runtime). Enough for importing live.ts.
export class DurableObject<TEnv = unknown> {
  constructor(
    protected ctx: DurableObjectState,
    protected env: TEnv,
  ) {}
}

// A Workers runtime global used by live.ts (the heartbeat's auto-response).
;(
  globalThis as { WebSocketRequestResponsePair?: unknown }
).WebSocketRequestResponsePair ??= class {
  constructor(
    readonly request: string,
    readonly response: string,
  ) {}
}
