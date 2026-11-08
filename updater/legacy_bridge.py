"""BOLO INPEK Updater — bridge untuk script Python lama yang tersimpan LOKAL.

Koneksi VPN tetap manual. Script scraper menggunakan satu akun SSO bersama
yang telah diberi akses oleh pengelola survei. Kredensial akun bersama dibaca
dari .env LOKAL di PC operator seperti pada scraper asli, bukan dimasukkan ke
kode sumber / EXE / GitHub publik. OTP atau verifikasi tambahan tetap manual.
"""
from __future__ import annotations

import builtins
import importlib.util
import json
import os
from pathlib import Path
import sys
from typing import Callable

ALLOWED_ENV_KEYS = (
    "GOOGLE_SPREADSHEET_ID",
    "GOOGLE_CREDENTIALS_FILE",
    "TINDAK_LANJUT_SPREADSHEET_ID",
)


def check_files(script: Path, *, require_config: bool = True) -> list[str]:
    problems: list[str] = []
    script = Path(script).expanduser().resolve()
    if script.suffix.lower() != ".py" or not script.is_file():
        return ["Pilih file Python scraper BOLO INPEK (.py) yang tepercaya."]
    if not script.name.startswith("ambil_data_monitoring_inpek"):
        problems.append("Nama scraper bukan ambil_data_monitoring_inpek*.py.")
    config_file = script.parent / "config_survei.json"
    if require_config and not config_file.is_file():
        problems.append("config_survei.json belum ada di folder script.")
    elif require_config:
        try:
            data = json.loads(config_file.read_text(encoding="utf-8-sig"))
            surveys = data.get("surveys", []) if isinstance(data, dict) else []
            if not isinstance(surveys, list) or not surveys:
                problems.append("Daftar surveys pada config_survei.json kosong/tidak valid.")
            else:
                required = (
                    "code", "name", "survey_id", "survey_period_id",
                    "role_pencacah_id", "role_pengawas_id", "nama_assignment_field"
                )
                keys = set()
                for index, survey in enumerate(surveys, start=1):
                    if not isinstance(survey, dict) or any(
                        not isinstance(survey.get(k), str) or not survey[k].strip()
                        for k in required
                    ):
                        problems.append(
                            f"Survei nomor {index} belum memiliki seluruh ID dan field FASIH."
                        )
                        continue
                    key = survey["name"].strip().casefold()
                    if key in keys:
                        problems.append("Ada nama survei ganda pada config_survei.json.")
                    keys.add(key)
        except (ValueError, OSError, UnicodeError):
            problems.append("config_survei.json tidak dapat dibaca sebagai JSON valid.")
    environment = script.parent / ".env"
    if not environment.is_file():
        problems.append("File .env untuk ID Google Sheets belum ada.")
    else:
        try:
            from dotenv import dotenv_values
            values = dotenv_values(environment)
            if not values.get("GOOGLE_SPREADSHEET_ID"):
                problems.append("GOOGLE_SPREADSHEET_ID belum dikonfigurasi.")
            if not (values.get("FASIH_USERNAME") or "").strip():
                problems.append("Username akun SSO bersama belum diisi di .env lokal.")
            if not (values.get("FASIH_PASSWORD") or "").strip():
                problems.append("Password akun SSO bersama belum diisi di .env lokal.")
            creds = values.get("GOOGLE_CREDENTIALS_FILE", "credentials.json")
            if not (script.parent / creds).is_file():
                problems.append("File kredensial Google Sheets lokal belum ditemukan.")
        except Exception:
            problems.append("Berkas konfigurasi tidak dapat diperiksa.")
    return problems


def _load_safe_environment(script_dir: Path) -> None:
    from dotenv import dotenv_values

    values = dotenv_values(script_dir / ".env")
    for key in ALLOWED_ENV_KEYS:
        val = values.get(key)
        if val is not None:
            os.environ[key] = val

    # Username/password SSO tetap dibaca oleh fungsi baca_pengaturan()
    # pada scraper asli, langsung dari .env lokal.
    # Jangan menyalin nilai tersebut ke log, database, ataupun kode GitHub.


