"""Testes para os endpoints de chat: /api/chat/*"""
from unittest.mock import patch

REGISTER_URL = "/auth/registrar"
VERIFY_EMAIL_URL = "/auth/verify-email"
LOGIN_URL = "/auth/login"

CONVERSATIONS_URL = "/api/chat/conversations"
USERS_SEARCH_URL = "/api/chat/users/search"
UNREAD_COUNT_URL = "/api/chat/unread-count"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register_and_verify(client, email: str, nome: str = "Usuário Teste") -> dict:
    """Registra e verifica e-mail; retorna dados do usuário."""
    with patch("app.routers.auth.send_verification_email") as mock_send:
        resp = client.post(REGISTER_URL, json={"nome": nome, "email": email, "senha": "senha123"})
    assert resp.status_code == 201
    token = mock_send.call_args.kwargs["token"]
    verify = client.post(VERIFY_EMAIL_URL, json={"token": token})
    assert verify.status_code == 200
    return resp.json()["usuario"]


def _login(client, email: str) -> str:
    """Faz login e retorna o access_token."""
    resp = client.post(
        LOGIN_URL,
        data={"username": email, "password": "senha123"},
    )
    assert resp.status_code == 200
    return resp.json()["access_token"]


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# POST /api/chat/conversations
# ---------------------------------------------------------------------------

