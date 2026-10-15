import { useEffect, useState } from 'react';
import { getDocument } from '../documents';

export interface DocumentReference { documentId?: string; assetUrl?: string; page?: number; }
export const isLocalPdfAsset = (value: unknown): value is string => typeof value === 'string' && /^\/documents\/[a-zA-Z0-9._-]+\.pdf$/.test(value);

/** Prefer an imported original; bundled originals also work on a fresh browser. */
export async function loadOriginalPdfBlob({ documentId, assetUrl }: DocumentReference, signal?: AbortSignal): Promise<Blob> {
  if (documentId) {
    try { const stored = await getDocument(documentId); if (stored) return stored.blob; }
    catch (cause) { if (!assetUrl) throw cause; }
  }
  if (!assetUrl) throw new Error('O PDF original não está neste navegador. Restaure um backup que inclua os documentos.');
  if (!isLocalPdfAsset(assetUrl)) throw new Error('O caminho do PDF original é inválido. Use um documento local da plataforma.');
  const response = await fetch(assetUrl, { signal });
  if (!response.ok) throw new Error(`Não foi possível carregar o PDF original (HTTP ${response.status}).`);
  const blob = await response.blob();
  if (!(await blob.slice(0, 5).text()).startsWith('%PDF-')) throw new Error('O servidor não devolveu um PDF válido. O documento pode estar ausente nesta instalação.');
  return blob;
}

export default function DocumentPreview({ documentId, assetUrl, page = 1 }: DocumentReference) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true, objectUrl = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    setUrl(''); setError('');
    void loadOriginalPdfBlob({ documentId, assetUrl }, controller.signal).then(blob => {
      if (!alive) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(cause => {
      if (alive) setError(cause instanceof Error && cause.name === 'AbortError' ? 'O carregamento do PDF excedeu 30 segundos. Reabra esta página para tentar novamente.' : cause instanceof Error ? cause.message : 'Não foi possível abrir o PDF original.');
    }).finally(() => clearTimeout(timeout));
    return () => { alive = false; clearTimeout(timeout); controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId, assetUrl]);
  if (error) return <div className="notice" role="alert">{error}</div>;
  if (!url) return <p className="muted">Carregando documento original…</p>;
  return <details className="original-document"><summary>Conferir página {page} do PDF original (código, imagens e tabelas)</summary><iframe title={`Documento original, página ${page}`} src={`${url}#page=${page}`} style={{ width: '100%', height: 550, border: '1px solid var(--border)', borderRadius: 12 }}/><a href={`${url}#page=${page}`} target="_blank" rel="noreferrer">Abrir PDF original em outra aba</a></details>;
}
