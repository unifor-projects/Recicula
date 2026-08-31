from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin, get_current_user
from app.models.anuncio import Anuncio
from app.models.decisao_administrativa import AcaoAdministrativa, DecisaoAdministrativa
from app.models.usuario import Usuario
from app.services.moderacao import listar_denuncias_pendentes, resolver_denuncia_com_acao
from app.services.uploads import delete_image_files
from app.schemas.admin import ResolverDenunciaAdminRequest
from app.schemas.denuncia import DenunciaResponse
from app.schemas.usuario import UsuarioResponse

router = APIRouter(
    prefix="/admin",
    tags=["Administração e Moderação"],
    dependencies=[Depends(get_current_admin)],
)


def _registrar_log(
    db: Session,
    *,
    admin_id: int,
    acao: AcaoAdministrativa,
    denuncia_id: int | None = None,
    anuncio_id: int | None = None,
    usuario_id: int | None = None,
) -> None:
    db.add(
        DecisaoAdministrativa(
            admin_id=admin_id,
            acao=acao,
            denuncia_id=denuncia_id,
            anuncio_id=anuncio_id,
            usuario_id=usuario_id,
        )
    )


@router.get("/denuncias", response_model=List[DenunciaResponse], summary="Listar denúncias pendentes (admin)")
def listar_denuncias_pendentes_admin(db: Session = Depends(get_db)):
    return listar_denuncias_pendentes(db)


@router.patch(
    "/denuncias/{denuncia_id}/resolver",
    response_model=DenunciaResponse,
    summary="Resolver denúncia com ação administrativa",
)
def resolver_denuncia_admin(
    denuncia_id: int,
    dados: ResolverDenunciaAdminRequest,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_user),
):
    return resolver_denuncia_com_acao(
        db=db,
        denuncia_id=denuncia_id,
        admin=admin,
        acao=AcaoAdministrativa(dados.acao.value),
    )


@router.delete("/anuncios/{anuncio_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remover anúncio (admin)")
def remover_anuncio_admin(
    anuncio_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_user),
):
    anuncio = db.get(Anuncio, anuncio_id)
    if not anuncio:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Anúncio não encontrado")
    delete_image_files(anuncio.imagens)
    db.delete(anuncio)
    _registrar_log(
        db,
        admin_id=admin.id,
        anuncio_id=anuncio_id,
        usuario_id=anuncio.usuario_id,
        acao=AcaoAdministrativa.remover_anuncio,
    )
    db.commit()


@router.patch(
    "/usuarios/{usuario_id}/suspender",
    response_model=UsuarioResponse,
    summary="Suspender usuário (admin)",
)
def suspender_usuario_admin(
    usuario_id: int,
    db: Session = Depends(get_db),
    admin: Usuario = Depends(get_current_user),
):
    usuario = db.get(Usuario, usuario_id)
    if not usuario:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")
    usuario.is_active = False
    _registrar_log(
        db,
        admin_id=admin.id,
        usuario_id=usuario.id,
        acao=AcaoAdministrativa.suspender_usuario,
    )
    db.commit()
    db.refresh(usuario)
    return usuario
