"""Read-only SSO authentication check for the internal FASIH scraper.

Only calls the original scraper's three browser-login functions; never calls
main(), any FASIH API, Google/Firebase code, or a Sheets write. It validates
the script location and FASIH target before creating a session.
"""
from __future__ import annotations

from contextlib import redirect_stdout, redirect_stderr
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from typing import Callable
from urllib.parse import urlsplit
from time import monotonic, sleep
import io
import sys

from browser_driver import FASIH_HOST, open_fasih_browser, resolve_browser
from legacy_bridge import check_files


class SSOTestError(RuntimeError):
    """Login diagnostik belum selesai atau tidak berhasil."""


class _PrivateStdout(io.TextIOBase):
    """Discard scraper stdout (including any redirected URL/token or secrets)."""

    def write(self, data: str) -> int:
        return len(data)

    def flush(self):
        pass


SSO_LOGIN_HOSTS = frozenset(("sso.bps.go.id", "sso-eksternal.bps.go.id"))


def _wait_for_official_sso_redirect(driver, *, timeout_seconds: float = 45.0) -> None:
    """Never send credentials to an unapproved or non-HTTPS login page."""
    deadline = monotonic() + timeout_seconds
    last_official_host = None
    while monotonic() < deadline:
        # SSO is sometimes opened in a new tab. Check each existing tab
        # while preserving a single chosen WebDriver session.
        try:
            handles = list(driver.window_handles)
        except (AttributeError, TypeError):
            handles = []
        if len(handles) > 1:
            for handle in reversed(handles):
                try:
                    driver.switch_to.window(handle)
                    active = urlsplit(str(driver.current_url or ""))
                    if (
                        active.scheme == "https"
                        and (active.hostname or "").lower() in SSO_LOGIN_HOSTS
                    ):
                        return
                except Exception:
                    continue
        location = urlsplit(str(driver.current_url or ""))
        host = (location.hostname or "").lower()
        if location.scheme == "https" and host in SSO_LOGIN_HOSTS:
            return
        if location.scheme and location.scheme != "https":
            raise SSOTestError("SSO tidak menggunakan HTTPS. Login dihentikan.")
        if host and host != FASIH_HOST and host not in SSO_LOGIN_HOSTS:
            if host.endswith(".bps.go.id"):
                raise SSOTestError(
                    "Halaman SSO memakai subdomain BPS yang belum dikenali "
                    "oleh aplikasi (" + host + "). Pengiriman password "
                    "dihentikan sampai domain dikonfirmasi."
                )
            raise SSOTestError(
                "Browser keluar dari domain login SSO resmi BPS. "
                "Akun tidak dikirim ke halaman tersebut."
            )
        sleep(0.25)
    raise SSOTestError(
        "Redirect ke SSO resmi BPS belum terdeteksi. "
        "Pastikan tombol SSO Eksternal benar-benar membuka halaman login."
    )


