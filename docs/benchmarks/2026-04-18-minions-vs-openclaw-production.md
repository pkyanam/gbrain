# Production Benchmark: Minions vs OpenClaw Sub-agents (Real Deployment)

**Date:** 2026-04-18
**Environment:** Wintermute on Render (ephemeral container, Supabase Postgres)
**GBrain:** v0.11.0 (minions-jobs branch)
**OpenClaw:** 2026.4.10
**Brain:** 45,798 pages, 98K chunks, 25K links, 79K timeline entries
**Task:** Pull and ingest one month of @garrytan tweets from the X Enterprise API

## Context

This is a **production benchmark**, not a lab test. The existing lab benchmark
([2026-04-18-minions-vs-openclaw-subagents.md](2026-04-18-minions-vs-openclaw-subagents.md))
uses trivial prompts on localhost Postgres. This benchmark uses a real 45K-page
brain on Supabase, pulling real tweets from the X Enterprise API ($50K/mo
firehose), and writing real brain pages.

## The Task

Pull @garrytan tweets for one month (May 2020), parse them into a structured
brain page with frontmatter, engagement metrics, and links, commit to the
brain repo, and submit a sync job to gbrain.

## Method 1: Minions (deterministic pipeline)

```bash
# 1. Pull tweets from X API
curl -s -H "Authorization: Bearer $X_BEARER_TOKEN" \
  "https://api.x.com/2/tweets/search/all?query=from:garrytan&max_results=100&start_time=2020-05-01T00:00:00Z&end_time=2020-06-01T00:00:00Z&tweet.fields=created_at,public_metrics" \
  > /tmp/bench-tweets.json

# 2. Parse + write brain page (python)
python3 parse_and_write.py

# 3. Git commit
cd /data/brain && git add media/x/garrytan/2020-05.md && git commit -m "x-archive: 2020-05"

# 4. Submit sync to Minions
gbrain jobs submit sync --params '{"repo":"/data/brain","noPull":true}'
```

**Result: 753ms total.** 99 tweets pulled, page written, committed, sync job queued.

Breakdown:
- X API call: ~300ms
- Python parse + write: ~50ms
- Git commit: ~100ms
- gbrain jobs submit: ~300ms

Cost: $0.00 (no LLM tokens)

## Method 2: OpenClaw Sub-agent (sessions_spawn)

```javascript
sessions_spawn({
  task: "Pull @garrytan tweets for June 2020 and save as a brain page...",
  model: "anthropic/claude-sonnet-4-20250514",
  mode: "run",
  runTimeoutSeconds: 120
})
```

**Result: GATEWAY TIMEOUT (>10,000ms).** The sub-agent could not even spawn
within the 10-second gateway timeout. On a production Render container running
a 45K-page brain with 19 active cron jobs, the gateway is under enough load
that sub-agent spawning is unreliable.

When sub-agents DO successfully spawn (off-peak), the expected path is:
1. Gateway receives spawn request (~500ms)
2. Create session, load context (~2-3s) — AGENTS.md, SOUL.md, skills, memory
3. Model reads task, plans approach (~2-3s)
4. Model calls `exec` tool for curl (~1s)
5. Model calls `exec` tool for python (~1s)
6. Model calls `exec` tool for git (~1s)
7. Model reports result (~1s)

**Estimated: 10-15s + ~$0.03 in tokens per invocation**

## Comparison

| Metric | Minions | Sub-agent |
|--------|---------|-----------|
| **Wall time** | **753ms** | **>10,000ms** (gateway timeout) |
| **Token cost** | $0.00 | ~$0.03 per run |
| **Success rate** | 100% | 0% (timeout on first attempt) |
| **Survives restart** | Yes (Postgres) | No (dies with process) |
| **Progress tracking** | `gbrain jobs get <id>` | poll sessions_list |
| **Auto-retry** | 3 attempts, exponential backoff | manual re-spawn |
| **Concurrency** | FOR UPDATE SKIP LOCKED | hope-based maxConcurrent |
| **Steerable** | inbox messages | fire and forget |
| **Results persisted** | job record | lost on compaction |
| **Memory** | ~2MB per in-flight job | ~80MB per spawned session |

## The Scaling Story

We pulled 19,240 tweets across 36 months (2021-2023) using the Minions
approach in a single bash loop. Total time: ~15 minutes. Cost: $0.00 in
LLM tokens.

The same task via sub-agents would require 36 spawns × ~$0.03 = ~$1.08
in tokens, take 36 × 15s = 9 minutes best-case, and fail on ~40% of
spawns under load (per the fan-out benchmark).

At scale (100+ months of backfill, or 1000+ batch enrichment jobs),
Minions is the only viable path. Sub-agents hit the gateway timeout wall,
burn tokens on deterministic work, and provide no durability.

## When Sub-agents Still Win

Sub-agents are correct for **judgment work**:
- Email triage (LLM decides priority, drafts reply)
- Social radar (LLM assesses severity, decides to alert)
- Meeting prep (LLM synthesizes brain pages into briefing)
- Cold email research (LLM decides notability)

These tasks require an LLM to make decisions. Minions can't do that —
its handlers are code, not models. The routing rule:

> **Deterministic** (same input → same steps → same output) → **Minions**
> **Judgment** (input requires assessment/decision) → **Sub-agents**

## One-Line Summary

Minions completed a production tweet ingestion in 753ms for $0.
Sub-agents couldn't even spawn. For deterministic brain-write work,
Minions is not incrementally better — it's categorically different.
