from typing import List, Optional
from uuid import uuid4
import math

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models.usuario import Usuario
from app.models.anuncio import Anuncio, AnuncioImagem, StatusHistorico, StatusAnuncio, TipoAnuncio, CondicaoItem
from app.schemas.anuncio import (
    AnuncioResponse,
    AnuncioListResponse,
    AnuncioStatusUpdate,
    StatusHistoricoResponse,
)
from app.services.geocode import geocode_cep, haversine_km
from app.services.uploads import ANUNCIO_IMAGES_DIR, delete_image_files

router = APIRouter(prefix="/anuncios", tags=["Anúncios"])

_ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif"}
_MAX_IMAGE_BYTES = 10 * 1024 * 1024  # 10 MB
_MAX_IMAGES = 3

# Geo constants
_KM_PER_DEGREE_LAT = 111.0  # approximate km per degree of latitude at the equator
_COS_ZERO_GUARD = 1e-6  # prevents division by zero near the poles

_load_options = [
    selectinload(Anuncio.imagens),
    selectinload(Anuncio.categoria),
    selectinload(Anuncio.usuario),
]


def _get_anuncio_or_404(anuncio_id: int, db: Session) -> Anuncio:
    anuncio = (
        db.query(Anuncio)
        .options(*_load_options)
        .filter(Anuncio.id == anuncio_id)
        .first()
    )
    if not anuncio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anúncio não encontrado")
    return anuncio


def _save_image(file: UploadFile) -> tuple[str, str]:
    """Valida, salva e retorna (url_relativa, content_type)."""
    if file.content_type not in _ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato não suportado: '{file.content_type}'. Use JPEG, PNG ou GIF.",
        )
    data = file.file.read()
    if not data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Arquivo de imagem vazio.",
        )
    if len(data) > _MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Arquivo excede o limite de 10 MB.",
        )
    ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif"}
    filename = f"{uuid4().hex}{ext_map[file.content_type]}"
    (ANUNCIO_IMAGES_DIR / filename).write_bytes(data)
    return f"/uploads/anuncios/{filename}", file.content_type


