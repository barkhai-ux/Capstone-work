# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot reload via tsx)
npm run dev

# Build TypeScript to dist/
npm run build

# Run production build
npm run start

# Lint
npm run lint

# Format
npm run format
```

No test suite is currently configured (jest is listed in scripts but not in devDependencies).

## Environment Setup

Copy `.env.example` to `.env`. Required env vars:
- `PORT` (default: 3001)
- `NODE_ENV`
- `DB_PATH` (default: `./data/database.duckdb`)
- `UPLOAD_DIR` (default: `./uploads`)
- `MAX_FILE_SIZE` (default: 52428800 = 50MB)
- `FRONTEND_URL` (required in production for CORS)

The server auto-creates `./uploads` and `./data` directories on startup.

## Architecture

This is a **no-code database platform** backend — users upload files (CSV, Excel, JSON) which get ingested into an embedded DuckDB database, and can then be analyzed and normalized.

### Request Lifecycle

**File upload flow (two-step commit pattern):**
1. `POST /api/v1/upload` — multer saves file to `./uploads/`, file is parsed and schema is inferred, a preview is stored in-memory (keyed by UUID `fileId`). Returns schema + 10-row preview.
2. `GET /api/v1/upload/preview/:fileId` — retrieve the in-memory preview.
3. `POST /api/v1/upload/commit/:fileId` — reads the in-memory preview, imports data into DuckDB, registers in `_table_metadata`, deletes the temp file. CSVs use `read_csv_auto()` for performance; Excel/JSON use row-by-row insertion.

In-memory preview store (`Map<fileId, FilePreview>`) is process-local — no persistence. Previews expire via hourly cleanup (checks file mtime > 1 hour).

**Tables API:**
- `GET /api/v1/tables` — lists all tables from `_table_metadata` with column/row counts
- `GET /api/v1/tables/:tableId` — table details
- `GET /api/v1/tables/:tableId/data?page=1&pageSize=50` — paginated data (max 1000/page)
- `DELETE /api/v1/tables/:tableId` — drops DuckDB table + removes metadata row

**Normalization API:**
- `POST /api/v1/normalization/analyze` `{ tableId }` — scans columns for repetition (skips `*_id`, `id`, `uuid` patterns), identifies candidates with HIGH/MEDIUM/LOW confidence
- `POST /api/v1/normalization/apply` `{ tableId, columns[] }` — creates `lkp_<column>` lookup tables, replaces the original table via temp-table rename pattern

### Key Services

| Service | Responsibility |
|---|---|
| `duckdb.service.ts` | Singleton wrapper around `@duckdb/node-api`. Owns all SQL execution. Uses `_table_metadata` internal table to track user tables. |
| `file-parser.service.ts` | Parses CSV (papaparse), Excel (xlsx, first sheet only), JSON (flattens nested objects one level deep). |
| `schema-detector.service.ts` | Infers column types from up to 1000 sample rows using 80% majority vote. Types: `INTEGER`, `DECIMAL`, `DATE`, `TIMESTAMP`, `VARCHAR`, `BOOLEAN`. |
| `normalization.service.ts` | Normalization analysis and application. Also has `applyDimensionNormalization()` (groups related columns into dimension tables) — not yet exposed via HTTP routes. |
| `validation.service.ts` | Zod schemas for all request bodies/params. |

### Patterns

- All controllers use `asyncHandler()` wrapper from `error-handler.ts` for promise error propagation.
- Response helpers (`sendSuccess`, `sendCreated`, `sendBadRequest`, `sendNotFound`, `sendError`) in `src/utils/response.ts` enforce consistent `{ success, data, error, message }` shape (`ApiResponse<T>`).
- `AppError` class carries an HTTP status code for use in the global error handler.
- TypeScript uses `NodeNext` module resolution — all local imports must use `.js` extension (even for `.ts` source files).
- DuckDB queries use positional params as string keys: `{ '1': value, '2': value }`.

### Important Constraints

- The in-memory file preview store means uploads are lost on server restart before commit.
- `applyNormalization` is destructive: drops and recreates the original table. There is no rollback.
- `importCSV` builds the SQL with a raw string interpolation of `filePath` — ensure file paths come only from multer-controlled uploads directory.
