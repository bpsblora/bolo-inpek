"""Interprocess mutex untuk BOLO INPEK Updater pada satu PC.

Tidak mencegah dua PC berbeda memperbarui Sheets bersama-sama. Untuk itu,
koordinasikan operator (atau siapkan lock global di server sebelum produksi).
"""
from contextlib import contextmanager
from pathlib import Path
import os


class UpdaterAlreadyRunning(RuntimeError):
    pass


@contextmanager
def local_update_lock(script_dir: Path):
    path = Path(script_dir) / ".bolo-updater.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+b") as file:
        try:
            file.seek(0)
            file.write(b"x")
            file.flush()
            file.seek(0)
            if os.name == "nt":
                import msvcrt
                try:
                    msvcrt.locking(file.fileno(), msvcrt.LK_NBLCK, 1)
                except OSError as exc:
                    raise UpdaterAlreadyRunning(
                        "Updater sedang berjalan di komputer ini."
                    ) from exc
            else:
                import fcntl
                try:
                    fcntl.flock(file.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError as exc:
                    raise UpdaterAlreadyRunning(
                        "Updater sedang berjalan di komputer ini."
                    ) from exc
            yield
        finally:
            try:
                file.seek(0)
                if os.name == "nt":
                    import msvcrt
                    msvcrt.locking(file.fileno(), msvcrt.LK_UNLCK, 1)
                else:
                    import fcntl
                    fcntl.flock(file.fileno(), fcntl.LOCK_UN)
            except OSError:
                pass
