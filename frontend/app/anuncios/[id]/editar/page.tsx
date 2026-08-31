'use client';

import { AxiosError } from 'axios';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import Button from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import api, { API_BASE_URL } from '@/services/api';

function getImageUrl(url: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
}

interface Categoria {
  id: number;
  nome: string;
}

interface ImagemExistente {
  id: number;
  url: string;
  content_type: string;
  ordem: number;
}

interface AnuncioCarregado {
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
  imagens: ImagemExistente[];
}

const CONDICAO_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'seminovo', label: 'Seminovo' },
  { value: 'usado', label: 'Usado' },
  { value: 'para_reparo', label: 'Para reparo' },
];

const MAX_IMAGES = 3;
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif';

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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

export default function EditarAnuncioPage() {
  const params = useParams<{ id: string }>();
  const anuncioId = Number(params?.id ?? NaN);
  const router = useRouter();
  const { user, isAuthenticated } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [anuncioOriginal, setAnuncioOriginal] = useState<AnuncioCarregado | null>(null);
  const [categorias, setCategorias] = useState<Categoria[]>([]);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tipoDoacao, setTipoDoacao] = useState(true);
  const [tipoTroca, setTipoTroca] = useState(false);
  const [condicao, setCondicao] = useState('usado');
  const [categoriaId, setCategoriaId] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [cep, setCep] = useState('');

  const [imagensExistentes, setImagensExistentes] = useState<ImagemExistente[]>([]);
  const [novasImagens, setNovasImagens] = useState<File[]>([]);
  const [novasPreviews, setNovasPreviews] = useState<string[]>([]);

  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isAuthenticated) {
      router.replace('/login');
      return;
    }
    if (Number.isNaN(anuncioId) || anuncioId <= 0) {
      router.replace('/anuncios');
      return;
    }

    async function carregar() {
      try {
        const [anuncioRes, catRes] = await Promise.all([
          api.get<AnuncioCarregado>(`/anuncios/${anuncioId}`),
          api.get<Categoria[]>('/categorias/'),
        ]);
        const a = anuncioRes.data;

        if (user?.id !== a.usuario_id) {
          router.replace(`/anuncios/${anuncioId}`);
          return;
        }

        setAnuncioOriginal(a);
        setTitulo(a.titulo);
        setDescricao(a.descricao);
        setTipoDoacao(a.tipo === 'doacao' || a.tipo === 'ambos');
        setTipoTroca(a.tipo === 'troca' || a.tipo === 'ambos');
        setCondicao(a.condicao);
        setCategoriaId(a.categoria_id ? String(a.categoria_id) : '');
        setLocalizacao(a.localizacao ?? '');
        setCep(a.cep ?? '');
        setImagensExistentes(a.imagens);
        setCategorias(catRes.data);
      } catch {
        setErrorMessage('Não foi possível carregar o anúncio.');
      } finally {
        setLoading(false);
      }
    }

    void carregar();
  }, [anuncioId, isAuthenticated, router, user?.id]);

  useEffect(() => {
    const urls = novasImagens.map((f) => URL.createObjectURL(f));
    setNovasPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [novasImagens]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    const combined = [...novasImagens, ...selected].slice(0, MAX_IMAGES);
    setNovasImagens(combined);
    e.target.value = '';
  }

  function removeNovaImagem(index: number) {
    setNovasImagens((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage('');

    if (!tipoDoacao && !tipoTroca) {
      setErrorMessage('Selecione ao menos um tipo: Doação ou Troca.');
      return;
    }

    const tipo = tipoDoacao && tipoTroca ? 'ambos' : tipoDoacao ? 'doacao' : 'troca';

    const fd = new FormData();
    fd.append('titulo', titulo.trim());
    fd.append('descricao', descricao.trim());
    fd.append('tipo', tipo);
    fd.append('condicao', condicao);
    if (categoriaId) fd.append('categoria_id', categoriaId);
    if (localizacao.trim()) fd.append('localizacao', localizacao.trim());
    if (cep.trim()) fd.append('cep', cep.trim());
    novasImagens.forEach((file) => fd.append('imagens', file));

    setIsSubmitting(true);
    try {
      await api.put(`/anuncios/${anuncioId}`, fd, {
        headers: { 'Content-Type': undefined },
      });
      router.push(`/anuncios/${anuncioId}`);
    } catch (error) {
      setErrorMessage(getApiError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100';
  const labelClass = 'mb-1 block text-sm font-medium text-gray-700';

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 px-4 py-8">
        <div className="flex items-center justify-center py-16">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
        </div>
      </main>
    );
  }

  if (errorMessage && !anuncioOriginal) {
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <nav className="mb-2 flex items-center gap-2 text-sm text-gray-500">
            <Link href="/anuncios" className="hover:text-green-600">
              Anúncios
            </Link>
            <span>/</span>
            <Link href={`/anuncios/${anuncioId}`} className="truncate hover:text-green-600">
              {anuncioOriginal?.titulo}
            </Link>
            <span>/</span>
            <span className="text-gray-900">Editar</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Editar Anúncio</h1>
        </header>

        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className={labelClass} htmlFor="titulo">
                Título <span className="text-red-500">*</span>
              </label>
              <input
                id="titulo"
                type="text"
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                minLength={3}
                maxLength={200}
                required
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass} htmlFor="descricao">
                Descrição <span className="text-red-500">*</span>
              </label>
              <textarea
                id="descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                minLength={10}
                required
                rows={4}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className={labelClass}>
                  Tipo <span className="text-red-500">*</span>
                </span>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setTipoDoacao((v) => !v)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      tipoDoacao
                        ? 'border-green-600 bg-green-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-green-400 hover:text-green-600'
                    }`}
                  >
                    Doação
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoTroca((v) => !v)}
                    className={`flex-1 rounded-lg border py-2 text-sm font-medium transition-colors ${
                      tipoTroca
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'
                    }`}
                  >
                    Troca
                  </button>
                </div>
              </div>

              <div>
                <label className={`${labelClass} mb-2`} htmlFor="condicao">
                  Condição <span className="text-red-500">*</span>
                </label>
                <select
                  id="condicao"
                  value={condicao}
                  onChange={(e) => setCondicao(e.target.value)}
                  className={inputClass}
                >
                  {CONDICAO_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="categoria">
                Categoria
              </label>
              <select
                id="categoria"
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className={inputClass}
              >
                <option value="">Sem categoria</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={String(cat.id)}>
                    {cat.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass} htmlFor="localizacao">
                  Localização
                </label>
                <input
                  id="localizacao"
                  type="text"
                  value={localizacao}
                  onChange={(e) => setLocalizacao(e.target.value)}
                  maxLength={255}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass} htmlFor="cep">
                  CEP
                </label>
                <input
                  id="cep"
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(formatCepInput(e.target.value))}
                  maxLength={9}
                  placeholder="00000-000"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>
                Imagens{' '}
                <span className="text-gray-400 font-normal">(até {MAX_IMAGES} — JPEG, PNG ou GIF)</span>
              </label>

              {novasImagens.length === 0 && imagensExistentes.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs text-gray-500">Imagens atuais:</p>
                  <div className="flex flex-wrap gap-3">
                    {imagensExistentes.map((img) => (
                      <img
                        key={img.id}
                        src={getImageUrl(img.url)}
                        alt="Imagem atual"
                        className="h-24 w-24 rounded-lg border border-gray-200 object-cover"
                      />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-gray-400">
                    Para substituir, selecione novas imagens abaixo.
                  </p>
                </div>
              )}

              {novasImagens.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs text-gray-500">Novas imagens (substituirão as atuais):</p>
                  <div className="flex flex-wrap gap-3">
                    {novasPreviews.map((src, i) => (
                      <div key={i} className="relative">
                        <img
                          src={src}
                          alt={`Nova imagem ${i + 1}`}
                          className="h-24 w-24 rounded-lg border border-green-200 object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeNovaImagem(i)}
                          aria-label="Remover imagem"
                          className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow hover:bg-red-600"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {novasImagens.length < MAX_IMAGES && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_TYPES}
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 rounded-lg border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500 transition hover:border-green-400 hover:text-green-600"
                  >
                    + {novasImagens.length === 0 ? 'Substituir imagens' : 'Adicionar imagem'}
                    {novasImagens.length > 0 && (
                      <span className="text-gray-400">({novasImagens.length}/{MAX_IMAGES})</span>
                    )}
                  </button>
                </>
              )}
            </div>

            {errorMessage && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" isLoading={isSubmitting} className="flex-1">
                Salvar alterações
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
