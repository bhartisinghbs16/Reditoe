import path from 'path';

/**
 * What a file really is, judged from its first bytes rather than its name.
 *
 * A filename and the Content-Type header are both written by the sender, so
 * "payload.html" renamed to "photo.jpg" would pass a check on either. The
 * leading bytes of a genuine JPEG, PNG, GIF, WebP, AVIF or PDF are fixed,
 * so those are what uploads are held to.
 */
export const ALLOWED_UPLOAD_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.jfif', '.pjpeg', '.pjp', '.png', '.webp', '.gif', '.avif', '.pdf',
]);

export const ALLOWED_UPLOAD_MIME = new Set([
  'image/jpeg', 'image/pjpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
  'application/pdf',
  // Some browsers and pickers send a good file as an anonymous stream; the
  // extension and the bytes are what decide in that case.
  'application/octet-stream', 'binary/octet-stream', '',
]);

export const sniffUploadType = (buffer) => {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buffer.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  if (buffer.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  if (buffer.length >= 12) {
    if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
      return 'image/webp';
    }
    if (buffer.toString('latin1', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(buffer.toString('latin1', 8, 12))) {
      return 'image/avif';
    }
  }
  return null;
};

/** multer fileFilter: type claimed by name and header. Bytes are checked after. */
export const uploadFileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  const declared = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_UPLOAD_EXTENSIONS.has(ext) || !ALLOWED_UPLOAD_MIME.has(declared)) {
    return cb(new Error('Only images (JPG, PNG, WebP, GIF) and PDF files can be uploaded.'), false);
  }
  return cb(null, true);
};

export const assertUploadBuffer = (buffer) => {
  if (!sniffUploadType(buffer)) {
    const error = new Error('That file is not a valid image or PDF.');
    error.status = 400;
    throw error;
  }
};