def run_legacy_scraper(script: Path, log: Callable[[str], None]) -> None:
    """Menjalankan fungsi main() dari scraper asli dengan akun SSO bersama.

    VPN manual tetap diperlukan. Kredensial SSO dari .env lokal dipakai oleh
    alur login bawaan scraper setelah operator menekan tombol Perbarui.
    Verifikasi tambahan jika ada tetap dilakukan oleh manusia di Chrome.
    Tidak ada cookie atau password yang dikirim antar komputer.
    """
    script = Path(script).expanduser().resolve()
    errors = check_files(script)
    if errors:
        raise RuntimeError("Persiapan belum lengkap:\n" + "\n".join(errors))

    _load_safe_environment(script.parent)

    class LogWriter:
        encoding = "utf-8"
        def write(self, data):
            if data and data.strip():
                for line in str(data).splitlines():
                    if line.strip():
                        log(line.rstrip())
            return len(data)
        def flush(self):
            pass

    # Muat modul lokal tanpa mengeksekusi blok __main__. Login tetap
    # memakai fungsi asli, bukan akun operator yang berganti-ganti.
    spec = importlib.util.spec_from_file_location("bolo_operator_scraper", str(script))
    if spec is None or spec.loader is None:
        raise RuntimeError("File Python scraper tidak dapat dibuka.")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module

    previous_path = list(sys.path)
    old_stdout = sys.stdout
    old_stderr = sys.stderr
    old_input = builtins.input
    try:
        sys.path.insert(0, str(script.parent))
        sys.stdout = sys.stderr = LogWriter()
        spec.loader.exec_module(module)

        if not all(hasattr(module, name) for name in (
            "main", "baca_pengaturan", "login_sso_eksternal",
            "tunggu_login_berhasil"
        )):
            raise RuntimeError(
                "Versi scraper belum dikenali. Periksa kesesuaiannya "
                "sebelum menjalankan update."
            )

        # Pertahankan baca_pengaturan() dan login_sso_eksternal() asli:
        # keduanya memakai akun SSO bersama dari .env lokal secara konsisten.
        # Pengguna tetap menghubungkan VPN sendiri, dan dapat menyelesaikan
        # MFA/OTP jika sistem SSO memintanya.

        # Versi lama mengunci ChromeDriver ke versi tertentu.
        # Pada PC lain, biarkan undetected-chromedriver mendeteksi versi Chrome.
        if hasattr(module, "uc"):
            def buka_chrome_otomatis():
                print("[*] Membuka Chrome sesuai versi yang terpasang...")
                options = module.uc.ChromeOptions()
                options.add_argument("--start-maximized")
                options.add_argument("--disable-notifications")
                options.add_argument("--disable-popup-blocking")
                driver = module.uc.Chrome(
                    options=options,
                    use_subprocess=False,
                    version_main=None,
                )
                driver.set_page_load_timeout(90)
                return driver
            module.buka_chrome = buka_chrome_otomatis

        original_wait = module.tunggu_login_berhasil
        def wait_manual(driver, timeout=90):
            return original_wait(driver, timeout=max(timeout, 300))
        module.tunggu_login_berhasil = wait_manual

        # Script lama meminta input konsol hanya pada jalur error;
        # aplikasi tanpa terminal tidak boleh hang di situ.
        builtins.input = lambda _prompt="": ""

        log("Menjalankan scraping menggunakan akun SSO bersama yang dikonfigurasi di PC ini...")
        module.main()
        log("Scraping selesai. Periksa status Google Sheets di dashboard.")
    except SystemExit as exc:
        if exc.code not in (0, None):
            raise RuntimeError("Scraper dihentikan karena terjadi kesalahan.") from exc
    finally:
        builtins.input = old_input
        sys.stdout = old_stdout
        sys.stderr = old_stderr
        sys.path[:] = previous_path
        sys.modules.pop(spec.name, None)
