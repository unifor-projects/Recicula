from unittest.mock import patch

from app.models.decisao_administrativa import AcaoAdministrativa, DecisaoAdministrativa
from app.models.denuncia import Denuncia, StatusDenuncia
from app.models.usuario import Usuario


REGISTER_URL = "/auth/registrar"
VERIFY_EMAIL_URL = "/auth/verify-email"
LOGIN_URL = "/auth/login"
DENUNCIAS_URL = "/denuncias/"


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


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_post_denuncias_cria_denuncia_de_anuncio(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Autor", "autor@example.com")

    anuncio = client.post(
        "/anuncios/",
        data={
            "titulo": "Mesa de madeira",
            "descricao": "Mesa para doação em bom estado",
            "tipo": "doacao",
            "condicao": "usado",
        },
        headers=_headers(token),
    )
    assert anuncio.status_code == 201
    anuncio_id = anuncio.json()["id"]

    denunciante_id, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante", "denunciante@example.com"
    )
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "anuncio",
            "alvo_id": anuncio_id,
            "motivo": "Conteúdo impróprio no anúncio",
            "descricao": "Detalhes da denúncia",
        },
        headers=_headers(denunciante_token),
    )

    assert resposta.status_code == 201
    body = resposta.json()
    assert body["anuncio_id"] == anuncio_id
    assert body["usuario_denunciado_id"] is None
    assert body["denunciante_id"] == denunciante_id
    assert body["status"] == "pendente"


def test_post_denuncias_cria_denuncia_de_usuario(client, db_session):
    alvo_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo", "alvo@example.com")
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante", "den2@example.com"
    )

    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "usuario",
            "alvo_id": alvo_id,
            "motivo": "Comportamento inadequado",
            "descricao": "Mensagens ofensivas",
        },
        headers=_headers(denunciante_token),
    )

    assert resposta.status_code == 201
    body = resposta.json()
    assert body["usuario_denunciado_id"] == alvo_id
    assert body["anuncio_id"] is None
    assert body["status"] == "pendente"


def test_post_denuncias_aceita_payload_legado_com_anuncio_id(client, db_session):
    _, autor_token = _registrar_verificar_e_logar(client, db_session, "Autor Legado", "autor-legado@example.com")
    anuncio = client.post(
        "/anuncios/",
        data={
            "titulo": "Fogão usado",
            "descricao": "Fogão funcionando para doação",
            "tipo": "doacao",
            "condicao": "usado",
        },
        headers=_headers(autor_token),
    )
    assert anuncio.status_code == 201
    anuncio_id = anuncio.json()["id"]

    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante Legado", "den-legado-anuncio@example.com"
    )
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "anuncio_id": anuncio_id,
            "motivo": "Violação de regras",
            "descricao": "Detalhes da denúncia",
        },
        headers=_headers(denunciante_token),
    )

    assert resposta.status_code == 201
    body = resposta.json()
    assert body["anuncio_id"] == anuncio_id
    assert body["usuario_denunciado_id"] is None


def test_post_denuncias_aceita_payload_legado_com_usuario_denunciado_id(client, db_session):
    alvo_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo Legado", "alvo-legado@example.com")
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante Legado", "den-legado-usuario@example.com"
    )
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "usuario_denunciado_id": alvo_id,
            "motivo": "Perfil falso",
            "descricao": "Descrição detalhada",
        },
        headers=_headers(denunciante_token),
    )

    assert resposta.status_code == 201
    body = resposta.json()
    assert body["usuario_denunciado_id"] == alvo_id
    assert body["anuncio_id"] is None


def test_post_denuncias_rejeita_payload_legado_ambiguo(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Denunciante", "den-ambiguo@example.com")
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "anuncio_id": 1,
            "usuario_denunciado_id": 2,
            "motivo": "Motivo válido",
            "descricao": "Descrição",
        },
        headers=_headers(token),
    )

    assert resposta.status_code == 422
    assert "exatamente um alvo" in resposta.text.lower()


def test_post_denuncias_rejeita_mistura_contrato_novo_com_legado(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Denunciante", "den-misto@example.com")
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "usuario",
            "alvo_id": 1,
            "anuncio_id": 1,
            "motivo": "Motivo válido",
            "descricao": "Descrição",
        },
        headers=_headers(token),
    )

    assert resposta.status_code == 422
    assert "exatamente um alvo" in resposta.text.lower()