@router.get("/", response_model=List[AnuncioListResponse], summary="Buscar e listar anúncios")
async def listar_anuncios(
    q: Optional[str] = Query(None, description="Busca por título ou descrição"),
    categoria_id: Optional[int] = Query(None),
    tipo: Optional[str] = Query(None, description="doacao | troca"),
    cep: Optional[str] = Query(None, description="Filtrar por CEP"),
    raio_km: Optional[float] = Query(None, ge=0.1, le=500, description="Raio de busca em km (requer cep com coordenadas)"),
    status: Optional[str] = Query(None, description="disponivel | reservado | doado_trocado"),
    ordenar: Optional[str] = Query("recente", description="recente | antigo | proximo"),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Lista anúncios com suporte a busca por palavra-chave, filtragem por categoria,
    tipo, CEP e status. Anúncios concluídos são ocultados por padrão (RF04, RF06.2).

    Parâmetros de geolocalização (RF04.3, RF04.4, RNF03):
    - ``cep``: CEP de referência para filtro por proximidade (com ou sem hífen).
    - ``raio_km``: Raio máximo em km. O CEP de busca é geocodificado diretamente,
      e todos os anúncios com coordenadas dentro do raio são retornados.
    - ``ordenar=proximo``: Ordena os resultados pela distância ao CEP fornecido.
    """
    query = db.query(Anuncio).options(*_load_options)

    if status:
        query = query.filter(Anuncio.status == status)
    else:
        query = query.filter(Anuncio.status != StatusAnuncio.doado_trocado)

    if q:
        query = query.filter(
            or_(
                Anuncio.titulo.ilike(f"%{q}%"),
                Anuncio.descricao.ilike(f"%{q}%"),
            )
        )
    if categoria_id:
        query = query.filter(Anuncio.categoria_id == categoria_id)
    if tipo and tipo in (TipoAnuncio.doacao, TipoAnuncio.troca):
        query = query.filter(
            or_(Anuncio.tipo == tipo, Anuncio.tipo == TipoAnuncio.ambos)
        )
    elif tipo:
        query = query.filter(Anuncio.tipo == tipo)

    # ── Geolocalização (RF04.3, RF04.4) ──────────────────────────────────────
    ref_lat: Optional[float] = None
    ref_lon: Optional[float] = None

    if cep:
        cep_digits = cep.replace("-", "").strip()
        # Geocodificar se há raio ou ordenação por proximidade
        if raio_km is not None or ordenar == "proximo":
            ref_lat, ref_lon = await geocode_cep(cep_digits)
        
        if raio_km is not None:
            if ref_lat is not None and ref_lon is not None:
                # Bounding-box pre-filter: ±delta graus ao redor do ponto de referência.
                # 1 grau de latitude ≈ 111 km; longitude varia com cosseno da latitude.
                delta_lat = raio_km / _KM_PER_DEGREE_LAT
                delta_lon = raio_km / (
                    _KM_PER_DEGREE_LAT * max(math.cos(math.radians(ref_lat)), _COS_ZERO_GUARD)
                )
                query = query.filter(
                    Anuncio.latitude.isnot(None),
                    Anuncio.longitude.isnot(None),
                    Anuncio.latitude.between(ref_lat - delta_lat, ref_lat + delta_lat),
                    Anuncio.longitude.between(ref_lon - delta_lon, ref_lon + delta_lon),
                )
            else:
                # Se não conseguir geocodificar o CEP, fallback: filtrar por prefixo de CEP
                query = query.filter(Anuncio.cep.ilike(f"{cep_digits[:5]}%"))
        else:
            # Sem raio_km: apenas filtro por prefixo de CEP
            query = query.filter(Anuncio.cep.ilike(f"{cep_digits[:5]}%"))

    if ordenar == "antigo":
        query = query.order_by(Anuncio.criado_em.asc())
    elif ordenar == "proximo" and ref_lat is not None and ref_lon is not None:
        # Ordenação por proximidade: busca todos os candidatos e ordena em memória
        candidates = query.all()
        candidates.sort(
            key=lambda a: haversine_km(ref_lat, ref_lon, a.latitude, a.longitude)
            if a.latitude is not None and a.longitude is not None
            else float("inf")
        )
        return candidates[offset: offset + limit]
    else:
        query = query.order_by(Anuncio.criado_em.desc())

    return query.offset(offset).limit(limit).all()


@router.get("/{anuncio_id}", response_model=AnuncioResponse, summary="Detalhe do anúncio")
def buscar_anuncio(anuncio_id: int, db: Session = Depends(get_db)):
    """Retorna todos os detalhes de um anúncio pelo ID."""
    return _get_anuncio_or_404(anuncio_id, db)


@router.post("/", response_model=AnuncioResponse, status_code=status.HTTP_201_CREATED, summary="Criar anúncio")
async def criar_anuncio(
    titulo: str = Form(..., min_length=3, max_length=200),
    descricao: str = Form(..., min_length=10),
    tipo: TipoAnuncio = Form(...),
    condicao: CondicaoItem = Form(...),
    categoria_id: Optional[int] = Form(None),
    localizacao: Optional[str] = Form(None, max_length=255),
    cep: Optional[str] = Form(None, max_length=9),
    imagens: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Cria um novo anúncio de doação ou troca (RF03). Aceita até 3 imagens (JPEG, PNG, GIF)."""
    valid_files = [f for f in imagens if f.filename]
    if len(valid_files) > _MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Máximo de {_MAX_IMAGES} imagens por anúncio.",
        )

    lat, lon = await geocode_cep(cep) if cep else (None, None)

    anuncio = Anuncio(
        titulo=titulo,
        descricao=descricao,
        tipo=tipo,
        condicao=condicao,
        categoria_id=categoria_id,
        localizacao=localizacao,
        cep=cep,
        latitude=lat,
        longitude=lon,
        usuario_id=current_user.id,
    )
    db.add(anuncio)
    db.flush()

    for i, file in enumerate(valid_files):
        url, content_type = _save_image(file)
        db.add(AnuncioImagem(anuncio_id=anuncio.id, url=url, content_type=content_type, ordem=i))

    db.add(StatusHistorico(anuncio_id=anuncio.id, status_novo=StatusAnuncio.disponivel))
    db.commit()
    return _get_anuncio_or_404(anuncio.id, db)


