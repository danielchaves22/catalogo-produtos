import { Router } from 'express';
import { storageFactory } from '../services/storage.factory';
import { getStoragePath } from '../utils/environment';

const router = Router();

router.post('/', async (req, res) => {
  const { fileName, fileContent, identifier, catalogo, produto, type } = req.body as {
    fileName?: string;
    fileContent?: string;
    identifier?: string;
    catalogo?: string;
    produto?: string;
    type?: 'certificados' | 'anexos';
  };

  if (!fileName || !fileContent || !identifier || !type) {
    return res.status(400).json({ error: 'Parâmetros obrigatórios ausentes' });
  }
  if (type === 'anexos' && (!catalogo || !produto)) {
    return res.status(400).json({ error: 'catalogo e produto são obrigatórios para anexos' });
  }

  try {
    const provider = storageFactory();
    const base = getStoragePath({ identifier, catalogo, produto, type });
    const path = `${base}/${fileName}`;
    const buffer = Buffer.from(fileContent, 'base64');
    await provider.upload(buffer, path);
    return res.status(200).json({ path });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha no upload';
    return res.status(500).json({ error: message });
  }
});

export default router;
