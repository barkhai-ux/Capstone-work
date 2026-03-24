# No-Code Database Platform

A web-based platform that lets users upload data files (CSV, Excel, JSON), browse and query them via an embedded DuckDB database, then normalize and restructure their data — all without writing code.

## Features

- **File Upload** — Import CSV, Excel (.xlsx), and JSON files with automatic schema detection
- **Data Browser** — Browse tables with paginated, sortable grid views
- **SQL Query** — Ask natural-language questions against your tables (powered by Groq AI)
- **Normalization** — Detect and resolve data repetition by extracting lookup tables
- **Star Schema Design** — AI-driven fact/dimension table recommendations with one-click apply
- **Dashboard & Charts** — Visualize data with Bar, Line, Pie, and Doughnut charts using a drag-and-drop grid layout

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, Chart.js, React Grid Layout |
| Backend | Node.js, Express, TypeScript |
| Database | DuckDB (embedded, in-process) |
| AI | Groq LLM API (Llama) for star schema analysis and natural-language queries |
| File Parsing | PapaParse (CSV), SheetJS/xlsx (Excel), built-in JSON flattening |

## Project Structure

```
.
├── backend/                 # Express API server
│   └── src/
│       ├── controllers/     # Route handlers
│       ├── services/        # Business logic (DuckDB, file parsing, normalization, AI)
│       ├── routes/          # Express route definitions
│       ├── middleware/       # Error handling, file filters
│       ├── utils/           # Response helpers, logger, key detection
│       ├── types/           # TypeScript type definitions
│       └── config/          # Environment config
├── frontend/                # React SPA
│   └── src/
│       ├── components/      # UI components (Sidebar, Dashboard, TableGrid, Modals)
│       ├── api.ts           # Backend API client
│       ├── App.tsx          # Root component
│       └── main.tsx         # Entry point
```

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm

### 1. Clone the repository

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `backend/.env` and add your Groq API key (required for AI features):

```
GROQ_API_KEY=your_groq_api_key_here
```

Start the dev server:

```bash
npm run dev
```

The backend runs on **http://localhost:3001**. It auto-creates `uploads/` and `data/` directories on startup.

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on **http://localhost:5173** and proxies `/api` requests to the backend automatically.

### 4. Open the app

Navigate to **http://localhost:5173** in your browser.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Backend server port |
| `NODE_ENV` | `development` | Environment mode |
| `DB_PATH` | `./data/database.duckdb` | Path to DuckDB database file |
| `UPLOAD_DIR` | `./uploads` | Temporary file upload directory |
| `MAX_FILE_SIZE` | `52428800` (50 MB) | Maximum upload file size in bytes |
| `GROQ_API_KEY` | — | Groq API key (required for AI features) |
| `FRONTEND_URL` | — | Frontend origin for CORS (production only) |

## API Endpoints

All routes are mounted under `/api/v1`.

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/upload` | Upload a file and get schema preview |
| `GET` | `/upload/preview/:fileId` | Retrieve upload preview |
| `POST` | `/upload/commit/:fileId` | Commit previewed file into DuckDB |
| `GET` | `/tables` | List all tables |
| `GET` | `/tables/:tableId` | Get table details |
| `GET` | `/tables/:tableId/data` | Get paginated table data |
| `DELETE` | `/tables/:tableId` | Delete a table |
| `POST` | `/normalization/analyze` | Analyze table for normalization candidates |
| `POST` | `/normalization/apply` | Apply normalization (creates lookup tables) |
| `POST` | `/star-schema/analyze` | AI-powered star schema analysis |
| `POST` | `/star-schema/apply` | Apply star schema transformation |
| `POST` | `/query` | Natural-language query against a table |
| `POST` | `/chart` | Generate chart data from a table |

## Available Scripts

### Backend (`cd backend`)

| Command | Description |
|---|---|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run production build |
| `npm run lint` | Run ESLint |
| `npm run format` | Run Prettier |

### Frontend (`cd frontend`)

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run lint` | Run ESLint |
| `npm run preview` | Preview production build |

## How It Works

1. **Upload** — Drop a file into the upload modal. The backend parses it, infers column types (using majority-vote across up to 1,000 sample rows), and returns a preview. On commit, the data is loaded into DuckDB.

2. **Browse** — Select any table from the sidebar to view its data in a paginated grid. Right-click a table for actions (normalize, star schema, delete).

3. **Query** — Type a natural-language question in the sidebar. The AI translates it to SQL, executes it against DuckDB, and displays the results.

4. **Normalize** — The platform scans columns for repetition patterns and suggests lookup-table extractions. Applying normalization replaces the original table with a normalized version plus `lkp_*` lookup tables.

5. **Star Schema** — AI analyzes your table's sample data and recommends a fact table plus dimension tables. Applying the schema restructures your data accordingly.

6. **Dashboard** — Create charts (Bar, Line, Pie, Doughnut) from any table with configurable axes, aggregations, and color themes. Arrange charts on a draggable grid layout.

## License

See [LICENSE](LICENSE) for details.
