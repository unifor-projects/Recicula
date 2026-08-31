'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { 
  AlertTriangle, 
  Trash2, 
  UserX, 
  Check, 
  ExternalLink, 
  Clock, 
  User, 
  Flag, 
  ShieldAlert 
} from 'lucide-react';

import axios from 'axios';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';

interface Denuncia {
  id: number;
  denunciante_id: number;
  anuncio_id: number | null;
  usuario_denunciado_id: number | null;
  motivo: string;
  descricao: string | null;
  status: 'pendente' | 'analisada' | 'resolvida';
  admin_id: number | null;
  criado_em: string;
  resolvido_em: string | null;
}

export default function ModeracaoPage() {
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  
  const [denuncias, setDenuncias] = useState<Denuncia[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);
  
  // Auth validation state
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
  // Action loading tracker by report ID and action type
  const [processingId, setProcessingId] = useState<number | null>(null);

  // 1. Verify admin authorization
  useEffect(() => {
    const hasToken = typeof window !== 'undefined' && sessionStorage.getItem('access_token');
    
    if (!isAuthenticated && !hasToken) {
      toast.error('Acesso restrito. Faça login como administrador.');
      router.replace('/login');
      return;
    }

    if (user) {
      if (!user.is_admin) {
        toast.error('Acesso negado. Apenas administradores podem acessar esta página.');
        router.replace('/anuncios');
      } else {
        setIsAuthorized(true);
        setCheckingAuth(false);
      }
    }
  }, [user, isAuthenticated, router]);

  // 2. Fetch pending reports
  async function carregarDenuncias() {
    try {
      setLoading(true);
      setErrorState(null);
      const { data } = await api.get<Denuncia[]>('/admin/denuncias');
      setDenuncias(data);
    } catch {
      setErrorState('Não foi possível carregar as denúncias pendentes.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAuthorized) {
      void carregarDenuncias();
    }
  }, [isAuthorized]);

  // 3. Resolve report
  async function handleResolver(denunciaId: number, acao: 'ignorar' | 'remover_anuncio' | 'suspender_usuario') {
    const acaoLabel = 
      acao === 'ignorar' ? 'ignorar' : 
      acao === 'remover_anuncio' ? 'remover o anúncio' : 'suspender o usuário';
      
    if (acao !== 'ignorar') {
      const confirmou = window.confirm(`Tem certeza de que deseja ${acaoLabel} relacionado a esta denúncia?`);
      if (!confirmou) return;
    }

    setProcessingId(denunciaId);

    try {
      await api.patch(`/admin/denuncias/${denunciaId}/resolver`, { acao });
      toast.success('Denúncia resolvida com sucesso!');
      
      // Update local state by removing resolved report
      setDenuncias((prev) => prev.filter((d) => d.id !== denunciaId));
    } catch (err: unknown) {
      let message = 'Erro ao processar ação de moderação.';
      if (axios.isAxiosError(err)) {
        const apiMessage = err.response?.data?.detail;
        if (typeof apiMessage === 'string') {
          message = apiMessage;
        }
      }
      toast.error(message);
    } finally {
      setProcessingId(null);
    }
  }

  function formatarData(dataISO: string): string {
    const data = new Date(dataISO);
    if (Number.isNaN(data.getTime())) return dataISO;
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(data);
  }

  if (checkingAuth) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent inline-block" />
          <p className="text-sm text-gray-500 font-medium">Verificando credenciais de administrador...</p>
        </div>
      </main>
    );
  }

  if (!isAuthorized) return null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        
        {/* Header */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
              <ShieldAlert size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Painel de Moderação</h1>
              <p className="text-sm text-gray-500">Analise denúncias pendentes e aplique ações administrativas.</p>
            </div>
          </div>
          <button
            onClick={() => void carregarDenuncias()}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
          >
            Atualizar Lista
          </button>
        </div>

        {/* List Content */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 w-full animate-pulse rounded-2xl bg-white border border-gray-200" />
            ))}
          </div>
        ) : errorState ? (
          <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
            <AlertTriangle className="mx-auto h-12 w-12 text-red-500" />
            <h3 className="mt-3 text-lg font-semibold text-red-900">Erro ao carregar dados</h3>
            <p className="mt-1 text-sm text-red-600">{errorState}</p>
            <button
              onClick={() => void carregarDenuncias()}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
            >
              Tentar Novamente
            </button>
          </div>
        ) : denuncias.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-50 text-green-600">
              <Check size={28} />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Nenhuma denúncia pendente</h3>
            <p className="mt-2 text-sm text-gray-500 max-w-sm mx-auto">
              Excelente! Todos os anúncios e perfis denunciados foram resolvidos ou estão em conformidade com as diretrizes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {denuncias.map((denuncia) => {
              const isAnuncio = !!denuncia.anuncio_id;
              return (
                <div 
                  key={denuncia.id} 
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition hover:shadow-md flex flex-col md:flex-row justify-between gap-6"
                >
                  {/* Report Details */}
                  <div className="space-y-3 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        isAnuncio ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-purple-50 text-purple-700 border border-purple-200'
                      }`}>
                        {isAnuncio ? <Flag size={12} /> : <User size={12} />}
                        {isAnuncio ? 'Denúncia de Anúncio' : 'Denúncia de Usuário'}
                      </span>
                      
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Clock size={12} />
                        {formatarData(denuncia.criado_em)}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <h4 className="text-base font-semibold text-gray-900">
                        Motivo: <span className="text-red-600">{denuncia.motivo}</span>
                      </h4>
                      {denuncia.descricao && (
                        <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700 border border-gray-100 italic">
                          &quot;{denuncia.descricao}&quot;
                        </div>
                      )}
                    </div>

                    {/* Metadata / Links */}
                    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-gray-600 pt-1">
                      <a 
                        href={`/perfil/${denuncia.denunciante_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 hover:text-green-600 underline"
                      >
                        Autor da denúncia (ID: {denuncia.denunciante_id})
                        <ExternalLink size={11} />
                      </a>

                      {isAnuncio ? (
                        <a 
                          href={`/anuncios/${denuncia.anuncio_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline"
                        >
                          Visualizar Anúncio Denunciado (ID: {denuncia.anuncio_id})
                          <ExternalLink size={11} />
                        </a>
                      ) : (
                        <a 
                          href={`/perfil/${denuncia.usuario_denunciado_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-purple-600 hover:text-purple-800 underline"
                        >
                          Visualizar Usuário Denunciado (ID: {denuncia.usuario_denunciado_id})
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-row md:flex-col justify-end gap-2 min-w-[180px]">
                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => void handleResolver(denuncia.id, 'ignorar')}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50"
                    >
                      <Check size={16} />
                      {processingId === denuncia.id ? '...' : 'Ignorar'}
                    </button>

                    {isAnuncio && (
                      <button
                        type="button"
                        disabled={processingId !== null}
                        onClick={() => void handleResolver(denuncia.id, 'remover_anuncio')}
                        className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:opacity-50"
                      >
                        <Trash2 size={16} />
                        {processingId === denuncia.id ? '...' : 'Remover Anúncio'}
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={processingId !== null}
                      onClick={() => void handleResolver(denuncia.id, 'suspender_usuario')}
                      className="flex-1 md:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
                    >
                      <UserX size={16} />
                      {processingId === denuncia.id ? '...' : 'Suspender Usuário'}
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        )}

      </div>
    </main>
  );
}
