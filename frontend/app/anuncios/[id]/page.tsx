'use client';

import { AxiosError } from 'axios';
import { MessageCircle, Flag } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Button from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import api, { API_BASE_URL } from '@/services/api';
import type { ChatConversation } from '@/types/chat';
import ReportModal from '@/components/ReportModal';

function getImageUrl(url: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
}

interface AnuncioImagem {
  id: number;
  url: string;
  ordem: number;
}

interface AnuncioUsuario {
  id: number;
  nome: string;
  foto_url: string | null;
  localizacao: string | null;
  criado_em: string;
}

interface AnuncioCategoria {
  id: number;
  nome: string;
}

interface Anuncio {
  id: number;
  titulo: string;
  descricao: string;
  tipo: string;
  condicao: string;
  status: string;
  localizacao: string | null;
  cep: string | null;
  usuario_id: number;
  categoria_id: number | null;
  criado_em: string;
  atualizado_em: string;
  imagens: AnuncioImagem[];
  categoria: AnuncioCategoria | null;
  usuario: AnuncioUsuario;
}

const TIPO_LABEL: Record<string, string> = { doacao: 'Doação', troca: 'Troca', ambos: 'Doação e Troca' };
const TIPO_COLOR: Record<string, string> = {
  doacao: 'bg-green-100 text-green-700',
  troca: 'bg-blue-100 text-blue-700',
  ambos: 'bg-purple-100 text-purple-700',
};
const STATUS_LABEL: Record<string, string> = {
  disponivel: 'Disponível',
  reservado: 'Reservado',
  doado_trocado: 'Concluído',
};
const STATUS_COLOR: Record<string, string> = {
  disponivel: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  reservado: 'bg-amber-50 text-amber-700 border border-amber-200',
  doado_trocado: 'bg-gray-100 text-gray-500 border border-gray-200',
};
const CONDICAO_LABEL: Record<string, string> = {
  novo: 'Novo',
  seminovo: 'Seminovo',
  usado: 'Usado',
  para_reparo: 'Para reparo',
};

function formatarData(dataISO: string): string {
  const data = new Date(dataISO);
  if (Number.isNaN(data.getTime())) return dataISO;
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(data);
}

function getApiError(error: unknown): string {
  if (error instanceof AxiosError) {
    const detail = (error.response?.data as { detail?: unknown } | undefined)?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail.map((e: Record<string, unknown>) => String(e.msg ?? e)).join('; ');
    }
    return 'Erro ao processar a requisição.';
  }
  return 'Erro ao processar a requisição.';
}

