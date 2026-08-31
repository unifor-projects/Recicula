"""Cria usuários de desenvolvimento prontos para login.

Executado pelo entrypoint do container quando SEED_DEV_USERS=true, logo após o
`alembic upgrade head`. É idempotente: rodar de novo apenas realinha a senha e as
flags dos usuários abaixo, sem duplicar registros.

Uso manual:
    uv run python -m app.seed_dev
"""

import os
import sys

from sqlalchemy.exc import SQLAlchemyError

from app.core.security import hash_password
from app.database import SessionLocal
from app.models.usuario import Usuario

DEFAULT_PASSWORD = "senha123"

SEED_USERS = [
    {"nome": "Alice Teste", "email": "alice@recircula.dev", "localizacao": "Fortaleza, CE"},
    {"nome": "Bruno Teste", "email": "bruno@recircula.dev", "localizacao": "Fortaleza, CE"},
]


def main() -> int:
    password = os.getenv("SEED_DEV_PASSWORD") or DEFAULT_PASSWORD
    # Um único hash para os dois: bcrypt gera salt próprio por chamada, mas a senha
    # em texto claro é a mesma, então qualquer um dos hashes valida a mesma senha.
    senha_hash = hash_password(password)

    db = SessionLocal()
    try:
        for spec in SEED_USERS:
            usuario = db.query(Usuario).filter(Usuario.email == spec["email"]).first()
            if usuario is None:
                usuario = Usuario(**spec)
                db.add(usuario)
                acao = "criado"
            else:
                acao = "atualizado"

            usuario.senha_hash = senha_hash
            usuario.is_active = True
            # POST /auth/login rejeita contas com email_verificado=False antes de
            # olhar is_active, então é esta linha que dispensa o e-mail de verificação.
            usuario.email_verificado = True
            usuario.token_verificacao = None

            print(f"  {spec['email']} ({acao})")

        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        print(f"Seed falhou: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(f"Senha para ambos os usuários: {password}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
