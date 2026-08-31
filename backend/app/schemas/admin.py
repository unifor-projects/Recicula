from enum import Enum

from pydantic import BaseModel


class AcaoModeracao(str, Enum):
    ignorar = "ignorar"
    remover_anuncio = "remover_anuncio"
    suspender_usuario = "suspender_usuario"


class ResolverDenunciaAdminRequest(BaseModel):
    acao: AcaoModeracao
