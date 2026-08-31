# Plataforma de Doação e Troca – Backend

Backend da **Plataforma de Doação e Troca** (Unifor), construído com [FastAPI](https://fastapi.tiangolo.com/), [SQLAlchemy](https://www.sqlalchemy.org/) e [Alembic](https://alembic.sqlalchemy.org/), com banco de dados **PostgreSQL**.

## Requisitos

- Python 3.11+
- PostgreSQL 14+
- [uv](https://docs.astral.sh/uv/) (Python package manager)

## Instalação

```bash
# Instalar uv (caso não tenha)
pip install uv

cd backend

# Criar o ambiente virtual e instalar dependências de produção
uv sync

# Incluir dependências de desenvolvimento (pytest, httpx, etc.)
uv sync --group dev

cp .env.example .env        # edite DATABASE_URL e SECRET_KEY
```

## Variáveis de Ambiente

- O backend usa `backend/.env`.
- O arquivo de exemplo é `backend/.env.example`.
- No fluxo com Docker Compose, o serviço `db` e o serviço `backend` carregam o mesmo `backend/.env`.

Variáveis obrigatórias mais comuns:

- `DATABASE_URL`
- `SECRET_KEY`
- `ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `SESSION_COOKIE_NAME`, `SESSION_COOKIE_PATH`, `SESSION_COOKIE_DOMAIN`, `SESSION_COOKIE_SAMESITE`, `SESSION_COOKIE_SECURE`
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` (usadas pelo serviço de banco no Compose)
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_TLS` (opcionais)
- `FRONTEND_URL`

## Banco de dados

```bash
# Criar o banco no PostgreSQL
createdb recircula_db

# Executar as migrações (Alembic)
uv run alembic upgrade head

# Criar nova migração após alterar modelos
uv run alembic revision --autogenerate -m "descricao da mudança"
```

## Executar

```bash
uv run uvicorn app.asgi:socket_app --reload --host 0.0.0.0 --port 8000
```

## Executar com Docker Compose

Na raiz do repositório:

```bash
docker compose up --build
```

Observação:

- O projeto não depende mais de `.env` na raiz para subir os serviços.

## Testes

```bash
uv run pytest
```

## Documentação

Após iniciar o servidor, acesse:

| Interface     | URL                              |
|---------------|----------------------------------|
| Swagger UI    | http://localhost:8000/docs       |
| ReDoc         | http://localhost:8000/redoc      |
| OpenAPI JSON  | http://localhost:8000/openapi.json |

## Endpoints disponíveis

| Recurso                | Prefixo         | Descrição                                |
|------------------------|-----------------|------------------------------------------|
| Autenticação           | `/auth`         | Cadastro, login (JWT Bearer)             |
| Usuários               | `/usuarios`     | Perfil, edição de dados                  |
| Anúncios               | `/anuncios`     | CRUD completo, busca e filtros           |
| Categorias             | `/categorias`   | Gestão de categorias (admin)             |
| Mensagens              | `/mensagens`    | Conversas internas entre usuários        |
| Administração          | `/admin`        | Moderação de denúncias e ações admin     |
| Denúncias/Moderação    | `/denuncias`    | Denunciar e resolver conteúdo inadequado |

## Requisitos funcionais cobertos

| RF  | Descrição                              | Endpoint(s)                        |
|-----|----------------------------------------|------------------------------------|
| RF01| Cadastro, login e sessão               | `POST /auth/registrar`, `POST /auth/login` |
| RF02| Perfil do usuário                      | `GET /usuarios/{id}`, `PATCH /usuarios/me`, `GET /usuarios/me`, `PUT /usuarios/me` |
| RF03| Criação e gestão de anúncios           | `POST /anuncios`, `PUT /anuncios/{id}` |
| RF04| Busca e filtragem                      | `GET /anuncios?q=&categoria_id=&cep=` |
| RF05| Mensagens internas                     | `POST /mensagens/conversas`, `GET /mensagens/conversas` |
| RF06| Gestão de status dos itens             | `PATCH /anuncios/{id}/status` |
| RF07| Moderação e denúncias                  | `POST /denuncias`, `PATCH /admin/denuncias/{id}/resolver` (`/denuncias/{id}/resolver` legado/depreciado) |

## Moderação

para tornar alguem moderador você pode rodar o comando abaixo no terminal da sua máquina para atualizar o usuário pelo e-mail:

```bash
docker compose exec -T db psql -U postgres -d recircula_db -c "UPDATE usuarios SET is_admin = true WHERE email = 'SEU_EMAIL_AQUI';"
```

> **Nota**: Substitua 'SEU_EMAIL_AQUI' pelo e-mail que você usou para se cadastrar no site (ex: 'admin@example.com').