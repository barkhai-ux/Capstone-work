import path from 'path';

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  dbPath: process.env.DB_PATH || './data/database.duckdb',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '52428800', 10), // 50MB default
  groqApiKey: process.env.GROQ_API_KEY || '',

  // Normalization thresholds
  normalization: {
    minRepetitionRate: 90, // percentage
    maxUniqueValues: 100,
    minUniqueValues: 2,
    highConfidenceRate: 95,
    highConfidenceMaxUnique: 50,
  },

  // Pagination defaults
  pagination: {
    defaultPageSize: 50,
    maxPageSize: 1000,
  },

  // File types
  allowedMimeTypes: [
    'text/csv',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/json',
  ],

  allowedExtensions: ['.csv', '.xlsx', '.xls', '.json'],
};

export const getAbsolutePath = (relativePath: string): string => {
  return path.resolve(process.cwd(), relativePath);
};