function getInitials(nome: string): string {
  const parts = nome.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function AnuncioDetailPage() {
  const params = useParams<{ id: string }>();
  const anuncioId = Number(params?.id ?? NaN);
  const router = useRouter();
  const { user } = useAuth();

  const [anuncio, setAnuncio] = useState<Anuncio | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [novoStatus, setNovoStatus] = useState('');
  const [isSavingStatus, setIsSavingStatus] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isStartingChat, setIsStartingChat] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  const isOwner = !!user && user.id === anuncio?.usuario_id;

  useEffect(() => {
    if (Number.isNaN(anuncioId) || anuncioId <= 0) {
      setErrorMessage('Anúncio inválido.');
      setLoading(false);
      return;
    }

    async function carregar() {
      try {
        const { data } = await api.get<Anuncio>(`/anuncios/${anuncioId}`);
        setAnuncio(data);
        setNovoStatus(data.status);
      } catch {
        setErrorMessage('Anúncio não encontrado.');
      } finally {
        setLoading(false);
      }
    }

    void carregar();
  }, [anuncioId]);

  async function handleStatusChange() {
    if (!anuncio || novoStatus === anuncio.status) return;
    setIsSavingStatus(true);
    setStatusFeedback(null);
    try {
      const { data } = await api.patch<Anuncio>(`/anuncios/${anuncioId}/status`, { status: novoStatus });
      setAnuncio(data);
      setStatusFeedback({ ok: true, msg: 'Status atualizado com sucesso.' });
    } catch (error) {
      setStatusFeedback({ ok: false, msg: getApiError(error) });
    } finally {
      setIsSavingStatus(false);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    try {
      await api.delete(`/anuncios/${anuncioId}`);
      router.push('/anuncios/meus');
    } catch (error) {
      setErrorMessage(getApiError(error));
      setShowDeleteConfirm(false);
      setIsDeleting(false);
    }
  }

  async function handleStartChat() {
    if (!anuncio || isStartingChat) return;
    setIsStartingChat(true);
    try {
      const { data } = await api.post<ChatConversation>('/api/chat/conversations', {
        user_id: anuncio.usuario.id,
      });
      router.push(`/chat?conv=${data.id}`);
    } catch {
      setIsStartingChat(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
        </div>
      </main>
    );
  }

  if (errorMessage && !anuncio) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="mx-auto max-w-4xl space-y-4">
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
          <Link href="/anuncios" className="text-sm text-green-600 hover:underline">
            ← Voltar para anúncios
          </Link>
        </div>
      </main>
    );
  }

  if (!anuncio) return null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <nav className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/anuncios" className="hover:text-green-600">
            Anúncios
          </Link>
          <span>/</span>
          <span className="truncate text-gray-900">{anuncio.titulo}</span>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Imagens + Descrição */}
          <div className="space-y-4 lg:col-span-2">
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
              {anuncio.imagens.length > 0 ? (
                <>
                  <div className="relative flex h-80 items-center justify-center overflow-hidden bg-gray-100">
                    <img
                      src={getImageUrl(anuncio.imagens[activeImage]?.url ?? '')}
                      alt={anuncio.titulo}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  {anuncio.imagens.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto p-3">
                      {anuncio.imagens.map((img, i) => (
                        <button
                          key={img.id}
                          type="button"
                          onClick={() => setActiveImage(i)}
                          className={`h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition ${i === activeImage ? 'border-green-600' : 'border-transparent opacity-60 hover:opacity-100'}`}
                        >
                          <img src={getImageUrl(img.url)} alt="" className="h-full w-full object-cover" />
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-80 items-center justify-center bg-gray-100">
                  <svg className="h-16 w-16 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Descrição</h2>
              <p className="mt-3 whitespace-pre-wrap text-gray-700">{anuncio.descricao}</p>
            </div>
          </div>

          {/* Detalhes + Ações */}
          <div className="space-y-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TIPO_COLOR[anuncio.tipo] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {TIPO_LABEL[anuncio.tipo] ?? anuncio.tipo}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLOR[anuncio.status] ?? 'bg-gray-100 text-gray-600'}`}
                >
                  {STATUS_LABEL[anuncio.status] ?? anuncio.status}
                </span>
              </div>

              <h1 className="mt-3 text-xl font-bold text-gray-900">{anuncio.titulo}</h1>

              <dl className="mt-4 space-y-2 text-sm">
                <div className="flex gap-2">
                  <dt className="w-24 flex-shrink-0 text-gray-500">Condição</dt>
                  <dd className="text-gray-900">{CONDICAO_LABEL[anuncio.condicao] ?? anuncio.condicao}</dd>
                </div>
                {anuncio.categoria && (
                  <div className="flex gap-2">
                    <dt className="w-24 flex-shrink-0 text-gray-500">Categoria</dt>
                    <dd className="text-gray-900">{anuncio.categoria.nome}</dd>
                  </div>
                )}
                {anuncio.localizacao && (
                  <div className="flex gap-2">
                    <dt className="w-24 flex-shrink-0 text-gray-500">Localização</dt>
                    <dd className="text-gray-900">{anuncio.localizacao}</dd>
                  </div>
                )}
                {anuncio.cep && (
                  <div className="flex gap-2">
                    <dt className="w-24 flex-shrink-0 text-gray-500">CEP</dt>
                    <dd className="text-gray-900">{anuncio.cep}</dd>
                  </div>
                )}
                <div className="flex gap-2">
                  <dt className="w-24 flex-shrink-0 text-gray-500">Publicado</dt>
                  <dd className="text-gray-900">{formatarData(anuncio.criado_em)}</dd>
                </div>
              </dl>
            </div>

            {/* Anunciante */}
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Anunciante</h2>
              <Link
                href={`/perfil/${anuncio.usuario.id}`}
                className="mt-3 flex items-center gap-3 transition-opacity hover:opacity-75"
              >
                {anuncio.usuario.foto_url ? (
                  <img
                    src={anuncio.usuario.foto_url}
                    alt={anuncio.usuario.nome}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-sm font-semibold text-green-700">
                    {getInitials(anuncio.usuario.nome)}
                  </span>
                )}
                <div>
                  <p className="font-medium text-gray-900">{anuncio.usuario.nome}</p>
                  {anuncio.usuario.localizacao && (
                    <p className="text-xs text-gray-500">{anuncio.usuario.localizacao}</p>
                  )}
                </div>
              </Link>

              {!isOwner && user && (
                <button
                  type="button"
                  onClick={() => void handleStartChat()}
                  disabled={isStartingChat}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
                >
                  <MessageCircle size={16} />
                  {isStartingChat ? 'Abrindo conversa...' : 'Enviar mensagem'}
                </button>
              )}

              {!isOwner && !user && (
                <Link
                  href="/login"
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-green-600 px-4 py-2.5 text-sm font-medium text-green-600 transition hover:bg-green-50"
                >
                  <MessageCircle size={16} />
                  Entre para enviar mensagem
                </Link>
              )}

              {!isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      router.push('/login');
                    } else {
                      setIsReportModalOpen(true);
                    }
                  }}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                >
                  <Flag size={16} />
                  Denunciar anúncio
                </button>
              )}
            </div>

            {/* Gerenciar (dono) */}
            {isOwner && (
              <div className="space-y-3 rounded-2xl bg-white p-5 shadow-sm">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Gerenciar</h2>

                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600" htmlFor="status-select">
                    Status do anúncio
                  </label>
                  <div className="flex gap-2">
                    <select
                      id="status-select"
                      value={novoStatus}
                      onChange={(e) => {
                        setNovoStatus(e.target.value);
                        setStatusFeedback(null);
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
                    >
                      <option value="disponivel">Disponível</option>
                      <option value="reservado">Reservado</option>
                      <option value="doado_trocado">Concluído</option>
                    </select>
                    <Button
                      type="button"
                      variant="outline"
                      isLoading={isSavingStatus}
                      onClick={handleStatusChange}
                      disabled={novoStatus === anuncio.status}
                    >
                      Salvar
                    </Button>
                  </div>
                  {statusFeedback && (
                    <p
                      className={`mt-1 text-xs ${statusFeedback.ok ? 'text-green-600' : 'text-red-600'}`}
                    >
                      {statusFeedback.msg}
                    </p>
                  )}
                </div>

                <Link href={`/anuncios/${anuncio.id}/editar`} className="block">
                  <Button type="button" variant="secondary" className="w-full">
                    Editar anúncio
                  </Button>
                </Link>

                {!showDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                  >
                    Excluir anúncio
                  </button>
                ) : (
                  <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3 text-center">
                    <p className="text-sm text-red-700">Tem certeza? Esta ação não pode ser desfeita.</p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        isLoading={isDeleting}
                        onClick={handleDelete}
                        className="flex-1 bg-red-600 hover:bg-red-700 focus:ring-red-500"
                      >
                        Excluir
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1"
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                )}

                {errorMessage && <p className="text-xs text-red-600">{errorMessage}</p>}
              </div>
            )}
          </div>
        </div>
      </div>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        tipo="anuncio"
        alvoId={anuncio.id}
      />
    </main>
  );
}
