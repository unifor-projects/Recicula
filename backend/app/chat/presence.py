import time
from collections import defaultdict
from typing import Iterable

RATE_LIMIT = 30
RATE_WINDOW = 60

# user_id -> quantidade de sockets abertos.
#
# Contar conexões, em vez de guardar um timestamp de expiração, mantém o usuário
# online enquanto ele tiver ao menos uma aba aberta. O esquema anterior usava um
# TTL de 5 minutos que só era renovado ao enviar mensagem, então quem ficava
# conectado sem falar nada "expirava" e passava a constar como offline.
_connections: dict[int, int] = {}
_rate: dict[int, list[float]] = defaultdict(list)


async def add_connection(user_id: int) -> bool:
    """Registra um socket. Retorna True se o usuário acabou de ficar online."""
    _connections[user_id] = _connections.get(user_id, 0) + 1
    return _connections[user_id] == 1


async def remove_connection(user_id: int) -> bool:
    """Descarta um socket. Retorna True se o usuário acabou de ficar offline."""
    current = _connections.get(user_id, 0)
    if current <= 0:
        return False
    if current > 1:
        _connections[user_id] = current - 1
        return False
    del _connections[user_id]
    return True


async def is_online(user_id: int) -> bool:
    return user_id in _connections


async def online_among(user_ids: Iterable[int]) -> list[int]:
    """Filtra os que estão online. Usado no sync de presença logo após conectar."""
    return [user_id for user_id in user_ids if user_id in _connections]


async def check_rate_limit(user_id: int) -> bool:
    now = time.monotonic()
    window_start = now - RATE_WINDOW
    _rate[user_id] = [t for t in _rate[user_id] if t > window_start]
    if len(_rate[user_id]) >= RATE_LIMIT:
        return False
    _rate[user_id].append(now)
    return True
