'use client';

import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Button from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import api, { API_BASE_URL } from '@/services/api';

// ── helpers ──────────────────────────────────────────────────────────────────

function getImageUrl(url: string): string {
  if (!url) return '';
  return url.startsWith('http') ? url : `${API_BASE_URL}${url}`;
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

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

// ── tipos ─────────────────────────────────────────────────────────────────────

interface AnuncioImagem {
  id: number;
  url: string;
  ordem: number;
}
interface AnuncioCategoria {
  id: number;
  nome: string;
}
interface AnuncioUsuario {
  id: number;
  nome: string;
  foto_url: string | null;
}

interface Anuncio {
  id: number;
  titulo: string;
  tipo: 'doacao' | 'troca' | 'ambos';
  condicao: string;
  status: string;
  localizacao: string | null;
  cep: string | null;
  criado_em: string;
  imagens: AnuncioImagem[];
  categoria: AnuncioCategoria | null;
  usuario: AnuncioUsuario;
}

interface Categoria {
  id: number;
  nome: string;
}

// ── constantes ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 12;

const TIPO_LABEL: Record<string, string> = {
  doacao: 'Doação',
  troca: 'Troca',
  ambos: 'Doação e Troca',
};
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
  disponivel: 'bg-emerald-50 text-emerald-700',
  reservado: 'bg-amber-50 text-amber-700',
  doado_trocado: 'bg-gray-100 text-gray-500',
};
const RAIO_LABEL: Record<string, string> = {
  '5': '5 km',
  '10': '10 km',
  '25': '25 km',
  '50': '50 km',
};

const ORDENAR_OPTIONS = [
  { value: 'recente', label: 'Mais recentes' },
  { value: 'antigo', label: 'Mais antigos' },
  { value: 'proximo', label: 'Mais próximos' },
] as const;

const STATUS_OPTIONS = [
  { value: '', label: 'Disponíveis e reservados' },
  { value: 'disponivel', label: 'Disponível' },
  { value: 'reservado', label: 'Reservado' },
] as const;

// ── AnuncioCard ───────────────────────────────────────────────────────────────

