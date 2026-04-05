# Contributing to GBrain

## Setup

```bash
git clone https://github.com/garrytan/gbrain.git
cd gbrain
bun install
bun test
```

Requires Bun 1.0+.

## Project structure

```
src/
  cli.ts                  CLI entry point
  commands/               Command handlers (one file per command)
  core/
    engine.ts             BrainEngine interface
    postgres-engine.ts    Postgres implementation
    db.ts                 Connection management
    types.ts              TypeScript types
    markdown.ts           Frontmatter parsing
    config.ts             Config file management
    chunkers/             3-tier chunking (recursive, semantic, llm)
    search/               Hybrid search (vector, keyword, hybrid, expansion, dedup)
    embedding.ts          OpenAI embedding service
  mcp/
    server.ts             MCP stdio server
  schema.sql              Postgres DDL
skills/                   Fat markdown skills for AI agents
test/                     Tests (bun test)
docs/                     Architecture docs
```

## Running tests

```bash
bun test                          # all tests
bun test test/markdown.test.ts    # specific test
```

## Building

```bash
bun build --compile --outfile bin/gbrain src/cli.ts
```

## Adding a new command

1. Create `src/commands/mycommand.ts` with an exported `runMyCommand` function
2. Add the case to `src/cli.ts` in the switch statement
3. Add the tool to `src/mcp/server.ts` in `handleToolCall` and `getToolDefinitions`
4. Add to `src/commands/tools-json.ts`
5. Add tests

CLI and MCP must expose identical operations. Drift tests will verify this.

## Adding a new engine

See `docs/ENGINES.md` for the full guide. In short:

1. Create `src/core/myengine-engine.ts` implementing `BrainEngine`
2. Add to engine factory in `src/core/engine.ts`
3. Run the test suite against your engine
4. Document in `docs/`

The SQLite engine is designed and ready for implementation. See `docs/SQLITE_ENGINE.md`.

## Welcome PRs

- SQLite engine implementation
- Docker Compose for self-hosted Postgres
- Additional migration sources
- New enrichment API integrations
- Performance optimizations
