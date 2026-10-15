import { Component, type ReactNode } from 'react';
import { downloadFile, STORAGE_KEY } from './storage';
export default class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}> {
  state={error:false};
  static getDerivedStateFromError(){return {error:true};}
  render(){if(!this.state.error)return this.props.children;return <main style={{maxWidth:650,margin:'10vh auto',padding:30}}><section className="card"><h1>Seu histórico merece cuidado.</h1><p>Uma falha impediu a abertura desta tela. Os dados do navegador foram preservados. Exporte uma cópia antes de tentar recarregar ou restaurar um backup.</p><div className="toolbar"><button className="button button-primary" onClick={()=>{try{downloadFile('prumo-recuperacao.json',localStorage.getItem(STORAGE_KEY)||'{}');}catch{alert('O navegador bloqueou o acesso ao armazenamento.');}}}>Exportar dados para recuperação</button><button className="button button-secondary" onClick={()=>location.reload()}>Recarregar</button></div></section></main>;}
}
