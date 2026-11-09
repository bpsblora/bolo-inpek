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
from urllib.parse import urlsplit
from pathlib import Path
import sys
from typing import Callable

ALLOWED_ENV_KEYS = (
    "GOOGLE_SPREADSHEET_ID",
    "GOOGLE_CREDENTIALS_FILE",
    "TINDAK_LANJUT_SPREADSHEET_ID",
)


def check_files(
    script: Path, *, require_config: bool = True,
    require_google_credentials: bool = True, require_sso_env: bool = True
) -> list[str]:
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
    if require_google_credentials and not environment.is_file():
        problems.append("File .env untuk ID Google Sheets belum ada (mode Lokal).")
    elif require_sso_env and not environment.is_file():
        problems.append("File .env untuk akun SSO belum ada (mode lama).")
    elif environment.is_file():
        try:
            from dotenv import dotenv_values
            values = dotenv_values(environment)
            if require_google_credentials and not values.get("GOOGLE_SPREADSHEET_ID"):
                problems.append("GOOGLE_SPREADSHEET_ID belum dikonfigurasi.")
            if require_sso_env and not (values.get("FASIH_USERNAME") or "").strip():
                problems.append("Username akun SSO bersama belum diisi di .env lokal.")
            if require_sso_env and not (values.get("FASIH_PASSWORD") or "").strip():
                problems.append("Password akun SSO bersama belum diisi di .env lokal.")
            if require_google_credentials:
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


