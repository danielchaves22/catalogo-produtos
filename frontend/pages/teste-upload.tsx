import { useState, FormEvent, ChangeEvent } from 'react';
import api from '@/lib/api';

export default function TesteUpload() {
  const [identifier, setIdentifier] = useState('');
  const [catalogo, setCatalogo] = useState('');
  const [type, setType] = useState<'certificados' | 'anexos'>('certificados');
  const [file, setFile] = useState<File | null>(null);
  const [resultado, setResultado] = useState<string>('');

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return;
    const arrayBuffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);
    const payload: any = {
      fileName: file.name,
      fileContent: base64,
      identifier,
      type
    };
    if (type === 'anexos') {
      payload.catalogo = catalogo;
    }
    try {
      const resp = await api.post('/upload', payload);
      setResultado(`Arquivo salvo em: ${resp.data.path}`);
    } catch (err: any) {
      setResultado(`Erro: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>Teste de Upload</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label>
          Identificador
          <input value={identifier} onChange={e => setIdentifier(e.target.value)} />
        </label>
        <label>
          Tipo
          <select value={type} onChange={e => setType(e.target.value as any)}>
            <option value="certificados">Certificados</option>
            <option value="anexos">Anexos</option>
          </select>
        </label>
        {type === 'anexos' && (
          <label>
            Catálogo
            <input value={catalogo} onChange={e => setCatalogo(e.target.value)} />
          </label>
        )}
        <label>
          Arquivo
          <input type="file" onChange={handleFile} />
        </label>
        <button type="submit">Enviar</button>
      </form>
      {resultado && <p>{resultado}</p>}
    </div>
  );
}
