# 1. Put ts-openapi-gen in maintenance mode

- Status: accepted
- Date: 2026-10-27
- Decider: Nicholas Elliott

## Context

ts-openapi-gen reads the JSON output of TypeDoc 0.22 and walks its reflections (decorators, JSDoc comments, types) to build an OpenAPI document for `inversify-express-utils` controllers. The last release, 1.4.0, shipped in September 2023.

Three things have changed since then.

1. **The TypeScript ceiling is architectural.** TypeDoc 0.23 removed decorator information from its reflections. The generator finds endpoints through those decorators, so it is pinned to TypeDoc 0.22, and therefore to TypeScript 4.7 or earlier. A dependency bump can't fix this. Lifting the ceiling means rewriting the front end on the TypeScript compiler API or ts-morph. The compiler API has already changed: TypeScript 7 (July 2026) does not support the existing compiler API, and its replacement is not yet stable.
2. **The host framework is fading.** `inversify-express-utils` has about 56,000 weekly npm downloads and no release since March 2025. Few new projects start on it.
3. **The problem is now solved upstream.** Most TypeScript web frameworks generate OpenAPI either from types at build time or from the same schema that validates requests. This is true of NestJS (`@nestjs/swagger` CLI plugin, Nestia), Fastify (`@fastify/swagger`), Hono (`hono-openapi`, `@hono/zod-openapi`), and contract-first libraries (oRPC, ts-rest). Express users have tsoa and `zod-to-openapi`. The README's Alternatives section maps each one.

## Options considered

1. **Maintenance mode.** Correct the documentation, point users to alternatives, archive the repository, and leave 1.4.0 published.
2. **Narrow revival.** Rebuild the front end on the compiler API as a decorator-free generator for plain Express 5. This means two to four weeks of work, competing with tsoa, on a compiler API whose replacement is not yet stable.
3. **Multi-framework plugin system.** A shared type-to-schema core with per-framework route adapters. Users of NestJS, Fastify and Hono already have first-party answers, so the adapters would add little.

## Decision

Option 1. The tool did its job for the projects it was built for, and the ecosystem has since moved to approaches that don't need it. Rebuilding it would mean competing with maintained projects for a shrinking niche.

## Consequences

- 1.4.0 stays on npm and keeps working for TypeScript 4.0–4.7 projects on TypeDoc 0.22.
- The repository is archived: no new issues, pull requests or releases. Anyone who needs changes can fork under the MIT license.
- If a stable TypeScript 7 API appears and plain-Express, types-only generation is still unserved, this decision can be revisited with a fresh implementation rather than an upgrade of this one.
