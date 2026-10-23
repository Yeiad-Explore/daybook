// The slice of the Deno runtime the entry points use, so tsc can check them without Deno installed.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Response | Promise<Response>): unknown;
};
