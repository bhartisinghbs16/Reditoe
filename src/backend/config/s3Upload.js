import fs from 'fs';
import path from 'path';
import multer from 'multer';
import multerS3 from 'multer-s3';
import s3Client from './s3.js';

const limits = { fileSize: 10 * 1024 * 1024 };
const hasS3Config = Boolean(process.env.AWS_S3_BUCKET && process.env.AWS_ACCESS_KEY_ID);

/**
 * Where uploads land when S3 is not configured.
 *
 * Previously that case fell back to memory storage, which accepts the file and
 * then drops it: nothing is written anywhere, and `req.file.location` — the
 * field multer-s3 sets and every upload handler reads — is undefined. The
 * request answered 200 with an empty URL, so image upload appeared broken with
 * no error explaining why. Writing to disk means an upload without S3 still
 * produces a file and a URL that resolves.
 */
const LOCAL_DIR = path.resolve(process.cwd(), 'uploads');

/**
 * Optional absolute origin for locally stored files. Left unset, URLs are
 * returned relative, which is what we want: an absolute http://localhost:5000
 * resolves to the visitor's own machine, so every uploaded image was broken
 * for everyone except whoever ran the server.
 */
const localBase = () =>
  (process.env.PUBLIC_UPLOAD_URL || '').replace(/\/+$/, '');

function fileName(file) {
  const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const parts = String(file.originalname || '').split('.');
  const extension = parts.length > 1 ? parts.pop() : 'bin';
  return `${unique}.${extension}`;
}

const createDiskUpload = (folder) => {
  const target = path.join(LOCAL_DIR, folder);
  fs.mkdirSync(target, { recursive: true });

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, target),
      filename: (req, file, cb) => cb(null, fileName(file)),
    }),
    limits,
  });
};

export const uploadToS3 = (folder = 'uploads') => {
  if (!hasS3Config) {
    return createDiskUpload(folder);
  }

  try {
    return multer({
      storage: multerS3({
        s3: s3Client,
        bucket: process.env.AWS_S3_BUCKET,
        contentType: multerS3.AUTO_CONTENT_TYPE,
        key: (req, file, cb) => cb(null, `${folder}/${fileName(file)}`),
      }),
      limits,
    });
  } catch (error) {
    return createDiskUpload(folder);
  }
};

/**
 * The public URL of an uploaded file, whichever storage handled it.
 *
 * multer-s3 sets `location`; disk storage sets `path` and `destination`. Every
 * handler previously read `location` alone, so a disk upload produced an empty
 * URL and the client reported "the server did not return an image URL".
 */
export const uploadedFileUrl = (file) => {
  if (!file) return '';
  if (file.location) return file.location;
  if (!file.filename) return '';

  const folder = path
    .relative(LOCAL_DIR, file.destination || LOCAL_DIR)
    .split(path.sep)
    .filter(Boolean)
    .join('/');

  return `${localBase()}/uploads/${folder ? `${folder}/` : ''}${file.filename}`;
};

export const getS3Url = (key) => `${process.env.AWS_S3_URL}/${key}`;
