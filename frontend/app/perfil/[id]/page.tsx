'use client';

import { AxiosError } from 'axios';
import { useParams, useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import Button from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/services/api';
import { motion } from 'framer-motion';
import { Flag } from 'lucide-react';
import ReportModal from '@/components/ReportModal';

interface PerfilAnuncio {
  id: number;
  titulo: string;
  tipo: string;
  status: string;
  criado_em: string;
}

interface PerfilPublico {
  id: number;
  nome: string;
  foto_url: string | null;
  localizacao: string | null;
  bio: string | null;
  anuncios_publicados: PerfilAnuncio[];
}

interface PerfilAtualizado {
  id: number;
  nome: string;
  foto_url: string | null;
  localizacao: string | null;
  bio: string | null;
}

const EMPTY_PREVIEW = '';
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_SIZE_MB = MAX_IMAGE_SIZE_BYTES / (1024 * 1024);
const CEP_FORMAT = '00000-000';
const CEP_PATTERN = /^\d{5}-\d{3}$/;

const Sparkle = ({ style }: { style?: React.CSSProperties }) => (
  <motion.span
    style={{ position: 'absolute', pointerEvents: 'none', ...style }}
    animate={{
      opacity: [0, 1, 0],
      scale: [0.5, 0.8, 0.5],
      y: [0, -8, 0],
    }}
    transition={{
      duration: 1.8,
      repeat: Infinity,
      ease: 'easeInOut',
    }}
  >
    ✨
  </motion.span>
);

function getApiErrorMessage(error: unknown): string | undefined {
  return error instanceof AxiosError
    ? (error.response?.data as { detail?: string } | undefined)?.detail
    : undefined;
}

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function formatarData(dataISO: string): string {
  const data = new Date(dataISO);
  if (Number.isNaN(data.getTime())) return dataISO;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(data);
}

function getInitials(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'U';
  return partes
    .slice(0, 2)
    .map((parte) => parte[0]?.toUpperCase() ?? '')
    .join('');
}

export default function PerfilPage() {
  const params = useParams<{ id: string }>();
  const perfilId = Number(params?.id ?? NaN);
  const router = useRouter();
  const { user } = useAuth();

  const [perfil, setPerfil] = useState<PerfilPublico | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const [bio, setBio] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [fotoFile, setFotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState(EMPTY_PREVIEW);

  const isOwner = user?.id === perfil?.id;

  useEffect(() => {
    if (Number.isNaN(perfilId) || perfilId <= 0) {
      setLoading(false);
      setErrorMessage('Perfil inválido.');
      return;
    }

    async function carregarPerfil() {
      setLoading(true);
      setErrorMessage('');
      setSuccessMessage('');

      try {
        const { data } = await api.get<PerfilPublico>(`/usuarios/${perfilId}`);
        setPerfil(data);
        setBio(data.bio ?? '');
        setLocalizacao(data.localizacao ?? '');
      } catch (error) {
        setErrorMessage(getApiErrorMessage(error) ?? 'Não foi possível carregar o perfil.');
      } finally {
        setLoading(false);
      }
    }

    void carregarPerfil();
  }, [perfilId]);

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const fotoExibicao = useMemo(
    () => previewUrl || perfil?.foto_url || '',
    [perfil?.foto_url, previewUrl],
  );

  function handleFotoChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setErrorMessage('');

    if (previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    if (!file) {
      setFotoFile(null);
      setPreviewUrl(EMPTY_PREVIEW);
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setFotoFile(null);
      setPreviewUrl(EMPTY_PREVIEW);
      setErrorMessage(`A foto deve ter no máximo ${MAX_IMAGE_SIZE_MB}MB.`);
      event.target.value = '';
      return;
    }

    setFotoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSalvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner || !perfil) return;

    setErrorMessage('');
    setSuccessMessage('');

    const localizacaoNormalizada = formatCepInput(localizacao);
    if (localizacaoNormalizada && !CEP_PATTERN.test(localizacaoNormalizada)) {
      setErrorMessage(`Informe um CEP válido no formato ${CEP_FORMAT}.`);
      return;
    }

    setIsSaving(true);

    try {
      const formData = new FormData();
      if (fotoFile) {
        formData.append('foto', fotoFile);
      }
      formData.append('bio', bio);
      formData.append('localizacao', localizacaoNormalizada);

      const { data } = await api.patch<PerfilAtualizado>('/usuarios/me', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setPerfil((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          foto_url: data.foto_url,
          localizacao: data.localizacao,
          bio: data.bio,
        };
      });

      setFotoFile(null);
      if (previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(EMPTY_PREVIEW);

      setIsEditing(false);
      setSuccessMessage('Perfil atualizado com sucesso.');
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error) ?? 'Não foi possível salvar as alterações.');
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <section className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-600">Carregando perfil...</p>
        </section>
      </main>
    );
  }

  if (errorMessage && !perfil) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <section className="mx-auto w-full max-w-4xl rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-red-600">{errorMessage}</p>
        </section>
      </main>
    );
  }

  if (!perfil) return null;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <article className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {fotoExibicao ? (
                <img
                  src={fotoExibicao}
                  alt={`Foto de perfil de ${perfil.nome}`}
                  className="h-20 w-20 rounded-full border border-gray-200 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-xl font-semibold text-green-700">
                  {getInitials(perfil.nome)}
                </div>
              )}

              <div>
                <div className="relative inline-block">
                  <motion.h1
                    className="text-2xl font-semibold text-green-400"
                    animate={{
                      scale: [1, 1.02, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                  >
                    {perfil.nome}
                  </motion.h1>

                  <Sparkle style={{ top: -10, left: -10 }} />
                  <Sparkle style={{ top: 0, right: -15 }} />
                  <Sparkle style={{ bottom: -10, left: 10 }} />
                </div>

                <p className="mt-1 text-sm text-gray-600">
                  Localização (CEP): {perfil.localizacao?.trim() || 'Não informada'}
                </p>
              </div>
            </div>

            {isOwner && !isEditing ? (
              <Button type="button" onClick={() => setIsEditing(true)}>
                Editar Perfil
              </Button>
            ) : null}

            {!isOwner ? (
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    router.push('/login');
                  } else {
                    setIsReportModalOpen(true);
                  }
                }}
                className="inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 gap-2"
              >
                <Flag size={15} />
                Denunciar
              </button>
            ) : null}
          </div>

          <div className="mt-5">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">Bio</h2>
            <p className="mt-2 whitespace-pre-wrap text-gray-700">
              {perfil.bio?.trim() || 'Nenhuma bio informada.'}
            </p>
          </div>
        </article>

        {isOwner && isEditing ? (
          <article className="rounded-2xl bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Editar perfil</h2>

            <form className="mt-4 space-y-4" onSubmit={handleSalvar}>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="foto">
                  Foto de perfil
                </label>
                <input
                  id="foto"
                  name="foto"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFotoChange}
                  className="block w-full text-sm text-gray-700 file:mr-4 file:rounded-lg file:border-0 file:bg-green-50 file:px-4 file:py-2 file:font-medium file:text-green-700 hover:file:bg-green-100"
                />
                {previewUrl ? (
                  <p className="mt-1 text-xs text-gray-500">Preview atualizado da nova foto.</p>
                ) : null}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="bio">
                  Bio
                </label>
                <textarea
                  id="bio"
                  name="bio"
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  placeholder="Conte um pouco sobre você"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="cep">
                  Localização (CEP)
                </label>
                <input
                  id="cep"
                  name="cep"
                  type="text"
                  value={localizacao}
                  onChange={(event) => setLocalizacao(formatCepInput(event.target.value))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100"
                  placeholder={CEP_FORMAT}
                  maxLength={9}
                />
              </div>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button type="submit" isLoading={isSaving}>
                  Salvar alterações
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setIsEditing(false);
                    setBio(perfil.bio ?? '');
                    setLocalizacao(perfil.localizacao ?? '');
                    setFotoFile(null);
                    if (previewUrl.startsWith('blob:')) {
                      URL.revokeObjectURL(previewUrl);
                    }
                    setPreviewUrl(EMPTY_PREVIEW);
                    setErrorMessage('');
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </article>
        ) : null}

        {errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
        ) : null}
        {successMessage ? (
          <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            {successMessage}
          </p>
        ) : null}

        <article className="rounded-2xl bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Histórico de anúncios</h2>
          {perfil.anuncios_publicados.length ? (
            <ul className="mt-4 space-y-3">
              {perfil.anuncios_publicados.map((anuncio) => (
                <li key={anuncio.id} className="rounded-lg border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-900">{anuncio.titulo}</p>
                  <p className="mt-1 text-xs text-gray-600">
                    Tipo: {anuncio.tipo} · Status: {anuncio.status} · Publicado em{' '}
                    {formatarData(anuncio.criado_em)}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-gray-600">
              Este usuário ainda não possui anúncios publicados.
            </p>
          )}
        </article>
      </section>

      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        tipo="usuario"
        alvoId={perfil.id}
      />
    </main>
  );
}