def test_sso_login(
    script: Path, browser: str, username: str, password: str,
    report: Callable[[str], None],
    *,
    browser_factory: Callable[[str], object] | None = None,
) -> None:
    """Login once to authorized SSO, confirm FASIH, close ephemeral browser.

    Password is held only while the test runs; it is never written to .env,
    logs, ZIP, Google Sheets, Firebase, or the scraper module.
    """
    script = Path(script).expanduser().resolve()
    errors = check_files(
        script, require_config=False, require_google_credentials=False,
        require_sso_env=False,
    )
    if errors:
        raise SSOTestError("Script FASIH belum siap untuk pengujian.")
    if not username.strip() or not password:
        raise SSOTestError("Isi email/username dan password SSO pada aplikasi.")

    try:
        browser = resolve_browser(browser)
    except Exception as exc:
        raise SSOTestError("Browser FASIH belum dipilih secara benar.") from exc

    spec = spec_from_file_location("bolo_sso_diagnostic_readonly", str(script))
    if spec is None or spec.loader is None:
        raise SSOTestError("Script FASIH tidak dapat dibaca.")
    mod = module_from_spec(spec)
    driver = None
    stage = "Memuat komponen scraper"
    original_path = list(sys.path)
    output = _PrivateStdout()
    try:
        sys.path.insert(0, str(script.parent))
        # Importing the internal module does not execute its __main__ block.
        # No call to module.main() is permitted in this diagnostic.
        with redirect_stdout(output), redirect_stderr(output):
            spec.loader.exec_module(mod)
        target = urlsplit(str(getattr(mod, "FASIH_URL", "")))
        if target.scheme != "https" or target.hostname != FASIH_HOST:
            raise SSOTestError("Script tidak menggunakan portal HTTPS FASIH resmi.")
        for name in (
            "klik_sso_eksternal", "login_sso_eksternal", "tunggu_login_berhasil",
        ):
            if not callable(getattr(mod, name, None)):
                raise SSOTestError("Versi script belum mendukung uji SSO terpisah.")

        stage = "Membuka browser untuk SSO"
        report("Membuka " + browser + " untuk uji SSO FASIH (tanpa scraping)...")
        driver = (
            browser_factory(browser) if browser_factory is not None
            else open_fasih_browser(
                browser, diagnostic=True, on_progress=report,
            )
        )
        driver.set_page_load_timeout(50)
        with redirect_stdout(output), redirect_stderr(output):
            stage = "Mencari dan mengeklik tombol SSO Eksternal"
            report("[SSO 1/4] Mencari tombol SSO Eksternal pada halaman FASIH...")
            mod.klik_sso_eksternal(driver)
            stage = "Memeriksa domain HTTPS login SSO"
            report("[SSO 2/4] Memastikan pengalihan ke domain HTTPS SSO resmi BPS...")
            _wait_for_official_sso_redirect(driver)
            stage = "Mengisi dan mengirim formulir login SSO"
            report("[SSO 3/4] Mengisi formulir akun SSO Eksternal...")
            mod.login_sso_eksternal(driver, username, password)
            stage = "Menunggu autentikasi dan kembali ke FASIH"
            report("[SSO 4/4] Menunggu autentikasi SSO dan kembali ke FASIH...")
            success = mod.tunggu_login_berhasil(driver, timeout=120)
        if success is not True:
            raise SSOTestError("SSO belum memberikan konfirmasi login berhasil.")
        current = urlsplit(str(driver.current_url or ""))
        if current.scheme != "https" or current.hostname != FASIH_HOST:
            raise SSOTestError("Login belum kembali ke alamat HTTPS FASIH resmi.")
        report("Login SSO FASIH berhasil. Memeriksa cookie sesi untuk API (tanpa jaringan)...")
        session_builder = getattr(mod, "buat_session_dari_chrome", None)
        if callable(session_builder):
            api_session = None
            try:
                with redirect_stdout(output), redirect_stderr(output):
                    api_session = session_builder(driver)
                api_session.verify = True
                cookie_jar = getattr(api_session, "cookies", None)
                if cookie_jar is None or not len(cookie_jar):
                    raise SSOTestError(
                        "Login SSO berhasil, tetapi cookie sesi FASIH belum "
                        "tersedia di browser. Akses API belum siap."
                    )
                report(
                    "Cookie sesi FASIH ditemukan lewat " + browser
                    + ". Pemeriksaan API hanya sampai persiapan sesi; "
                    "tidak ada permintaan API atau scraping."
                )
            finally:
                if api_session is not None:
                    try:
                        api_session.close()
                    except Exception:
                        pass
        else:
            report("Versi scraper belum menyediakan pembuat sesi API; pemeriksaan cookie dilewati.")
        report("Login SSO FASIH berhasil. Tidak ada scraping atau perubahan Sheets.")
    except Exception as exc:
        # Do not show raw exception text or URL: they could include
        # username, password, authorization codes, or proxy credentials.
        safe_kind = type(exc).__name__
        if isinstance(exc, SSOTestError):
            message = str(exc)
        elif stage == "Mencari dan mengeklik tombol SSO Eksternal":
            message = (
                "Tombol SSO Eksternal tidak dapat dipilih otomatis ("
                + safe_kind + "). Pastikan halaman FASIH benar-benar tampil. "
                "Tombol ini hanya mendukung akun SSO Eksternal, bukan SSO BPS pegawai."
            )
        elif stage == "Memeriksa domain HTTPS login SSO":
            message = (
                "SSO Eksternal belum mengalihkan browser ke domain login resmi BPS "
                "(" + safe_kind + "). Periksa halaman yang terlihat di browser."
            )
        elif stage == "Mengisi dan mengirim formulir login SSO":
            message = (
                "Formulir SSO Eksternal tidak dapat diisi atau dikirim otomatis "
                "(" + safe_kind + "). Periksa apakah muncul CAPTCHA/MFA "
                "atau halaman login berubah."
            )
        elif stage == "Menunggu autentikasi dan kembali ke FASIH":
            message = (
                "Login SSO belum kembali ke FASIH (" + safe_kind + "). "
                "Periksa apakah akun SSO Eksternal benar, diminta OTP/MFA, "
                "atau tidak memiliki izin FASIH-SM."
            )
        else:
            message = "Uji SSO gagal saat menyiapkan browser (" + safe_kind + ")."
        report("Pemeriksaan SSO berhenti pada tahap: " + stage + ".")
        raise SSOTestError(message) from None
    finally:
        sys.path[:] = original_path
        if driver is not None:
            report("Menutup sesi Firefox/Edge/Chrome untuk uji login SSO...")
            try:
                driver.quit()
            except Exception:
                pass
