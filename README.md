# GBrain

Personal knowledge brain backed by Postgres + pgvector. Hybrid search that actually works.

```bash
gbrain query "who knows Jensen Huang?"
# Returns ranked results with evidence from your compiled intelligence pages
```

## Quickstart

```bash
# Install
npm install -g gbrain

# Initialize with Supabase (guided wizard)
gbrain init --supabase

# Import your markdown wiki
gbrain import /path/to/brain/

# Search
gbrain query "what does PG say about doing things that don't scale?"
```

## What is this

GBrain turns a directory of markdown files into a searchable, AI-queryable knowledge base.

Every page is structured as **compiled truth** (your current best understanding) and **timeline** (append-only evidence trail). AI agents maintain the brain through skills. MCP clients query it.

Search uses hybrid Reciprocal Rank Fusion: pgvector HNSW cosine similarity + PostgreSQL tsvector full-text search + multi-query expansion via Claude Haiku + 4-layer dedup. Not "good enough." Actually good.

## Install

Three ways to use gbrain:

| Path | For | Install |
|------|-----|---------|
| npm package | OpenClaw, library consumers | `bun add gbrain` |
| CLI binary | Humans | `npm install -g gbrain` |
| MCP server | Claude Code, Cursor | `gbrain serve` |

## Commands

```
gbrain init [--supabase|--url <conn>]   Setup brain
gbrain get <slug>                        Read a page
gbrain put <slug> [< file.md]           Write a page
gbrain search <query>                    Keyword search
gbrain query <question>                  Hybrid search (the good one)
gbrain import <dir> [--no-embed]        Import markdown directory
gbrain export [--dir ./out/]            Export to markdown
gbrain embed [<slug>|--all|--stale]     Generate embeddings
gbrain link <from> <to> [--type T]     Create typed link
gbrain graph <slug> [--depth N]         Traverse link graph
gbrain health                            Brain health dashboard
gbrain stats                             Statistics
gbrain serve                             MCP server (stdio)
gbrain --tools-json                      Tool discovery
```

Full list: `gbrain --help`

## Architecture

```
CLI / MCP Server (thin wrappers)
        |
   BrainEngine interface (pluggable)
        |
   PostgresEngine (ships in v0)
        |
   Supabase (Postgres + pgvector)
```

- **Pluggable engine interface.** Postgres ships. SQLite is designed and documented for community PRs. See `docs/ENGINES.md`.
- **3-tier chunking.** Recursive (delimiter-aware), semantic (Savitzky-Golay boundary detection), LLM-guided (Claude Haiku topic shifts).
- **Hybrid search.** Vector + keyword merged via RRF. Multi-query expansion. 4-layer dedup.
- **Fat skills.** Markdown files that AI agents read and follow. No skill logic in the binary.

## Skills

| Skill | What it does |
|-------|-------------|
| ingest | Ingest meetings, docs, articles. Update compiled truth + timeline. |
| query | 3-layer search + synthesis with citations. |
| maintain | Health checks: stale info, orphans, dead links, tag consistency. |
| enrich | Enrich pages from external APIs. |
| briefing | Daily briefing: meetings, deals, open threads. |
| migrate | Universal migration from Obsidian, Notion, Logseq, markdown, CSV, JSON, Roam. |

## Using as a library

```typescript
import { PostgresEngine } from 'gbrain';

const engine = new PostgresEngine();
await engine.connect({ database_url: process.env.DATABASE_URL });
await engine.initSchema();

const page = await engine.putPage('people/pedro', {
  type: 'person',
  title: 'Pedro Franceschi',
  compiled_truth: 'Co-founder of Brex...',
});

const results = await engine.searchKeyword('fintech founders');
```

## MCP Server

Add to your MCP config:

```json
{
  "mcpServers": {
    "gbrain": {
      "command": "gbrain",
      "args": ["serve"]
    }
  }
}
```

20 tools exposed: get/put/delete/list pages, search, query, tags, links, timeline, stats, health, versions.

## Docs

- [GBRAIN_V0.md](docs/GBRAIN_V0.md) - Full product spec and architecture decisions
- [ENGINES.md](docs/ENGINES.md) - Pluggable engine architecture
- [SQLITE_ENGINE.md](docs/SQLITE_ENGINE.md) - SQLite engine implementation plan

## License

MIT
