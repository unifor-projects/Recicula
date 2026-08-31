from unittest.mock import patch

import pytest

from app.models.decisao_administrativa import AcaoAdministrativa, DecisaoAdministrativa
from app.models.denuncia import StatusDenuncia
from app.models.usuario import Usuario

REGISTER_URL = "/auth/registrar"
VERIFY_EMAIL_URL = "/auth/verify-email"
LOGIN_URL = "/auth/login"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _registrar_verificar_e_logar(
    client,
    db_session,
    nome: str,
    email: str,
    senha: str = "senha123",
    *,
    admin: bool = False,
) -> tuple[int, str]:
    with patch("app.routers.auth.send_verification_email") as mock_send:
        registro = client.post(REGISTER_URL, json={"nome": nome, "email": email, "senha": senha})
    assert registro.status_code == 201

    token_verificacao = mock_send.call_args.kwargs["token"]
    verificar = client.post(VERIFY_EMAIL_URL, json={"token": token_verificacao})
    assert verificar.status_code == 200

    user_id = registro.json()["usuario"]["id"]
    if admin:
        usuario = db_session.get(Usuario, user_id)
        usuario.is_admin = True
        db_session.commit()

    login = client.post(LOGIN_URL, data={"username": email, "password": senha})
    assert login.status_code == 200
    return user_id, login.json()["access_token"]


def test_admin_rotas_exigem_perfil_administrador(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Usuario", "user-admin-rf07@example.com")

    resposta = client.get("/admin/denuncias", headers=_headers(token))

    assert resposta.status_code == 403
    assert resposta.json()["detail"] == "Acesso restrito a administradores"


def test_get_admin_denuncias_lista_pendentes(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin-rf07-lista@example.com", admin=True
    )
    alvo_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo", "alvo-rf07-lista@example.com")
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante", "den-rf07-lista@example.com"
    )

    criar = client.post(
        "/denuncias/",
        json={
            "tipo": "usuario",
            "alvo_id": alvo_id,
            "motivo": "Comportamento abusivo",
            "descricao": "Detalhes da denúncia",
        },
        headers=_headers(denunciante_token),
    )
    assert criar.status_code == 201
    denuncia_id = criar.json()["id"]

    lista = client.get("/admin/denuncias", headers=_headers(admin_token))
    assert lista.status_code == 200
    ids = [item["id"] for item in lista.json()]
    assert denuncia_id in ids


def test_patch_admin_denuncia_resolver_com_acao_remove_anuncio_e_gera_log(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin-rf07-resolver@example.com", admin=True
    )
    autor_id, autor_token = _registrar_verificar_e_logar(
        client, db_session, "Autor", "autor-rf07-resolver@example.com"
    )
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante", "den-rf07-resolver@example.com"
    )

    anuncio = client.post(
        "/anuncios/",
        data={
            "titulo": "Notebook usado",
            "descricao": "Descrição com tamanho suficiente",
            "tipo": "doacao",
            "condicao": "usado",
        },
        headers=_headers(autor_token),
    )
    assert anuncio.status_code == 201
    anuncio_id = anuncio.json()["id"]

    criar_denuncia = client.post(
        "/denuncias/",
        json={
            "tipo": "anuncio",
            "alvo_id": anuncio_id,
            "motivo": "Conteúdo indevido",
            "descricao": "Descrição detalhada",
        },
        headers=_headers(denunciante_token),
    )
    assert criar_denuncia.status_code == 201
    denuncia_id = criar_denuncia.json()["id"]

    resolver = client.patch(
        f"/admin/denuncias/{denuncia_id}/resolver",
        json={"acao": "remover_anuncio"},
        headers=_headers(admin_token),
    )

    assert resolver.status_code == 200
    body = resolver.json()
    assert body["status"] == StatusDenuncia.resolvida.value
    assert body["admin_id"] is not None

    anuncio_removido = client.get(f"/anuncios/{anuncio_id}")
    assert anuncio_removido.status_code == 404

    logs = db_session.query(DecisaoAdministrativa).all()
    assert len(logs) == 1
    assert logs[0].acao == AcaoAdministrativa.remover_anuncio
    assert logs[0].denuncia_id == denuncia_id
    assert logs[0].usuario_id == autor_id


def test_delete_admin_anuncio_remove_e_registra_log(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin-rf07-delete@example.com", admin=True
    )
    autor_id, autor_token = _registrar_verificar_e_logar(
        client, db_session, "Autor", "autor-rf07-delete@example.com"
    )

    anuncio = client.post(
        "/anuncios/",
        data={
            "titulo": "Cadeira de escritório",
            "descricao": "Descrição com tamanho suficiente",
            "tipo": "doacao",
            "condicao": "usado",
        },
        headers=_headers(autor_token),
    )
    assert anuncio.status_code == 201
    anuncio_id = anuncio.json()["id"]

    resposta = client.delete(f"/admin/anuncios/{anuncio_id}", headers=_headers(admin_token))

    assert resposta.status_code == 204
    anuncio_removido = client.get(f"/anuncios/{anuncio_id}")
    assert anuncio_removido.status_code == 404

    log = db_session.query(DecisaoAdministrativa).one()
    assert log.acao == AcaoAdministrativa.remover_anuncio
    assert log.anuncio_id == anuncio_id
    assert log.usuario_id == autor_id


def test_patch_admin_usuario_suspender_desativa_usuario_e_registra_log(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin-rf07-suspender@example.com", admin=True
    )
    usuario_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo", "alvo-rf07-suspender@example.com")

    resposta = client.patch(
        f"/admin/usuarios/{usuario_id}/suspender",
        headers=_headers(admin_token),
    )

    assert resposta.status_code == 200
    assert resposta.json()["is_active"] is False
    log = db_session.query(DecisaoAdministrativa).one()
    assert log.acao == AcaoAdministrativa.suspender_usuario
    assert log.usuario_id == usuario_id


def test_log_decisao_administrativa_e_imutavel(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin-rf07-imutavel@example.com", admin=True
    )
    usuario_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo", "alvo-rf07-imutavel@example.com")

    suspender = client.patch(
        f"/admin/usuarios/{usuario_id}/suspender",
        headers=_headers(admin_token),
    )
    assert suspender.status_code == 200

    log = db_session.query(DecisaoAdministrativa).one()
    log.acao = AcaoAdministrativa.ignorar
    with pytest.raises(ValueError, match="imutável"):
        db_session.commit()
    db_session.rollback()

    log = db_session.query(DecisaoAdministrativa).one()
    db_session.delete(log)
    with pytest.raises(ValueError, match="imutável"):
        db_session.commit()
