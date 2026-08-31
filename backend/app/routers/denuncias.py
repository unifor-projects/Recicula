from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from typing import List

from app.database import get_db
from app.deps import get_current_user, get_current_admin
from app.models.usuario import Usuario
from app.models.anuncio import Anuncio
from app.models.decisao_administrativa import AcaoAdministrativa
from app.models.denuncia import Denuncia, StatusDenuncia
from app.services.moderacao import listar_denuncias_pendentes, resolver_denuncia_com_acao
from app.schemas.denuncia import DenunciaCreate, DenunciaResolucao, DenunciaResponse, TipoDenuncia

router = APIRouter(prefix="/denuncias", tags=["Denúncias e Moderação"])
_DEPRECATION_WARNING = (
    '299 - "Endpoint legado e depreciado. Use /admin/denuncias e '
    '/admin/denuncias/{id}/resolver. Sera removido em futuras atualizacoes."'
)


def _set_deprecation_headers(response: Response) -> None:
    response.headers["Deprecation"] = "true"
    response.headers["Warning"] = _DEPRECATION_WARNING
    response.headers["Sunset"] = "Thu, 31 Dec 2026 23:59:59 GMT"


@router.post("/", response_model=DenunciaResponse, status_code=status.HTTP_201_CREATED, summary="Denunciar anúncio ou usuário")
def criar_denuncia(
    dados: DenunciaCreate,
    db: Session = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Registra uma denúncia contra um anúncio ou usuário (RF07.1)."""
    anuncio_id = None
    usuario_denunciado_id = None

    if dados.tipo == TipoDenuncia.anuncio:
        anuncio = db.get(Anuncio, dados.alvo_id)
        if not anuncio:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anúncio não encontrado")
        anuncio_id = dados.alvo_id
    else:
        usuario = db.get(Usuario, dados.alvo_id)
        if not usuario:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
        usuario_denunciado_id = dados.alvo_id

    denuncia = Denuncia(
        denunciante_id=current_user.id,
        anuncio_id=anuncio_id,
        usuario_denunciado_id=usuario_denunciado_id,
        motivo=dados.motivo,
        descricao=dados.descricao,
    )
    db.add(denuncia)
    db.commit()
    db.refresh(denuncia)
    return denuncia


@router.get(
    "/",
    response_model=List[DenunciaResponse],
    summary="Listar denúncias (admin) [LEGADO]",
    deprecated=True,
)
def listar_denuncias(
    response: Response,
    db: Session = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Lista todas as denúncias pendentes (RF07.2)."""
    _set_deprecation_headers(response)
    return listar_denuncias_pendentes(db)


@router.patch(
    "/{denuncia_id}/resolver",
    response_model=DenunciaResponse,
    summary="Resolver denúncia (admin) [LEGADO]",
    deprecated=True,
)
def resolver_denuncia(
    denuncia_id: int,
    dados: DenunciaResolucao,
    response: Response,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_admin),
):
    """Analisa e resolve uma denúncia, com opção de remover o anúncio ou suspender o usuário (RF07.3)."""
    _set_deprecation_headers(response)
    if dados.status != StatusDenuncia.resolvida:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endpoint legado aceita apenas status 'resolvida'. Use /admin/denuncias/{id}/resolver.",
        )
    if dados.remover_anuncio and dados.suspender_usuario:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Endpoint legado aceita apenas uma ação por vez. Use /admin/denuncias/{id}/resolver.",
        )
    acao = AcaoAdministrativa.ignorar
    if dados.remover_anuncio:
        acao = AcaoAdministrativa.remover_anuncio
    elif dados.suspender_usuario:
        acao = AcaoAdministrativa.suspender_usuario
    return resolver_denuncia_com_acao(
        db=db,
        denuncia_id=denuncia_id,
        admin=admin,
        acao=acao,
    )
