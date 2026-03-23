# Frontend

React single-page application for the no-code database platform. Users upload data files, browse tables, and restructure data through normalization and star schema transformations — all via point-and-click UI.

## Tech Stack

- **React 18** with TypeScript
- **Vite** — dev server and build tooling
- **Tailwind CSS** — utility-first styling
- **Chart.js** + **react-chartjs-2** — dashboard visualizations
- **react-grid-layout** — draggable/resizable dashboard widgets

## Getting Started

```bash
npm install
npm run dev        # Starts Vite dev server on http://localhost:5173
```

The dev server proxies all `/api` requests to `http://localhost:3001`, so the backend must be running for full functionality.

## Scripts

| Command           | Description                        |
|-------------------|------------------------------------|
| `npm run dev`     | Start dev server with HMR          |
| `npm run build`   | Type-check and build for production|
| `npm run preview` | Preview the production build       |
| `npm run lint`    | Run ESLint                         |

## Project Structure

```
src/
├── main.tsx                    # Entry point
├── App.tsx                     # Root component — layout, routing, modal state
├── api.ts                      # API client — wraps all backend calls
└── components/
    ├── Sidebar.tsx              # Navigation, table list, context menus, NL query input
    ├── Dashboard.tsx            # Chart widgets with drag-and-drop grid layout
    ├── TableGrid.tsx            # Paginated table data viewer
    ├── Modal.tsx                # Reusable modal shell
    ├── UploadModal.tsx          # File upload flow (upload → preview → commit)
    ├── NormalizationModal.tsx   # Analyze and apply repetition-based normalization
    └── StarSchemaModal.tsx      # AI-driven star schema analysis and transformation
```

## Key Features

- **File Upload** — drag-and-drop or browse for CSV, Excel, and JSON files. Preview schema and data before committing to the database.
- **Table Browser** — paginated grid view of any imported table with column type indicators.
- **Normalization** — analyze tables for repetitive data patterns, then extract dimension/lookup tables with one click.
- **Star Schema** — AI-powered analysis recommends fact and dimension table splits; apply the transformation directly.
- **Dashboard** — build charts (bar, line, pie, doughnut) from table data with configurable aggregations, color themes, and resizable widget layout.
- **Natural Language Query** — ask questions about your data in plain English from the sidebar; results display in a tabular view.

## API Communication

All backend calls go through `src/api.ts`, which provides a typed `api` object. The module handles response shape transformations between the backend's raw format and frontend-friendly types. API paths are relative (`/api/v1/...`) and proxied to the backend in development via `vite.config.ts`.
