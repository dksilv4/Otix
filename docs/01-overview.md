# Overview

## What Otix Is

Otix is a media tracking and discovery platform that aggregates content from multiple providers (TMDB, Steam, IGDB, Plex, Fanart, OMDB) into a unified catalog. Users can track what they've watched, played, or want to see, and discover new media through recommendation feeds.

## Why We're Rebuilding

The current Django backend has accumulated architectural debt that makes it hard to extend:

- **GenericForeignKey** scattered throughout the data model makes queries fragile and relationships implicit
- **30 Celery queues** with a 200-line routing function that no one fully understands
- **Django ORM multi-table inheritance** that generates surprising JOINs
- **22 Django apps** with unclear domain boundaries
- **axios + CSRF + manual case conversion** on the frontend that adds friction to every API call

The React frontend components themselves are well-built. The problem is the data layer underneath them.

## Goals

1. **Clean domain model** — 8 bounded domains, explicit foreign keys, no GenericForeignKey
2. **Simplified sync pipeline** — 7 queues, prefix-based routing, understandable by one person
3. **Type-safe API contract** — FastAPI generates OpenAPI, TypeScript client is generated from that spec
4. **Keep the UI** — Same React components, new data layer underneath
5. **Solo-developer sustainable** — 5-6 months, Python throughout, no learning curve

## Constraints

| Constraint | Impact |
|---|---|
| Solo developer | No distributed systems, no microservices, no Kubernetes |
| 7 external provider APIs | Rate limiting and circuit breaking are critical |
| Existing 1.27M lines of domain logic | Translate, don't rewrite from scratch |
| Production users | Phased migration with shadow traffic, no big-bang cutover |

## Document Map

| Document | What It Covers |
|---|---|
| [Technology Stack](02-technology-stack.md) | Detailed rationale for every technology choice |
| [Project Structure](03-project-structure.md) | Directory layout, module responsibilities, domain boundaries |
| [Database Schema](04-database-schema.md) | Complete schema, table relationships, migration from Django |
| [API Design](05-api-design.md) | Endpoint patterns, auth flow, code generation pipeline |
| [Sync Pipeline](06-sync-pipeline.md) | Queue architecture, provider integrations, rate limiting |
| [Frontend](07-frontend.md) | Component architecture, data layer, state management, auth |
| [Migration Plan](08-migration-plan.md) | Timeline, phases, risk items, rollback strategy |
| [Verification](09-verification.md) | Test scenarios, performance benchmarks, acceptance criteria |
