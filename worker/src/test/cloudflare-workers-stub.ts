// Stand-in for the `cloudflare:workers` module in Node tests (the real one
// exists only in the Workers runtime). Enough for importing live.ts.
export class DurableObject<TEnv = unknown> {
  constructor(
    protected ctx: DurableObjectState,
    protected env: TEnv,
  ) {}
}
