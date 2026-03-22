# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A **no-code database platform** — users upload data files (CSV, Excel, JSON) into an embedded DuckDB database, then browse, normalize, and restructure their data via a web UI. Monorepo with two independent packages: `backend/` and `frontend/`.

## Commands

### Backend (`cd backend`)
```bash
npm run dev          # Start dev server with hot reload (tsx watch), port 3001
npm run build        # TypeScript → dist/
npm run start        # Run production build
npm run lint         # ESLint
npm run format       # Prettier
```

### Frontend (`cd frontend`)
```bash
npm run dev          # Vite dev server, port 5173
npm run build        # tsc + vite build
npm run lint         # ESLint
npm run preview      # Preview production build
```

No test framework is configured in either package.

### Environment Setup
Backend requires a `.env` file — copy `backend/.env.example` to `backend/.env`. The `GROQ_API_KEY` env var is needed for AI-powered star schema analysis. The server auto-creates `uploads/` and `data/` directories.

## Architecture

### Backend (Express + DuckDB + TypeScript)

**Layered structure:** routes → controllers → services. All routes are mounted under `/api/v1`.

| Route prefix | Purpose |
|---|---|
| `/health` | Health check |
| `/upload` | Two-step file upload (upload → preview → commit) |
| `/tables` | CRUD for user tables |
| `/normalization` | Repetition-based normalization analysis and apply |
| `/star-schema` | AI-powered star schema analysis (via Groq LLM) and apply |

**Key services:**
- `duckdb.service.ts` — singleton DuckDB wrapper, all SQL goes through here. Tracks tables via `_table_metadata` internal table.
- `file-parser.service.ts` — CSV (papaparse), Excel (xlsx, first sheet), JSON (one-level flatten).
- `schema-detector.service.ts` — infers column types from up to 1000 rows using 80% majority vote.
- `normalization.service.ts` — statistical normalization candidates + dimension grouping.
- `star-schema.service.ts` — sends sample data to Groq AI, gets fact/dimension recommendations, applies the transformation.
- `groq.service.ts` — Groq SDK wrapper; post-processes AI results with deterministic PK detection (`key-detection.ts`).

**Patterns to follow:**
- Controllers use `asyncHandler()` from `error-handler.ts` for promise error propagation.
- Response helpers (`sendSuccess`, `sendCreated`, `sendBadRequest`, etc.) enforce `{ success, data, error, message }` shape.
- `AppError` class carries HTTP status codes.
- TypeScript uses `NodeNext` module resolution — **all local imports must use `.js` extension** even for `.ts` source files.
- DuckDB parameterized queries use positional string keys: `{ '1': value, '2': value }`.

**Important constraints:**
- In-memory file preview store (`Map<fileId, FilePreview>`) is process-local — uploads are lost on restart before commit.
- `applyNormalization` and `applyStarSchema` are destructive (drop + recreate tables). No rollback mechanism.

### Frontend (React + Vite + Tailwind)

Single-page app in `frontend/src/App.tsx` — one component with tab-based navigation (Health, Upload, Tables, Normalization). All backend communication goes through `frontend/src/api.ts` which wraps `fetch()` calls and transforms backend response shapes into frontend-friendly types.

Vite proxies `/api` requests to `http://localhost:3001` in dev mode (`vite.config.ts`), so the frontend uses relative API paths (`/api/v1/...`).
