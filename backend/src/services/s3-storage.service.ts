import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { StorageProvider } from './storage.interface';
import { S3_BUCKET_NAME } from '../config';

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucketRoot: string;

  constructor() {
    this.bucketRoot = S3_BUCKET_NAME;
    if (!this.bucketRoot) {
      throw new Error('S3_BUCKET_NAME não configurado');
    }
    this.client = new S3Client({
      region: process.env.AWS_REGION || 'us-east-1',
      credentials:
        process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            }
          : undefined,
    });
  }

  async upload(file: Buffer, path: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketRoot,
      Key: path,
      Body: file,
    });
    await this.client.send(command);
    return path;
  }

  async get(path: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.bucketRoot,
      Key: path,
    });
    const result = await this.client.send(command);
    const body = result.Body as Readable | undefined;
    if (!body) throw new Error('Resposta do S3 sem corpo');
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      body.on('data', (chunk: Buffer) => chunks.push(chunk));
      body.on('end', () => resolve(Buffer.concat(chunks)));
      body.on('error', reject);
    });
  }

  async delete(path: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketRoot,
      Key: path,
    });
    await this.client.send(command);
  }
}