function AnuncioCard({ anuncio }: { anuncio: Anuncio }) {
  const primeiraImagem = anuncio.imagens[0]?.url ? getImageUrl(anuncio.imagens[0].url) : null;

  return (
    <article className="min-w-[272px] max-w-[272px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="relative h-44 w-full overflow-hidden bg-gray-100">
        {primeiraImagem ? (
          <img src={primeiraImagem} alt={anuncio.titulo} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg
              className="h-12 w-12 text-gray-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          </div>
        )}
        <span
          className={`absolute right-2 top-2 rounded-full px-2 py-0.5 text-xs font-bold ${TIPO_COLOR[anuncio.tipo] ?? 'bg-gray-100 text-gray-600'}`}
        >
          {TIPO_LABEL[anuncio.tipo] ?? anuncio.tipo}
        </span>
      </div>

      <div className="p-4">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900">{anuncio.titulo}</h3>
        <div className="mt-2 flex flex-wrap gap-1">
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[anuncio.status] ?? 'bg-gray-100 text-gray-600'}`}
          >
            {STATUS_LABEL[anuncio.status] ?? anuncio.status}
          </span>
          {anuncio.categoria && (
            <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
              {anuncio.categoria.nome}
            </span>
          )}
        </div>
        <p className="mt-2 truncate text-xs text-gray-500">
          {anuncio.localizacao ?? 'Localização não informada'}
        </p>
        <p className="mt-1 truncate text-xs text-gray-500">por {anuncio.usuario.nome}</p>
        <p className="mt-1 text-xs text-gray-400">{formatarData(anuncio.criado_em)}</p>
      </div>
    </article>
  );
}

// ── Paginação ─────────────────────────────────────────────────────────────────

function Paginacao({
  page,
  hasMore,
  onPrev,
  onNext,
}: {
  page: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={page === 1}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        ← Anterior
      </button>
      <span className="text-sm text-gray-500">Página {page}</span>
      <button
        type="button"
        onClick={onNext}
        disabled={!hasMore}
        className="flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
      >
        Próxima →
      </button>
    </div>
  );
}

// ── AnunciosPage ──────────────────────────────────────────────────────────────

export default function AnunciosPage() {
  const { isAuthenticated } = useAuth();

  const carouselRef = useRef<HTMLDivElement>(null);
  const [anuncios, setAnuncios] = useState<Anuncio[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  // filtros
  const [q, setQ] = useState('');
  const [filtroDoacao, setFiltroDoacao] = useState(false);
  const [filtroTroca, setFiltroTroca] = useState(false);
  const [categoriaId, setCategoriaId] = useState('');
  const [status, setStatus] = useState('');
  const [cep, setCep] = useState('');
  const [raio, setRaio] = useState('5');
  const [ordenar, setOrdenar] = useState<'recente' | 'antigo' | 'proximo'>('recente');

  // filtros aplicados (para re-busca ao mudar página)
  const [filtrosAtivos, setFiltrosAtivos] = useState<Record<string, string>>({});

  const cepCompleto = cep.replace(/\D/g, '').length === 8;

  const fetchAnuncios = useCallback(async (filtros: Record<string, string>, targetPage: number) => {
    setLoading(true);
    setErrorMessage('');
    try {
      const sp = new URLSearchParams();
      if (filtros.q) sp.set('q', filtros.q);
      if (filtros.tipo) sp.set('tipo', filtros.tipo);
      if (filtros.categoria_id) sp.set('categoria_id', filtros.categoria_id);
      if (filtros.status) sp.set('status', filtros.status);

      // CEP e raio: enviar CEP completo + raio_km
      const cepDigits = (filtros.cep ?? '').replace(/\D/g, '');
      if (cepDigits) {
        sp.set('cep', cepDigits); // CEP completo com 8 dígitos
        if (filtros.raio) sp.set('raio_km', filtros.raio); // Raio em km
      }

      sp.set('ordenar', filtros.ordenar ?? 'recente');

      // Busca PAGE_SIZE + 1 para detectar se há próxima página
      sp.set('limit', String(PAGE_SIZE + 1));
      sp.set('offset', String((targetPage - 1) * PAGE_SIZE));

      const { data } = await api.get<Anuncio[]>(`/anuncios/?${sp.toString()}`);

      const temMais = data.length > PAGE_SIZE;
      const resultado = temMais ? data.slice(0, PAGE_SIZE) : data;

      setAnuncios(resultado);
      setHasMore(temMais);
      setPage(targetPage);
    } catch {
      setErrorMessage('Não foi possível carregar os anúncios.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const inicial = { ordenar: 'recente' };
    setFiltrosAtivos(inicial);
    void fetchAnuncios(inicial, 1);
    api
      .get<Categoria[]>('/categorias/')
      .then(({ data }) => setCategorias(data))
      .catch(() => {});
  }, [fetchAnuncios]);

  function handleSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const ambos = filtroDoacao === filtroTroca;
    const tipo = ambos ? '' : filtroDoacao ? 'doacao' : 'troca';
    const novos: Record<string, string> = {};
    if (q.trim()) novos.q = q.trim();
    if (tipo) novos.tipo = tipo;
    if (categoriaId) novos.categoria_id = categoriaId;
    if (status) novos.status = status;
    if (cep) novos.cep = cep;
    if (cep) novos.raio = raio;
    novos.ordenar = ordenar;
    setFiltrosAtivos(novos);
    void fetchAnuncios(novos, 1);
  }

  function irParaPagina(nova: number) {
    void fetchAnuncios(filtrosAtivos, nova);
  }

  function scrollCarousel(direction: 'left' | 'right') {
    carouselRef.current?.scrollBy({ left: direction === 'left' ? -600 : 600, behavior: 'smooth' });
  }

  function limparFiltros() {
    setQ('');
    setFiltroDoacao(false);
    setFiltroTroca(false);
    setCategoriaId('');
    setStatus('');
    setCep('');
    setOrdenar('recente');
    const inicial = { ordenar: 'recente' };
    setFiltrosAtivos(inicial);
    void fetchAnuncios(inicial, 1);
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100';
  const labelClass = 'mb-1 block text-xs font-medium text-gray-600';

  const activeFilters: { label: string; onRemove: () => void }[] = [
    ...(filtroDoacao ? [{ label: 'Doação', onRemove: () => setFiltroDoacao(false) }] : []),
    ...(filtroTroca ? [{ label: 'Troca', onRemove: () => setFiltroTroca(false) }] : []),
    ...(categoriaId
      ? [
          {
            label: categorias.find((c) => String(c.id) === categoriaId)?.nome ?? 'Categoria',
            onRemove: () => setCategoriaId(''),
          },
        ]
      : []),
    ...(status
      ? [
          {
            label: STATUS_OPTIONS.find((s) => s.value === status)?.label ?? status,
            onRemove: () => setStatus(''),
          },
        ]
      : []),
    ...(cep && cepCompleto
      ? [{ label: `CEP ${cep} • ${RAIO_LABEL[raio] ?? raio}`, onRemove: () => setCep('') }]
      : []),
    ...(ordenar !== 'recente'
      ? [
          {
            label: ORDENAR_OPTIONS.find((o) => o.value === ordenar)?.label ?? '',
            onRemove: () => setOrdenar('recente'),
          },
        ]
      : []),
  ];

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Cabeçalho */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Anúncios</h1>
            <p className="mt-1 text-sm text-gray-500">
              Encontre itens para doação ou troca perto de você.
            </p>
          </div>
          <div className="flex gap-2">
            {isAuthenticated && (
              <Link href="/anuncios/meus">
                <Button variant="outline" type="button">
                  Meus Anúncios
                </Button>
              </Link>
            )}
            {isAuthenticated ? (
              <Link href="/anuncios/novo">
                <Button type="button">
                  <PlusIcon className="mr-2 h-5 w-5" /> Criar Anúncio
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button type="button">Entrar para anunciar</Button>
              </Link>
            )}
          </div>
        </header>

        {/* Filtros */}
        <section className="rounded-2xl border bg-white p-4 shadow-sm">
          <form onSubmit={handleSearch} className="flex flex-col gap-3">

            {/* Linha 1 — busca + tipo + botão */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className={labelClass} htmlFor="q">Busca</label>
                <input
                  id="q"
                  type="text"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Título ou descrição..."
                  className={inputClass}
                />
              </div>

              <div className="shrink-0">
                <span className={labelClass}>Tipo</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setFiltroDoacao((v) => !v)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${filtroDoacao ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-green-400 hover:text-green-600'}`}
                  >
                    Doação
                  </button>
                  <button
                    type="button"
                    onClick={() => setFiltroTroca((v) => !v)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${filtroTroca ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-blue-400 hover:text-blue-600'}`}
                  >
                    Troca
                  </button>
                </div>
              </div>

              <Button type="submit" isLoading={loading} className="w-full sm:w-auto shrink-0">
                Buscar
              </Button>
            </div>

            {/* Linha 2 — filtros secundários distribuídos */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {/* Categoria */}
              <div>
                <label className={labelClass} htmlFor="categoria">Categoria</label>
                <select
                  id="categoria"
                  value={categoriaId}
                  onChange={(e) => setCategoriaId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">Todas</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={String(cat.id)}>{cat.nome}</option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div>
                <label className={labelClass} htmlFor="status">Status</label>
                <select
                  id="status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className={inputClass}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* CEP */}
              <div>
                <label className={labelClass} htmlFor="cep">CEP</label>
                <input
                  id="cep"
                  type="text"
                  value={cep}
                  onChange={(e) => setCep(formatCepInput(e.target.value))}
                  placeholder="00000-000"
                  maxLength={9}
                  className={inputClass}
                />
              </div>

              {/* Raio */}
              <div>
                <label className={labelClass} htmlFor="raio">Raio</label>
                <select
                  id="raio"
                  value={raio}
                  onChange={(e) => setRaio(e.target.value)}
                  disabled={!cepCompleto}
                  className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  <option value="5">5 km</option>
                  <option value="10">10 km</option>
                  <option value="25">25 km</option>
                  <option value="50">50 km</option>
                </select>
              </div>

              {/* Ordenar */}
              <div>
                <label className={labelClass} htmlFor="ordenar">Ordenar por</label>
                <select
                  id="ordenar"
                  value={ordenar}
                  onChange={(e) => setOrdenar(e.target.value as typeof ordenar)}
                  className={inputClass}
                >
                  {ORDENAR_OPTIONS.map((opt) => (
                    <option
                      key={opt.value}
                      value={opt.value}
                      disabled={opt.value === 'proximo' && !cepCompleto}
                    >
                      {opt.label}{opt.value === 'proximo' && !cepCompleto ? ' (requer CEP)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </form>

          {/* Chips de filtros ativos */}
          {activeFilters.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <span className="text-xs text-gray-400">Filtros ativos:</span>
              {activeFilters.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700"
                >
                  {f.label}
                  <button
                    type="button"
                    onClick={f.onRemove}
                    aria-label={`Remover ${f.label}`}
                    className="ml-0.5 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={limparFiltros}
                className="text-xs text-red-400 hover:text-red-600 hover:underline"
              >
                Limpar tudo
              </button>
            </div>
          )}
        </section>

        {/* Feed */}
        <section className="space-y-6">
          {errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{errorMessage}</p>
          ) : loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-green-600 border-t-transparent" />
            </div>
          ) : anuncios.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl bg-white py-16 shadow-sm">
              <p className="text-gray-500">Nenhum anúncio encontrado.</p>
              {isAuthenticated && (
                <Link href="/anuncios/novo" className="mt-4">
                  <Button type="button">Criar o primeiro anúncio</Button>
                </Link>
              )}
            </div>
          ) : (
            <>
              <div className="relative px-6">
                <button
                  type="button"
                  onClick={() => scrollCarousel('left')}
                  aria-label="Rolar para a esquerda"
                  className="absolute left-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <svg
                    className="h-5 w-5 text-gray-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>

                <div
                  ref={carouselRef}
                  className="flex gap-4 overflow-x-auto pb-4"
                  style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                  {anuncios.map((anuncio) => (
                    <Link
                      key={anuncio.id}
                      href={`/anuncios/${anuncio.id}`}
                      className="focus:outline-none"
                    >
                      <AnuncioCard anuncio={anuncio} />
                    </Link>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => scrollCarousel('right')}
                  aria-label="Rolar para a direita"
                  className="absolute right-0 top-1/2 z-10 -translate-y-1/2 rounded-full bg-white p-2 shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <svg
                    className="h-5 w-5 text-gray-700"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>

              <Paginacao
                page={page}
                hasMore={hasMore}
                onPrev={() => irParaPagina(page - 1)}
                onNext={() => irParaPagina(page + 1)}
              />

              <p className="text-center text-xs text-gray-400">
                Página {page} — {anuncios.length} anúncio(s)
                {hasMore ? ' (há mais resultados)' : ''}
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
