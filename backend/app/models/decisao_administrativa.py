from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer
from sqlalchemy import event
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AcaoAdministrativa(str, PyEnum):
    ignorar = "ignorar"
    remover_anuncio = "remover_anuncio"
    suspender_usuario = "suspender_usuario"


class DecisaoAdministrativa(Base):
    __tablename__ = "decisoes_administrativas"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    admin_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    denuncia_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("denuncias.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    anuncio_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("anuncios.id", ondelete="SET NULL"), nullable=True, index=True
    )
    usuario_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=True, index=True
    )
    acao: Mapped[AcaoAdministrativa] = mapped_column(
        Enum(AcaoAdministrativa, name="acao_administrativa"), nullable=False, index=True
    )
    criado_em: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, nullable=False
    )


@event.listens_for(DecisaoAdministrativa, "before_update")
def _bloquear_update(*_) -> None:
    raise ValueError("Log administrativo é imutável.")


@event.listens_for(DecisaoAdministrativa, "before_delete")
def _bloquear_delete(*_) -> None:
    raise ValueError("Log administrativo é imutável.")
