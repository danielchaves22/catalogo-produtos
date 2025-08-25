import { StorageProvider } from './storage.interface';
import { AppEnv } from '../utils/environment';

export class S3StorageProvider implements StorageProvider {
  private client: any;
  private PutObjectCommand: any;
  private GetObjectCommand: any;
  private env: AppEnv;
  private bucketRoot: string;

  constructor(env: AppEnv) {
    this.env = env;
    this.bucketRoot = env === 'prod' ? 'catprod-prd' : 'catprod-hml';
    try {
      const aws = require('@aws-sdk/client-s3');
      this.client = new aws.S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY ? {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        } : undefined
      });
      this.PutObjectCommand = aws.PutObjectCommand;
      this.GetObjectCommand = aws.GetObjectCommand;
    } catch {
      this.client = null;
    }
  }

  async upload(file: Buffer, path: string): Promise<string> {
    if (!this.client) throw new Error('S3 client não configurado');
    const command = new this.PutObjectCommand({
      Bucket: this.bucketRoot,
      Key: path,
      Body: file
    });
    await this.client.send(command);
    return path;
  }

  async get(path: string): Promise<Buffer> {
    if (!this.client) throw new Error('S3 client não configurado');
    const command = new this.GetObjectCommand({
      Bucket: this.bucketRoot,
      Key: path
    });
    const result = await this.client.send(command);
    return await new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      result.Body.on('data', (chunk: Buffer) => chunks.push(chunk));
      result.Body.on('end', () => resolve(Buffer.concat(chunks)));
      result.Body.on('error', reject);
    });
  }
}
