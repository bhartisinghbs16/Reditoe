import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import multerS3 from 'multer-s3';
import s3Client from './s3.js';
import { uploadFileFilter, sniffUploadType } from '../utils/fileSniff.js';

const limits = { fileSize: 10 * 1024 * 1024, files: 10 };
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
  const unique = crypto.randomBytes(16).toString('hex');
  const parts = String(file.originalname || '').split('.');
  const extension = parts.length > 1 ? parts.pop() : 'bin';
  return `${unique}.${extension}`;
}

const createDiskUpload = (folder) => {
  const target = path.join(LOCAL_DIR, folder);
  fs.mkdirSync(target, { recursive: true });

  const disk = multer.diskStorage({
    destination: (req, file, cb) => cb(null, target),
    filename: (req, file, cb) => cb(null, fileName(file)),
  });

  /*
   * The extension and Content-Type are the sender's word. Once the file is
   * on disk its first bytes are read, and anything that is not really an
   * image or a PDF is deleted and refused.
   */
  const storage = {
    _handleFile(req, file, cb) {
      disk._handleFile(req, file, (error, info) => {
        if (error) return cb(error);
        try {
          const fd = fs.openSync(info.path, 'r');
          const head = Buffer.alloc(16);
          fs.readSync(fd, head, 0, 16, 0);
          fs.closeSync(fd);
          if (!sniffUploadType(head)) {
            fs.unlink(info.path, () => {});
            return cb(new Error('That file is not a valid image or PDF.'));
          }
        } catch (sniffError) {
          return cb(sniffError);
        }
        return cb(null, info);
      });
    },
    _removeFile(req, file, cb) {
      disk._removeFile(req, file, cb);
    },
  };

  return multer({ storage, limits, fileFilter: uploadFileFilter });
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
      fileFilter: uploadFileFilter,
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
