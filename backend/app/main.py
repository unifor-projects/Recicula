from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routers import auth, usuarios, anuncios, categorias, mensagens, denuncias, admin, chat

app = FastAPI(
    title="Plataforma de Doação e Troca – API",
    description=(
        "API da **Plataforma de Doação e Troca** – sistema para conectar doadores a pessoas "
        "que necessitam de bens, promovendo sustentabilidade e impacto social.\n\n"
        "A documentação interativa (Swagger UI) está disponível em `/docs` e ReDoc em `/redoc`."
    ),
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads (static files)
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")

# Routers
app.include_router(auth.router)
app.include_router(usuarios.router)
app.include_router(anuncios.router)
app.include_router(categorias.router)
app.include_router(mensagens.router)
app.include_router(denuncias.router)
app.include_router(admin.router)
app.include_router(chat.router)


@app.get("/", tags=["Health"], summary="Health check")
def health_check():
    return {"status": "ok", "message": "Plataforma de Doação e Troca – API funcionando!"}
