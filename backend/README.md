# No-Code Database Platform - Backend

A Node.js + Express + DuckDB backend for the no-code database platform that enables users to upload data files, manage tables, and perform database normalization analysis.

## Features

- **File Upload**: Support for CSV, Excel (.xlsx, .xls), and JSON files
- **Schema Detection**: Automatic column type inference (INTEGER, DECIMAL, DATE, VARCHAR, etc.)
- **DuckDB Integration**: High-performance analytical database with native CSV import
- **Table Management**: CRUD operations for database tables
- **Normalization Analysis**: Identifies columns suitable for normalization based on repetition rates
- **RESTful API**: Clean, consistent API responses

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: DuckDB (via @duckdb/node-api)
- **Language**: TypeScript
- **File Parsing**: PapaParse (CSV), xlsx (Excel)
- **Validation**: Zod
- **Logging**: Winston

## Project Structure

```
backend/
├── src/
│   ├── index.ts                    # Entry point
│   ├── app.ts                      # Express configuration
│   ├── config/
│   │   └── index.ts                # Configuration settings
│   ├── routes/
│   │   ├── index.ts                # Route aggregator
│   │   ├── upload.routes.ts        # File upload endpoints
│   │   ├── tables.routes.ts        # Table management
│   │   └── normalization.routes.ts # Normalization analysis
│   ├── controllers/
│   │   ├── upload.controller.ts    # Upload request handlers
│   │   ├── tables.controller.ts    # Table request handlers
│   │   └── normalization.controller.ts
│   ├── services/
│   │   ├── duckdb.service.ts       # DuckDB operations
│   │   ├── file-parser.service.ts  # CSV, Excel, JSON parsing
│   │   ├── schema-detector.service.ts # Type inference
│   │   ├── normalization.service.ts   # Normalization algorithm
│   │   └── validation.service.ts   # Zod schemas
│   ├── middleware/
│   │   ├── error-handler.ts        # Error handling
│   │   └── file-filter.ts          # Multer configuration
│   ├── types/
│   │   └── index.ts                # TypeScript interfaces
│   └── utils/
│       ├── logger.ts               # Winston logger
│       └── response.ts             # Response helpers
├── uploads/                        # Temporary file storage
├── data/                           # DuckDB database files
├── test-data/                      # Sample test files
├── package.json
├── tsconfig.json
└── .env
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Configuration

Environment variables (`.env`):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3001 | Server port |
| `NODE_ENV` | development | Environment mode |
| `DB_PATH` | ./data/database.duckdb | DuckDB database path |
| `UPLOAD_DIR` | ./uploads | Temporary upload directory |
| `MAX_FILE_SIZE` | 52428800 | Max file size in bytes (50MB) |

## API Reference

### Base URL
```
http://localhost:3001/api/v1
```

### Response Format
All responses follow this structure:
```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

Error responses:
```json
{
  "success": false,
  "error": "Error description"
}
```

---

### Health Check

#### `GET /health`

Check if the server is running.

