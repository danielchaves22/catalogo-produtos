import crypto from 'crypto';

const ALGORITHM = 'aes-256-ctr';
const SECRET = process.env.CERT_PASSWORD_SECRET || ''.padEnd(32, '0');

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(SECRET, 'hex'), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

export function decrypt(hash: string): string {
  const [ivHex, contentHex] = hash.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(SECRET, 'hex'), iv);
  const decrypted = Buffer.concat([decipher.update(Buffer.from(contentHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
