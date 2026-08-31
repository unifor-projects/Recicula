import asyncio
import logging
from datetime import datetime, timezone

import bleach
import socketio.exceptions

from app.chat.presence import check_rate_limit, refresh_online, set_offline, set_online
from app.chat.socketio_server import sio
from app.core.security import decode_access_token
from app.database import SessionLocal
from app.models.chat import ChatMessage, ChatParticipant
from app.models.usuario import Usuario

logger = logging.getLogger("chat.events")

_sid_to_user: dict[str, dict] = {}


def _get_db():
    db = SessionLocal()
    try:
        return db
    except Exception:
        db.close()
        raise


def _close_db(db):
    db.close()


def _room_name(conversation_id: int) -> str:
    return f"chat:{conversation_id}"


@sio.event
async def connect(sid, environ, auth):
    if not auth or "token" not in auth:
        logger.warning("Socket connect rejected (sid=%s): token ausente. auth=%r", sid, auth)
        raise socketio.exceptions.ConnectionRefusedError("Token obrigatório")

    payload = decode_access_token(auth["token"])
    if not payload or "sub" not in payload:
        logger.warning(
            "Socket connect rejected (sid=%s): token inválido/expirado ou SECRET_KEY diferente "
            "(decode retornou %r)",
            sid,
            payload,
        )
        raise socketio.exceptions.ConnectionRefusedError("Token inválido")

    user_id = int(payload["sub"])

    def _load_user():
        db = _get_db()
        try:
            user = db.get(Usuario, user_id)
            if not user or not user.is_active:
                return None
            return {"id": user.id, "nome": user.nome, "foto_url": user.foto_url}
        finally:
            _close_db(db)

    user_data = await asyncio.to_thread(_load_user)
    if not user_data:
        logger.warning(
            "Socket connect rejected (sid=%s): usuário %s não encontrado ou inativo",
            sid,
            user_id,
        )
        raise socketio.exceptions.ConnectionRefusedError("Usuário inválido")

    _sid_to_user[sid] = user_data
    await sio.save_session(sid, {"user_id": user_data["id"], "rooms": set()})

    await set_online(user_data["id"])
    await _notify_contacts_presence(user_data["id"], online=True)
    logger.info("User %s connected (sid=%s)", user_data["id"], sid)


@sio.event
async def disconnect(sid):
    user_data = _sid_to_user.pop(sid, None)
    if not user_data:
        return

    remaining_sids = [s for s, u in _sid_to_user.items() if u["id"] == user_data["id"]]
    if not remaining_sids:
        await set_offline(user_data["id"])
        await _notify_contacts_presence(user_data["id"], online=False)

    logger.info("User %s disconnected (sid=%s)", user_data["id"], sid)


@sio.event
async def join_room(sid, data):
    session = await sio.get_session(sid)
    user_id = session["user_id"]
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    def _check():
        db = _get_db()
        try:
            return (
                db.query(ChatParticipant)
                .filter(
                    ChatParticipant.conversation_id == conversation_id,
                    ChatParticipant.user_id == user_id,
                )
                .first()
                is not None
            )
        finally:
            _close_db(db)

    is_participant = await asyncio.to_thread(_check)
    if not is_participant:
        await sio.emit("error", {"message": "Sem permissão"}, to=sid)
        return

    room = _room_name(conversation_id)
    await sio.enter_room(sid, room)
    session["rooms"] = session.get("rooms", set()) | {conversation_id}
    await sio.save_session(sid, session)


@sio.event
async def leave_room(sid, data):
    session = await sio.get_session(sid)
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    room = _room_name(conversation_id)
    await sio.leave_room(sid, room)
    rooms = session.get("rooms", set())
    rooms.discard(conversation_id)
    session["rooms"] = rooms
    await sio.save_session(sid, session)