**Response:**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-02-03T09:12:38.159Z"
  }
}
```

---

### File Upload

#### `POST /upload`

Upload a data file for preview and schema detection.

**Request:**
- Content-Type: `multipart/form-data`
- Body: `file` - The file to upload (CSV, Excel, or JSON)

**Response:**
```json
{
  "success": true,
  "data": {
    "fileId": "uuid",
    "fileName": "ecommerce_transactions.csv",
    "fileType": "csv",
    "suggestedTableName": "ecommerce_transactions",
    "schema": [
      {
        "name": "Transaction_ID",
        "type": "VARCHAR",
        "nullable": false,
        "sample": ["TXN001", "TXN002", "TXN003"]
      }
    ],
    "previewRows": [...],
    "totalRows": 30
  }
}
```

#### `GET /upload/preview/:fileId`

Get preview of an uploaded file before committing.

**Response:** Same as upload response.

#### `POST /upload/commit/:fileId`

Commit an uploaded file to create a database table.

**Request Body:**
```json
{
  "tableName": "my_table_name"  // Optional, auto-generated if not provided
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "tableId": "uuid",
    "tableName": "ecommerce_transactions",
    "columnCount": 8,
    "rowCount": 30
  }
}
```

---

### Table Management

#### `GET /tables`

List all tables in the database.

**Response:**
```json
{
  "success": true,
  "data": {
    "tables": [
      {
        "id": "uuid",
        "name": "ecommerce_transactions",
        "columnCount": 8,
        "rowCount": 30,
        "createdAt": "2026-02-03 17:12:48",
        "columns": [
          {
            "name": "Transaction_ID",
            "type": "VARCHAR",
            "nullable": true
          }
        ]
      }
    ]
  }
}
```

#### `GET /tables/:tableId`

Get details of a specific table.

**Response:**
```json
{
  "success": true,
  "data": {
    "table": {
      "id": "uuid",
      "name": "ecommerce_transactions",
      "columnCount": 8,
      "rowCount": 30,
      "createdAt": "2026-02-03 17:12:48",
      "columns": [...]
    }
  }
}
```

#### `GET /tables/:tableId/data`

Get paginated table data.

**Query Parameters:**
| Parameter | Default | Description |
|-----------|---------|-------------|
| `page` | 1 | Page number |
| `pageSize` | 50 | Rows per page (max: 1000) |

**Response:**
```json
{
  "success": true,
  "data": {
    "tableId": "uuid",
    "tableName": "ecommerce_transactions",
    "data": [
      {
        "Transaction_ID": "TXN001",
        "Customer_ID": "CUST001",
        "Product_Name": "Laptop Pro 15",
        "Quantity": 1,
        "Unit_Price": 1299.99
      }
    ],
    "page": 1,
    "pageSize": 50,
    "totalRows": 30,
    "totalPages": 1
  }
}
```

#### `DELETE /tables/:tableId`

Delete a table from the database.

**Response:**
```json
{
  "success": true,
  "data": { "deleted": true },
  "message": "Table deleted successfully"
}
```

---

### Normalization Analysis

#### `POST /normalization/analyze`

Analyze a table for potential normalization candidates.

**Request Body:**
```json
{
  "tableId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysis": {
      "tableId": "uuid",
      "tableName": "ecommerce_transactions",
      "candidates": [
        {
          "column": "Product_Category",
          "repetitionRate": 93.33,
          "uniqueCount": 2,
          "totalRows": 30,
          "confidence": "MEDIUM",
          "suggestedLookupTable": "lkp_product_category",
          "estimatedSavings": 51,
          "topValues": [
            { "value": "Electronics", "count": 21 },
            { "value": "Furniture", "count": 9 }
          ]
        }
      ],
      "overallRecommendation": "Found 2 column(s) that could benefit from normalization..."
    }
  }
}
```

**Normalization Criteria:**
- Repetition rate > 90%
- Unique values: 2-100
- Confidence levels:
  - **HIGH**: >95% repetition, <50 unique values
  - **MEDIUM**: >90% repetition, <100 unique values

#### `POST /normalization/apply`

Apply normalization to create lookup tables.

**Request Body:**
```json
{
  "tableId": "uuid",
  "columns": ["Product_Category", "Payment_Method"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "result": {
      "success": true,
      "originalTable": "ecommerce_transactions",
      "lookupTablesCreated": ["lkp_product_category", "lkp_payment_method"],
      "columnsNormalized": ["Product_Category", "Payment_Method"],
      "rowsAffected": 30
    }
  }
}
```

---

## Column Type Detection

The schema detector automatically infers column types:

| Inferred Type | Detection Logic |
|---------------|-----------------|
| `INTEGER` | Whole numbers within int32 range |
| `DECIMAL` | Numbers with decimal points |
| `BOOLEAN` | true/false, yes/no, 1/0 |
| `DATE` | YYYY-MM-DD, MM/DD/YYYY formats |
| `TIMESTAMP` | ISO 8601 datetime with time |
| `VARCHAR` | Default for text/mixed data |

Type inference requires 80% agreement across sampled values.

---

## Error Handling

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 500 | Internal Server Error |

---

## Development

```bash
# Run in development mode with hot reload
npm run dev

# Type check without emitting
npx tsc --noEmit

# Build TypeScript
npm run build
```

## Testing with cURL

```bash
# Health check
curl http://localhost:3001/api/v1/health

# Upload a file
curl -X POST http://localhost:3001/api/v1/upload \
  -F "file=@./test-data/ecommerce_transactions.csv"

# Commit upload (use fileId from previous response)
curl -X POST http://localhost:3001/api/v1/upload/commit/{fileId} \
  -H "Content-Type: application/json" \
  -d '{"tableName": "my_table"}'

# List tables
curl http://localhost:3001/api/v1/tables

# Get table data
curl "http://localhost:3001/api/v1/tables/{tableId}/data?page=1&pageSize=10"

# Analyze for normalization
curl -X POST http://localhost:3001/api/v1/normalization/analyze \
  -H "Content-Type: application/json" \
  -d '{"tableId": "{tableId}"}'

# Apply normalization
curl -X POST http://localhost:3001/api/v1/normalization/apply \
  -H "Content-Type: application/json" \
  -d '{"tableId": "{tableId}", "columns": ["Product_Category"]}'
```

## License

American University of Mongolia