@router.put("/{anuncio_id}", response_model=AnuncioResponse, summary="Editar anúncio")
async def atualizar_anuncio(
    anuncio_id: int,
    titulo: Optional[str] = Form(None, min_length=3, max_length=200),
    descricao: Optional[str] = Form(None, min_length=10),
    tipo: Optional[TipoAnuncio] = Form(None),
    condicao: Optional[CondicaoItem] = Form(None),
    categoria_id: Optional[int] = Form(None),
    localizacao: Optional[str] = Form(None, max_length=255),
    cep: Optional[str] = Form(None, max_length=9),
    imagens: List[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Edita um anúncio existente. Apenas o dono pode editar (RF03.4).
    Se novas imagens forem enviadas, substituem todas as anteriores."""
    anuncio = _get_anuncio_or_404(anuncio_id, db)
    if anuncio.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    # Captura o CEP atual antes de aplicar as alterações, para detectar mudança
    cep_anterior = (anuncio.cep or "").replace("-", "").strip()

    fields = {
        "titulo": titulo,
        "tipo": tipo,
        "descricao": descricao,
        "condicao": condicao,
        "categoria_id": categoria_id,
        "localizacao": localizacao,
        "cep": cep,
    }
    for field, value in fields.items():
        if value is not None:
            setattr(anuncio, field, value)

    # Re-geocodificar se o CEP foi alterado (normaliza ambos para comparação sem hífen)
    if cep is not None:
        cep_novo = cep.replace("-", "").strip()
        if cep_novo != cep_anterior:
            lat, lon = await geocode_cep(cep)
            anuncio.latitude = lat
            anuncio.longitude = lon

    valid_files = [f for f in imagens if f.filename]
    if len(valid_files) > _MAX_IMAGES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Máximo de {_MAX_IMAGES} imagens por anúncio.",
        )

    if valid_files:
        existing = db.query(AnuncioImagem).filter(AnuncioImagem.anuncio_id == anuncio_id).all()
        delete_image_files(existing)
        db.query(AnuncioImagem).filter(AnuncioImagem.anuncio_id == anuncio_id).delete()
        for i, file in enumerate(valid_files):
            url, content_type = _save_image(file)
            db.add(AnuncioImagem(anuncio_id=anuncio_id, url=url, content_type=content_type, ordem=i))

    db.commit()
    return _get_anuncio_or_404(anuncio_id, db)


@router.patch("/{anuncio_id}/status", response_model=AnuncioResponse, summary="Alterar status do anúncio")
def alterar_status(
    anuncio_id: int,
    dados: AnuncioStatusUpdate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Altera o status do anúncio (disponível, reservado, doado_trocado – RF06)."""
    anuncio = _get_anuncio_or_404(anuncio_id, db)
    if anuncio.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")

    historico = StatusHistorico(
        anuncio_id=anuncio_id,
        status_anterior=anuncio.status,
        status_novo=dados.status,
    )
    anuncio.status = dados.status
    db.add(historico)
    db.commit()
    return _get_anuncio_or_404(anuncio_id, db)


@router.get("/{anuncio_id}/historico-status", response_model=List[StatusHistoricoResponse], summary="Histórico de status")
def historico_status(anuncio_id: int, db: Session = Depends(get_db)):
    """Retorna o histórico completo de mudanças de status do anúncio (RF06.3)."""
    _get_anuncio_or_404(anuncio_id, db)
    return (
        db.query(StatusHistorico)
        .filter(StatusHistorico.anuncio_id == anuncio_id)
        .order_by(StatusHistorico.alterado_em.asc())
        .all()
    )


@router.delete("/{anuncio_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Excluir anúncio")
def excluir_anuncio(
    anuncio_id: int,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Remove um anúncio. Apenas o dono ou admin podem excluir."""
    anuncio = _get_anuncio_or_404(anuncio_id, db)
    if anuncio.usuario_id != current_user.id and not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Sem permissão")
    delete_image_files(anuncio.imagens)
    db.delete(anuncio)
    db.commit()
