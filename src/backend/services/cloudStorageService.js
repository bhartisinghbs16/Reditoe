import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import s3Client from '../config/s3.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class CloudStorageService {
  constructor() {
    this.s3Configured = !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION &&
      process.env.AWS_S3_BUCKET &&
      process.env.AWS_S3_URL
    );
  }

  getBasePublicUrl() {
    return (
      process.env.BASE_URL ||
      process.env.BACKEND_URL ||
      process.env.PRODUCTION_URL ||
      process.env.RENDER_EXTERNAL_URL ||
      'http://localhost:5000'
    ).replace(/\/+$/, '');
  }

  normalizeProvider(provider) {
    if (provider === 's3') return this.s3Configured ? 's3' : 'local';
    return 'local';
  }

  async uploadFile(file, provider = 'local', options = {}) {
    const resolvedProvider = this.normalizeProvider(provider);
    const handler = resolvedProvider === 's3' ? this.handleS3() : this.handleLocal();
    const result = await handler.upload(file, options);

    return {
      provider: resolvedProvider,
      filename: result.filename,
      storagePath: result.storagePath,
      publicUrl: result.publicUrl,
      secureUrl: result.publicUrl,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  async getFile(provider, storagePath) {
    const resolvedProvider = this.normalizeProvider(provider);
    const handler = resolvedProvider === 's3' ? this.handleS3() : this.handleLocal();
    return handler.get(storagePath);
  }

  async deleteFile(provider, storagePath) {
    const resolvedProvider = this.normalizeProvider(provider);
    const handler = resolvedProvider === 's3' ? this.handleS3() : this.handleLocal();
    return handler.delete(storagePath);
  }

  handleLocal() {
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    return {
      upload: async (file, options = {}) => {
        const category = options.category || 'general';
        const categoryDir = path.join(uploadsDir, category);
        if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 8);
        const extension = path.extname(file.originalname || '') || '.bin';
        const filename = `${timestamp}_${random}${extension}`;
        const storagePath = `${category}/${filename}`;
        const fullPath = path.join(categoryDir, filename);

        let buffer;
        if (Buffer.isBuffer(file.buffer)) buffer = file.buffer;
        else if (file.buffer) buffer = Buffer.from(file.buffer);
        else if (file.path && fs.existsSync(file.path)) buffer = fs.readFileSync(file.path);
        else throw new Error('Invalid uploaded file: missing buffer/path');

        fs.writeFileSync(fullPath, buffer);
        const publicUrl = `${this.getBasePublicUrl()}/uploads/${storagePath}`;

        return { filename, storagePath, publicUrl };
      },
      get: async (storagePath) => {
        const normalized = String(storagePath || '').replace(/\\/g, '/');
        const fullPath = path.join(uploadsDir, ...normalized.split('/'));
        if (!fs.existsSync(fullPath)) throw new Error('File not found');
        return { publicUrl: `${this.getBasePublicUrl()}/uploads/${normalized}` };
      },
      delete: async (storagePath) => {
        const normalized = String(storagePath || '').replace(/\\/g, '/');
        const fullPath = path.join(uploadsDir, ...normalized.split('/'));
        if (!fs.existsSync(fullPath)) return false;
        fs.unlinkSync(fullPath);
        return true;
      },
    };
  }

  handleS3() {
    return {
      upload: async (file, options = {}) => {
        const folder = options.folder || options.category || 'uploads';
        const extension = path.extname(file.originalname || '') || '.bin';
        const filename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
        const storagePath = `${folder}/${filename}`;

        let body;
        if (Buffer.isBuffer(file.buffer)) body = file.buffer;
        else if (file.buffer) body = Buffer.from(file.buffer);
        else if (file.path && fs.existsSync(file.path)) body = fs.readFileSync(file.path);
        else throw new Error('Invalid uploaded file: missing buffer/path');

        await s3Client.send(
          new PutObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: storagePath,
            Body: body,
            ContentType: file.mimetype || 'application/octet-stream',
          })
        );

        const base = String(process.env.AWS_S3_URL || '').replace(/\/+$/, '');
        return {
          filename,
          storagePath,
          publicUrl: `${base}/${storagePath}`,
        };
      },
      get: async (storagePath) => {
        const base = String(process.env.AWS_S3_URL || '').replace(/\/+$/, '');
        return { publicUrl: `${base}/${storagePath}` };
      },
      delete: async (storagePath) => {
        const key = String(storagePath || '').trim();
        if (!key) return false;
        await s3Client.send(
          new DeleteObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
          })
        );
        return true;
      },
      generatePresignedUrl: async (storagePath) => {
        const key = String(storagePath || '').trim();
        if (!key) return null;
        await s3Client.send(
          new HeadObjectCommand({
            Bucket: process.env.AWS_S3_BUCKET,
            Key: key,
          })
        );
        const base = String(process.env.AWS_S3_URL || '').replace(/\/+$/, '');
        return `${base}/${key}`;
      },
    };
  }
}

export default new CloudStorageService();