@sio.event
async def send_message(sid, data):
    session = await sio.get_session(sid)
    user_id = session["user_id"]
    conversation_id = data.get("conversation_id")
    content = data.get("content", "").strip()

    if not conversation_id or not content:
        return

    content = bleach.clean(content, tags=[], strip=True)
    if not content:
        return

    if not await check_rate_limit(user_id):
        await sio.emit("error", {"message": "Muitas mensagens. Aguarde um momento."}, to=sid)
        return

    def _persist():
        db = _get_db()
        try:
            participant = (
                db.query(ChatParticipant)
                .filter(
                    ChatParticipant.conversation_id == conversation_id,
                    ChatParticipant.user_id == user_id,
                )
                .first()
            )
            if not participant:
                return None, []

            msg = ChatMessage(
                conversation_id=conversation_id,
                sender_id=user_id,
                content=content,
            )
            db.add(msg)
            db.commit()
            db.refresh(msg)

            sender = db.get(Usuario, user_id)
            all_participants = (
                db.query(ChatParticipant)
                .filter(ChatParticipant.conversation_id == conversation_id)
                .all()
            )
            participant_user_ids = [p.user_id for p in all_participants]

            return {
                "id": msg.id,
                "conversation_id": msg.conversation_id,
                "sender_id": msg.sender_id,
                "content": msg.content,
                "created_at": msg.created_at.isoformat(),
                "sender": {
                    "id": sender.id,
                    "nome": sender.nome,
                    "foto_url": sender.foto_url,
                    "localizacao": sender.localizacao,
                    "criado_em": sender.criado_em.isoformat(),
                },
            }, participant_user_ids
        finally:
            _close_db(db)

    result = await asyncio.to_thread(_persist)
    if result is None or result[0] is None:
        await sio.emit("error", {"message": "Sem permissão"}, to=sid)
        return

    msg_data, participant_ids = result
    room = _room_name(conversation_id)

    await sio.emit("new_message", msg_data, room=room)

    await refresh_online(user_id)

    for pid in participant_ids:
        if pid == user_id:
            continue
        for other_sid, other_user in _sid_to_user.items():
            if other_user["id"] == pid:
                other_session = await sio.get_session(other_sid)
                other_rooms = other_session.get("rooms", set())
                if conversation_id not in other_rooms:
                    await sio.emit(
                        "notification",
                        {
                            "type": "new_message",
                            "conversation_id": conversation_id,
                            "message_preview": content[:100],
                            "sender": msg_data["sender"],
                        },
                        to=other_sid,
                    )


@sio.event
async def typing_start(sid, data):
    session = await sio.get_session(sid)
    user_id = session["user_id"]
    user_data = _sid_to_user.get(sid, {})
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    room = _room_name(conversation_id)
    await sio.emit(
        "user_typing",
        {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "username": user_data.get("nome", ""),
        },
        room=room,
        skip_sid=sid,
    )


@sio.event
async def typing_stop(sid, data):
    session = await sio.get_session(sid)
    user_id = session["user_id"]
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    room = _room_name(conversation_id)
    await sio.emit(
        "user_stop_typing",
        {"conversation_id": conversation_id, "user_id": user_id},
        room=room,
        skip_sid=sid,
    )


@sio.event
async def mark_as_read(sid, data):
    session = await sio.get_session(sid)
    user_id = session["user_id"]
    conversation_id = data.get("conversation_id")
    if not conversation_id:
        return

    def _update():
        db = _get_db()
        try:
            participant = (
                db.query(ChatParticipant)
                .filter(
                    ChatParticipant.conversation_id == conversation_id,
                    ChatParticipant.user_id == user_id,
                )
                .first()
            )
            if not participant:
                return None

            now = datetime.now(timezone.utc)
            participant.last_read_at = now
            db.commit()
            return now.isoformat()
        finally:
            _close_db(db)

    read_until = await asyncio.to_thread(_update)
    if read_until is None:
        return

    room = _room_name(conversation_id)
    await sio.emit(
        "messages_read",
        {
            "conversation_id": conversation_id,
            "user_id": user_id,
            "read_until": read_until,
        },
        room=room,
    )


async def _notify_contacts_presence(user_id: int, online: bool):
    def _get_contact_ids():
        db = _get_db()
        try:
            my_convs = (
                db.query(ChatParticipant.conversation_id)
                .filter(ChatParticipant.user_id == user_id)
                .subquery()
            )
            contacts = (
                db.query(ChatParticipant.user_id)
                .filter(
                    ChatParticipant.conversation_id.in_(my_convs),
                    ChatParticipant.user_id != user_id,
                )
                .distinct()
                .all()
            )
            return [c[0] for c in contacts]
        finally:
            _close_db(db)

    contact_ids = await asyncio.to_thread(_get_contact_ids)
    event = "user_online" if online else "user_offline"

    for contact_id in contact_ids:
        for other_sid, other_user in _sid_to_user.items():
            if other_user["id"] == contact_id:
                await sio.emit(event, {"user_id": user_id}, to=other_sid)