class TestCreateConversation:
    def test_cria_conversa_entre_dois_usuarios(self, client):
        user_a = _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        resp = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "direct"
        participant_ids = {p["user_id"] for p in data["participants"]}
        assert user_a["id"] in participant_ids
        assert user_b["id"] in participant_ids

    def test_retorna_conversa_existente_ao_inves_de_duplicar(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        resp1 = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )
        resp2 = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )
        assert resp1.status_code == 201
        assert resp2.status_code in (200, 201)
        assert resp1.json()["id"] == resp2.json()["id"]

    def test_nao_pode_iniciar_conversa_consigo_mesmo(self, client):
        user_a = _register_and_verify(client, "alice@example.com", "Alice")
        token_a = _login(client, "alice@example.com")

        resp = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_a["id"]},
            headers=_auth(token_a),
        )
        assert resp.status_code == 400
        assert "consigo mesmo" in resp.json()["detail"].lower()

    def test_usuario_inexistente_retorna_404(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token_a = _login(client, "alice@example.com")

        resp = client.post(
            CONVERSATIONS_URL,
            json={"user_id": 99999},
            headers=_auth(token_a),
        )
        assert resp.status_code == 404

    def test_sem_autenticacao_retorna_401(self, client):
        resp = client.post(CONVERSATIONS_URL, json={"user_id": 1})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/chat/conversations
# ---------------------------------------------------------------------------

class TestListConversations:
    def test_lista_vazia_sem_conversas(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token = _login(client, "alice@example.com")

        resp = client.get(CONVERSATIONS_URL, headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_lista_conversa_criada(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )

        resp = client.get(CONVERSATIONS_URL, headers=_auth(token_a))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_inclui_unread_count_zerado_sem_mensagens(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )

        resp = client.get(CONVERSATIONS_URL, headers=_auth(token_a))
        assert resp.json()[0]["unread_count"] == 0

    def test_sem_autenticacao_retorna_401(self, client):
        resp = client.get(CONVERSATIONS_URL)
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/chat/conversations/{id}
# ---------------------------------------------------------------------------

class TestGetConversation:
    def test_retorna_detalhes_da_conversa(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        conv = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        ).json()

        resp = client.get(f"{CONVERSATIONS_URL}/{conv['id']}", headers=_auth(token_a))
        assert resp.status_code == 200
        assert resp.json()["id"] == conv["id"]

    def test_nao_participante_recebe_403(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        _register_and_verify(client, "carol@example.com", "Carol")
        token_a = _login(client, "alice@example.com")
        token_c = _login(client, "carol@example.com")

        conv = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        ).json()

        resp = client.get(f"{CONVERSATIONS_URL}/{conv['id']}", headers=_auth(token_c))
        assert resp.status_code == 403

    def test_conversa_inexistente_retorna_403(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token = _login(client, "alice@example.com")

        resp = client.get(f"{CONVERSATIONS_URL}/99999", headers=_auth(token))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/chat/conversations/{id}/messages
# ---------------------------------------------------------------------------

class TestGetMessages:
    def test_lista_vazia_sem_mensagens(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        conv = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        ).json()

        resp = client.get(f"{CONVERSATIONS_URL}/{conv['id']}/messages", headers=_auth(token_a))
        assert resp.status_code == 200
        data = resp.json()
        assert data["messages"] == []
        assert data["has_more"] is False
        assert data["next_cursor"] is None

    def test_nao_participante_recebe_403(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        _register_and_verify(client, "carol@example.com", "Carol")
        token_a = _login(client, "alice@example.com")
        token_c = _login(client, "carol@example.com")

        conv = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        ).json()

        resp = client.get(
            f"{CONVERSATIONS_URL}/{conv['id']}/messages",
            headers=_auth(token_c),
        )
        assert resp.status_code == 403

    def test_limit_invalido_retorna_422(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        conv = client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        ).json()

        resp = client.get(
            f"{CONVERSATIONS_URL}/{conv['id']}/messages?limit=200",
            headers=_auth(token_a),
        )
        assert resp.status_code == 422

    def test_sem_autenticacao_retorna_401(self, client):
        resp = client.get(f"{CONVERSATIONS_URL}/1/messages")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/chat/users/search
# ---------------------------------------------------------------------------

class TestSearchUsers:
    def test_encontra_usuario_pelo_nome(self, client):
        _register_and_verify(client, "alice@example.com", "Alice Wonderland")
        _register_and_verify(client, "bob@example.com", "Bob Builder")
        token_a = _login(client, "alice@example.com")

        resp = client.get(f"{USERS_SEARCH_URL}?q=Bob", headers=_auth(token_a))
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 1
        assert results[0]["nome"] == "Bob Builder"

    def test_nao_retorna_o_proprio_usuario(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token_a = _login(client, "alice@example.com")

        resp = client.get(f"{USERS_SEARCH_URL}?q=Alice", headers=_auth(token_a))
        assert resp.status_code == 200
        assert all(u["nome"] != "Alice" or u.get("email") != "alice@example.com" for u in resp.json())

    def test_encontra_usuario_pelo_email(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        resp = client.get(f"{USERS_SEARCH_URL}?q=bob@example", headers=_auth(token_a))
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    def test_busca_vazia_retorna_422(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token_a = _login(client, "alice@example.com")

        resp = client.get(f"{USERS_SEARCH_URL}?q=", headers=_auth(token_a))
        assert resp.status_code == 422

    def test_sem_query_retorna_422(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token_a = _login(client, "alice@example.com")

        resp = client.get(USERS_SEARCH_URL, headers=_auth(token_a))
        assert resp.status_code == 422

    def test_sem_autenticacao_retorna_401(self, client):
        resp = client.get(f"{USERS_SEARCH_URL}?q=alice")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# GET /api/chat/unread-count
# ---------------------------------------------------------------------------

class TestUnreadCount:
    def test_zero_sem_conversas(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        token = _login(client, "alice@example.com")

        resp = client.get(UNREAD_COUNT_URL, headers=_auth(token))
        assert resp.status_code == 200
        assert resp.json()["total_unread"] == 0

    def test_zero_com_conversa_sem_mensagens(self, client):
        _register_and_verify(client, "alice@example.com", "Alice")
        user_b = _register_and_verify(client, "bob@example.com", "Bob")
        token_a = _login(client, "alice@example.com")

        client.post(
            CONVERSATIONS_URL,
            json={"user_id": user_b["id"]},
            headers=_auth(token_a),
        )

        resp = client.get(UNREAD_COUNT_URL, headers=_auth(token_a))
        assert resp.status_code == 200
        assert resp.json()["total_unread"] == 0

    def test_sem_autenticacao_retorna_401(self, client):
        resp = client.get(UNREAD_COUNT_URL)
        assert resp.status_code == 401
