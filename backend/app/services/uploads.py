from pathlib import Path
from urllib.parse import urlparse

from app.models.anuncio import AnuncioImagem

ANUNCIO_IMAGES_DIR = Path(__file__).resolve().parents[2] / "uploads" / "anuncios"
ANUNCIO_IMAGES_DIR.mkdir(parents=True, exist_ok=True)


def delete_image_files(imagens: list[AnuncioImagem]) -> None:
    for img in imagens:
        path = urlparse(img.url).path
        prefix = "/uploads/anuncios/"
        if not path.startswith(prefix):
            continue
        file_path = (ANUNCIO_IMAGES_DIR / path.removeprefix(prefix)).resolve()
        try:
            file_path.relative_to(ANUNCIO_IMAGES_DIR.resolve())
        except ValueError:
            continue
        if file_path.is_file():
            file_path.unlink()