def run_legacy_scraper(
    script: Path, log: Callable[[str], None], *,
    authorized_client=None, spreadsheet_targets: dict | None = None,
    sso_credentials: tuple[str, str] | None = None,
    browser: str | None = None
) -> None:
    """Menjalankan fungsi main() dari scraper asli dengan akun SSO bersama.

    VPN manual tetap diperlukan. Kredensial SSO dari .env lokal dipakai oleh
    alur login bawaan scraper setelah operator menekan tombol Perbarui.
    Verifikasi tambahan jika ada tetap dilakukan oleh manusia di Chrome.
    Tidak ada cookie atau password yang dikirim antar komputer.
    """
    script = Path(script).expanduser().resolve()
    errors = check_files(
        script,
        require_google_credentials=(authorized_client is None),
        require_sso_env=(sso_credentials is None),
    )
    if sso_credentials is not None and (
        not isinstance(sso_credentials, tuple)
        or len(sso_credentials) != 2
        or not all(isinstance(v, str) and v.strip() for v in sso_credentials)
    ):
        raise RuntimeError("Masukkan email dan password SSO FASIH melalui aplikasi.")
    if errors:
        raise RuntimeError("Persiapan belum lengkap:\n" + "\n".join(errors))

    _load_safe_environment(script.parent)
    previous_ids = {
        key: os.environ.get(key) for key in (
            "GOOGLE_SPREADSHEET_ID", "TINDAK_LANJUT_SPREADSHEET_ID",
            "GOOGLE_CREDENTIALS_FILE"
        )
    }
    if authorized_client is not None:
        if not spreadsheet_targets:
            raise RuntimeError("Tujuan Google Sheets dari Firebase belum tersedia.")
        os.environ["GOOGLE_SPREADSHEET_ID"] = spreadsheet_targets["monitoring_id"]
        os.environ["TINDAK_LANJUT_SPREADSHEET_ID"] = spreadsheet_targets["tindak_lanjut_id"]
        # Nama ini hanya indikator untuk API lama; tidak berisi kunci.
        os.environ["GOOGLE_CREDENTIALS_FILE"] = "google-operator-oauth.txt"

    # Pesan error dari library pihak ketiga dapat tanpa sengaja memuat nilai
    # autentikasi. Redaksi dilakukan sebelum masuk ke konsol UI.
    from dotenv import dotenv_values
    private_values = dotenv_values(script.parent / ".env") if (
        script.parent / ".env"
    ).exists() else {}
    redact = [
        value for name in ("FASIH_USERNAME", "FASIH_PASSWORD")
        if isinstance((value := private_values.get(name)), str) and len(value) >= 4
    ]
    if sso_credentials is not None:
        redact.extend(v for v in sso_credentials if len(v) >= 4)

    class LogWriter:
        encoding = "utf-8"
        def write(self, data):
            if data and data.strip():
                for line in str(data).splitlines():
                    if line.strip():
                        safe = line.rstrip()
                        for secret in redact:
                            safe = safe.replace(secret, "[RAHASIA]")
                        log(safe)
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

        if sso_credentials is not None:
            # Data login diambil langsung dari form EXE. Scraper tidak perlu
            # membaca/menulis .env untuk akun SSO, dan password tidak dicetak.
            def baca_pengaturan_form():
                if authorized_client is not None:
                    os.environ["GOOGLE_SPREADSHEET_ID"] = spreadsheet_targets["monitoring_id"]
                    os.environ["TINDAK_LANJUT_SPREADSHEET_ID"] = spreadsheet_targets["tindak_lanjut_id"]
                print("[✓] Akun SSO diterima dari aplikasi, tanpa disimpan ke file.")
                return sso_credentials
            module.baca_pengaturan = baca_pengaturan_form

        if authorized_client is not None:
            if sso_credentials is None:
                # Kompatibilitas dengan mode lama yang masih membaca .env.
                original_baca_pengaturan = module.baca_pengaturan
                def baca_pengaturan_operator():
                    username, password = original_baca_pengaturan()
                    os.environ["GOOGLE_SPREADSHEET_ID"] = spreadsheet_targets["monitoring_id"]
                    os.environ["TINDAK_LANJUT_SPREADSHEET_ID"] = spreadsheet_targets["tindak_lanjut_id"]
                    return username, password
                module.baca_pengaturan = baca_pengaturan_operator

            # Ganti backend autentikasi gspread untuk seluruh fungsi scraper,
            # TANPA menyalin private key Google ke PC operator.
            original_gspread = module.gspread
            class OperatorGspread:
                def service_account(self, filename=None):
                    return authorized_client
                def __getattr__(self, key):
                    return getattr(original_gspread, key)
            module.gspread = OperatorGspread()
            # Script lama memeriksa keberadaan credentials.json saat membaca
            # db_petugas. Pengganti ini memakai client OAuth dalam memori.
            def baca_nama_operator_oauth():
                log("Membaca direktori petugas melalui login Google operator...")
                worksheet = authorized_client.open_by_key(
                    spreadsheet_targets["monitoring_id"]
                ).worksheet("db_petugas")
                database_nama = {}
                for baris in worksheet.get_all_records():
                    email = str(baris.get("email") or "").strip().lower()
                    nama = str(baris.get("nama") or "").strip()
                    if email and nama:
                        database_nama[email] = nama
                return database_nama
            module.baca_database_nama_petugas = baca_nama_operator_oauth

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

        # Pertahankan kontrak scraper lama (buka_chrome), tetapi WebDriver
        # dapat memakai Edge atau Firefox tanpa mengubah script internal.
        # Default browser dipilih pada EXE. Mode bridge lama tetap kompatibel.
        if browser is not None:
            from browser_driver import open_fasih_browser, resolve_browser
            selected_browser = resolve_browser(browser)
            def buka_browser_operator():
                log("Menyiapkan browser scraping " + selected_browser + "...")
                driver = open_fasih_browser(
                    selected_browser,
                    on_progress=lambda text: log(str(text)),
                )
                driver.set_page_load_timeout(90)
                return driver
            module.buka_chrome = buka_browser_operator
        elif hasattr(module, "uc"):
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

        # Script lama melewati pemeriksaan sertifikat HTTPS.
        # Paksa sesi API berbasis cookie memakai verifikasi CA/TLS.
        if hasattr(module, "buat_session_dari_chrome"):
            original_session = module.buat_session_dari_chrome
            def verified_session(driver):
                session = original_session(driver)
                # Generic WebDriver APIs (navigator.userAgent/get_cookies)
                # work with Chrome UC, Firefox GeckoDriver, and EdgeDriver.
                # Cookies stay in process memory; never expose their values.
                session.verify = True
                if browser is not None:
                    cookie_jar = getattr(session, "cookies", None)
                    if cookie_jar is not None:
                        try:
                            count = len(cookie_jar)
                        except TypeError:
                            count = None
                        if count == 0:
                            try:
                                session.close()
                            except Exception:
                                pass
                            raise RuntimeError(
                                "Sesi FASIH belum menghasilkan cookie autentikasi "
                                "untuk API. Login mungkin belum selesai. "
                                "Pengambilan data dibatalkan."
                            )
                        if count is not None:
                            print(
                                "[✓] Cookie sesi API berhasil diambil dari "
                                + browser + " (" + str(count) + " cookie)."
                            )
                print("[✓] Verifikasi sertifikat HTTPS diaktifkan untuk FASIH.")
                return session
            module.buat_session_dari_chrome = verified_session

        if hasattr(module, "cek_koneksi_fasih") and hasattr(module, "FASIH_URL"):
            # Jangan mengizinkan fallback lama ketika cek VPN gagal.
            # Gagal menjangkau FASIH -> batal sebelum Chrome/login SSO.
            from fasih_access import verify_fasih_access, FASIH_HOST
            original_url = str(module.FASIH_URL)
            parsed_url = urlsplit(original_url)
            if parsed_url.scheme != "https" or parsed_url.hostname != FASIH_HOST:
                raise RuntimeError("Domain FASIH pada script tidak sesuai domain resmi.")
            def strict_fasih_check():
                print("[*] Pemeriksaan ulang portal FASIH sebelum login SSO...")
                if browser is not None:
                    from browser_driver import verify_fasih_in_browser
                    verify_fasih_in_browser(browser)
                else:
                    verify_fasih_access(url=original_url)
                print("[✓] Portal FASIH terjangkau melalui koneksi saat ini.")
                return True
            module.cek_koneksi_fasih = strict_fasih_check

        # Script lama meminta input konsol hanya pada jalur error;
        # aplikasi tanpa terminal tidak boleh hang di situ.
        builtins.input = lambda _prompt="": ""

        log("Menjalankan scraping menggunakan akun SSO yang dimasukkan di aplikasi...")
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
        for key, value in previous_ids.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