def test_post_denuncias_retorna_404_para_anuncio_inexistente(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Denunciante", "den-404-anuncio@example.com")
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "anuncio",
            "alvo_id": 999999,
            "motivo": "Conteúdo irregular",
            "descricao": "Detalhes",
        },
        headers=_headers(token),
    )

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Anúncio não encontrado"


def test_post_denuncias_retorna_404_para_usuario_inexistente(client, db_session):
    _, token = _registrar_verificar_e_logar(client, db_session, "Denunciante", "den-404-usuario@example.com")
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "usuario",
            "alvo_id": 999999,
            "motivo": "Comportamento inadequado",
            "descricao": "Detalhes",
        },
        headers=_headers(token),
    )

    assert resposta.status_code == 404
    assert resposta.json()["detail"] == "Usuário não encontrado"


def test_post_denuncias_exige_autenticacao(client):
    resposta = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "usuario",
            "alvo_id": 1,
            "motivo": "Motivo válido",
            "descricao": "Descrição",
        },
    )
    assert resposta.status_code == 401


def test_get_denuncias_admin_lista_apenas_pendentes(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin", "admin@example.com", admin=True
    )
    alvo_id, _ = _registrar_verificar_e_logar(client, db_session, "Alvo", "alvo2@example.com")
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante", "den3@example.com"
    )

    criar = client.post(
        DENUNCIAS_URL,
        json={
            "tipo": "usuario",
            "alvo_id": alvo_id,
            "motivo": "Perfil suspeito",
            "descricao": "Descrição inicial",
        },
        headers=_headers(denunciante_token),
    )
    assert criar.status_code == 201
    denuncia_id = criar.json()["id"]

    lista = client.get(DENUNCIAS_URL, headers=_headers(admin_token))
    assert lista.status_code == 200
    ids = [item["id"] for item in lista.json()]
    assert denuncia_id in ids

    denuncia = db_session.get(Denuncia, denuncia_id)
    denuncia.status = StatusDenuncia.resolvida
    db_session.commit()

    lista_atualizada = client.get(DENUNCIAS_URL, headers=_headers(admin_token))
    assert lista_atualizada.status_code == 200
    ids_atualizados = [item["id"] for item in lista_atualizada.json()]
    assert denuncia_id not in ids_atualizados


def test_get_denuncias_legado_retorna_headers_de_deprecacao(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin Dep", "admin-dep-list@example.com", admin=True
    )

    resposta = client.get(DENUNCIAS_URL, headers=_headers(admin_token))

    assert resposta.status_code == 200
    assert resposta.headers["Deprecation"] == "true"
    assert "depreciado" in resposta.headers["Warning"].lower()
    assert resposta.headers["Sunset"] == "Thu, 31 Dec 2026 23:59:59 GMT"


def test_patch_denuncias_legado_usa_fluxo_admin_com_log_e_headers(client, db_session):
    _, admin_token = _registrar_verificar_e_logar(
        client, db_session, "Admin Legacy", "admin-dep-resolve@example.com", admin=True
    )
    autor_id, autor_token = _registrar_verificar_e_logar(
        client, db_session, "Autor Legacy", "autor-dep-resolve@example.com"
    )
    _, denunciante_token = _registrar_verificar_e_logar(
        client, db_session, "Denunciante Legacy", "den-dep-resolve@example.com"
    )

    anuncio = client.post(
        "/anuncios/",
        data={
            "titulo": "Armário",
            "descricao": "Descrição com tamanho suficiente",
            "tipo": "doacao",
            "condicao": "usado",
        },
        headers=_headers(autor_token),
    )
    assert anuncio.status_code == 201
    anuncio_id = anuncio.json()["id"]

    criar_denuncia = client.post(
        DENUNCIAS_URL,
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
        f"/denuncias/{denuncia_id}/resolver",
        json={
            "status": "resolvida",
            "remover_anuncio": True,
        },
        headers=_headers(admin_token),
    )

    assert resolver.status_code == 200
    assert resolver.headers["Deprecation"] == "true"
    assert "depreciado" in resolver.headers["Warning"].lower()
    anuncio_removido = client.get(f"/anuncios/{anuncio_id}")
    assert anuncio_removido.status_code == 404

    log = db_session.query(DecisaoAdministrativa).one()
    assert log.acao == AcaoAdministrativa.remover_anuncio
    assert log.denuncia_id == denuncia_id
    assert log.usuario_id == autor_id
