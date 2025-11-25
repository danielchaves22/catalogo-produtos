import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { HttpRequest as ProtocolHttpRequest } from '@smithy/protocol-http';
import type { HttpRequest as SmithyHttpRequest } from '@smithy/types';
import { SignatureV4 } from '@smithy/signature-v4';
import { Sha256 } from '@aws-crypto/sha256-js';
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

    // Usar path-style evita erro de TLS quando o bucket contém pontos no nome
    const host = `s3.${region}.amazonaws.com`;
    const encodedPath = encodeURIComponent(path).replace(/%2F/g, '/');

    const request = new ProtocolHttpRequest({
      protocol: 'https:',
      hostname: host,
      method: 'GET',
      path: `/${this.bucketRoot}/${encodedPath}`,
      headers: {
        host,
        'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
      },
      query: {},
    });

    if (options?.filename) {
      request.query = {
        ...request.query,
        'response-content-disposition': `attachment; filename="${options.filename}"`,
      };
    }

    const signedRequest = await signer.presign(request, { expiresIn: expiresInSeconds });

    return this.formatSignedUrl(signedRequest);
  }
  
  private formatSignedUrl(request: SmithyHttpRequest): string {
    const protocol = request.protocol ?? 'https:';
    const hostname = request.hostname ?? '';
    const port = request.port ? `:${request.port}` : '';
    const path = request.path ?? '/';
    const query = request.query ?? {};

    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item !== undefined) searchParams.append(key, String(item ?? ''));
        }
      } else if (value !== undefined) {
        searchParams.append(key, String(value ?? ''));
      }
    }

    const queryString = searchParams.toString();

    return `${protocol}//${hostname}${port}${path}${queryString ? `?${queryString}` : ''}`;
  }
}
