"""alter_fk_decisoes_anuncio_id

Revision ID: d0d64199b086
Revises: 0010
Create Date: 2026-06-07 19:39:25.676784

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd0d64199b086'
down_revision: Union[str, Sequence[str], None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(
        "decisoes_administrativas_anuncio_id_fkey",
        "decisoes_administrativas",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "decisoes_administrativas_anuncio_id_fkey",
        "decisoes_administrativas",
        "anuncios",
        ["anuncio_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "decisoes_administrativas_anuncio_id_fkey",
        "decisoes_administrativas",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "decisoes_administrativas_anuncio_id_fkey",
        "decisoes_administrativas",
        "anuncios",
        ["anuncio_id"],
        ["id"],
        ondelete="RESTRICT",
    )
