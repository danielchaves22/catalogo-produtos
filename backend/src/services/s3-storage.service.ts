import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { StorageProvider } from './storage.interface';
import { S3_BUCKET_NAME } from '../config';
import { HttpRequest as ProtocolHttpRequest } from '@smithy/protocol-http';
import type { HttpRequest as SmithyHttpRequest } from '@smithy/types';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';

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

  async getSignedUrl(path: string, expiresInSeconds = 3600, options?: { filename?: string }) {
    const regionProvider = typeof this.client.config.region === 'function'
      ? this.client.config.region
      : () => Promise.resolve(String(this.client.config.region ?? process.env.AWS_REGION ?? 'us-east-1'));
    const credentialsProvider = typeof this.client.config.credentials === 'function'
      ? this.client.config.credentials
      : () => Promise.resolve(this.client.config.credentials as any);

    const region = await regionProvider();
    const credentials = await credentialsProvider();

    if (!credentials) {
      throw new Error('Credenciais AWS não configuradas para geração de URL assinada');
    }

    const signer = new SignatureV4({
      credentials,
      region,
      service: 's3',
      sha256: Sha256,
    });

    const host = `${this.bucketRoot}.s3.${region}.amazonaws.com`;
    const encodedPath = path
      .split('/')
      .map(segment => encodeURIComponent(segment))
      .join('/');

    const request = new ProtocolHttpRequest({
      protocol: 'https:',
      hostname: host,
      method: 'GET',
      path: `/${encodedPath}`,
      headers: {
        host,
      },
      query: {},
    });

    if (options?.filename) {
      request.query = {
        ...request.query,
        'response-content-disposition': `attachment; filename="${options.filename}"`,
      };
    }

    const signed = await signer.presign(request, { expiresIn: expiresInSeconds });

    return this.formatSignedUrl(signed);
  }

  private formatSignedUrl(request: SmithyHttpRequest): string {
    const protocol = request.protocol ?? 'https:';
    const hostname = request.hostname ?? '';
    const port = request.port ? `:${request.port}` : '';
    const path = request.path ?? '/';
    const query = request.query ?? {};

    const queryEntries: string[] = [];
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          queryEntries.push(`${encodeURIComponent(key)}=${encodeURIComponent(item ?? '')}`);
        }
      } else if (value !== undefined) {
        queryEntries.push(`${encodeURIComponent(key)}=${encodeURIComponent(value ?? '')}`);
      }
    }

    const queryString = queryEntries.length ? `?${queryEntries.join('&')}` : '';
    return `${protocol}//${hostname}${port}${path}${queryString}`;
  }
}
