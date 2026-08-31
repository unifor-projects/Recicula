from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.anuncio import Anuncio
from app.models.decisao_administrativa import AcaoAdministrativa, DecisaoAdministrativa
from app.models.denuncia import Denuncia, StatusDenuncia
from app.models.usuario import Usuario
from app.services.uploads import delete_image_files


def listar_denuncias_pendentes(db: Session) -> list[Denuncia]:
    return (
        db.query(Denuncia)
        .filter(Denuncia.status == StatusDenuncia.pendente)
        .order_by(Denuncia.criado_em.desc())
        .all()
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


def resolver_denuncia_com_acao(
    *,
    db: Session,
    denuncia_id: int,
    admin: Usuario,
    acao: AcaoAdministrativa,
) -> Denuncia:
    denuncia = db.get(Denuncia, denuncia_id)
    if not denuncia:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Denúncia não encontrada")

    usuario_afetado_id = denuncia.usuario_denunciado_id
    if acao == AcaoAdministrativa.remover_anuncio:
        if not denuncia.anuncio_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Denúncia não está vinculada a anúncio",
            )
        anuncio = db.get(Anuncio, denuncia.anuncio_id)
        if anuncio:
            usuario_afetado_id = anuncio.usuario_id
            delete_image_files(anuncio.imagens)
            db.delete(anuncio)
    elif acao == AcaoAdministrativa.suspender_usuario:
        usuario_id_a_suspender = denuncia.usuario_denunciado_id
        if not usuario_id_a_suspender and denuncia.anuncio_id:
            anuncio = db.get(Anuncio, denuncia.anuncio_id)
            if anuncio:
                usuario_id_a_suspender = anuncio.usuario_id
        
        if not usuario_id_a_suspender:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Denúncia não possui usuário associado para suspensão",
            )
        usuario = db.get(Usuario, usuario_id_a_suspender)
        if usuario:
            usuario.is_active = False
            usuario_afetado_id = usuario.id

    denuncia.status = StatusDenuncia.resolvida
    denuncia.admin_id = admin.id
    denuncia.resolvido_em = datetime.now(timezone.utc)
    _registrar_log(
        db,
        admin_id=admin.id,
        denuncia_id=denuncia.id,
        anuncio_id=denuncia.anuncio_id,
        usuario_id=usuario_afetado_id,
        acao=acao,
    )
    db.commit()
    db.refresh(denuncia)
    return denuncia
