import { useEffect,useState } from 'react';
import { getDocument } from '../documents';
export default function DocumentPreview({documentId,page=1}:{documentId:string;page?:number}) {
  const [url,setUrl]=useState('');const [error,setError]=useState('');
  useEffect(()=>{let alive=true;let objectUrl='';getDocument(documentId).then(doc=>{if(!doc)throw new Error('O PDF original não está neste navegador. Restaure um backup que inclua os documentos.');objectUrl=URL.createObjectURL(doc.blob);if(alive)setUrl(objectUrl);}).catch(e=>{if(alive)setError(String(e.message));});return ()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};},[documentId]);
  if(error)return <div className="notice">{error}</div>;if(!url)return <p className="muted">Carregando documento original…</p>;
  return <details className="original-document"><summary>Conferir página {page} do PDF original (código, imagens e tabelas)</summary><iframe title={`Documento original, página ${page}`} src={`${url}#page=${page}`} style={{width:'100%',height:550,border:'1px solid var(--border)',borderRadius:12}}/><a href={url} target="_blank" rel="noreferrer">Abrir PDF original em outra aba</a></details>;
}
