import { Request } from 'express';
import multer, { FileFilterCallback } from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { config, getAbsolutePath } from '../config/index.js';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, getAbsolutePath(config.uploadDir));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback
): void => {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!config.allowedExtensions.includes(ext)) {
    cb(new Error(`File type ${ext} is not allowed. Allowed types: ${config.allowedExtensions.join(', ')}`));
    return;
  }

  cb(null, true);
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize,
  },
});
