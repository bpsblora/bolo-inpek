"""Chrome-only FASIH reachability using Selenium UC on a VPN-connected PC.

The updater intentionally uses Google Chrome + undetected_chromedriver for
FASIH checks, SSO and scraping, independently of the Windows default browser.
TLS validation and official-BPS-host checks remain mandatory.
"""
from __future__ import annotations

from urllib.parse import urlsplit
from time import monotonic, sleep
from typing import Callable

FASIH_URL = "https://fasih-sm.bps.go.id/app"
FASIH_HOST = "fasih-sm.bps.go.id"
CHROME_BROWSER = "Google Chrome"
SUPPORTED_BROWSERS = (CHROME_BROWSER,)
BROWSER_CHOICES = SUPPORTED_BROWSERS


class FasihBrowserError(RuntimeError):
    """Gagal menggunakan Google Chrome untuk FASIH."""


def resolve_browser(browser: str) -> str:
    """Fail closed: no Windows-default, Firefox, or Edge fallback for FASIH."""
    if browser != CHROME_BROWSER:
        raise FasihBrowserError(
            "BOLO INPEK Updater hanya mendukung Google Chrome + UC ChromeDriver "
            "untuk FASIH. Browser lain tidak dapat dipakai."
        )
    return CHROME_BROWSER


def open_fasih_browser(
    browser: str = CHROME_BROWSER, *, diagnostic: bool = False,
    on_progress: Callable[[str], None] | None = None,
):
    """Start Chrome with UC's subprocess launcher and automatic version match."""
    browser = resolve_browser(browser)
    report = on_progress or (lambda _message: None)
    driver = None
    report("Menyiapkan Google Chrome + UC ChromeDriver...")
    try:
        import undetected_chromedriver as uc
        options = uc.ChromeOptions()
        options.page_load_strategy = "none" if diagnostic else "eager"
        options.add_argument("--start-maximized")
        options.add_argument("--disable-notifications")
        report("Menjalankan Chrome melalui UC (deteksi versi otomatis)...")
        driver = uc.Chrome(
            options=options, use_subprocess=True, version_main=None,
        )
        driver.set_page_load_timeout(50)
        report("Google Chrome + UC berhasil dijalankan.")
        return driver
    except Exception as exc:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
        raise FasihBrowserError(
            "Google Chrome + UC tidak dapat dijalankan ("
            + type(exc).__name__ + "). Pastikan Google Chrome terpasang, "
            "tidak sedang gagal memulai, dan VPN BPS terhubung. "
            "Lihat Riwayat Proses untuk tahap terakhir."
        ) from exc


def verify_fasih_in_browser(
    browser: str,
    *,
    driver_factory=None,
    on_progress: Callable[[str], None] | None = None,
    timeout_seconds: float = 25,
) -> str:
    """Check the Chrome HTTPS FASIH login page without logging into SSO.

    A valid BPS HTTPS hostname and rendered OAuth page must be confirmed.
    A browser opening without the official login page is never success.
    """
    browser = resolve_browser(browser)
    driver = None
    report = on_progress or (lambda _message: None)
    try:
        report("Menjalankan " + browser + " melalui Selenium...")
        driver = (
            driver_factory(browser) if driver_factory is not None
            else open_fasih_browser(
                browser, diagnostic=True, on_progress=report,
            )
        )
        try:
            driver.set_script_timeout(8)
        except AttributeError:
            pass
        report("Browser terbuka; memeriksa halaman login FASIH...")
        driver.get(FASIH_URL)
        deadline = monotonic() + timeout_seconds
        last_host = ""
        while monotonic() < deadline:
            current = str(driver.current_url or "")
            address = urlsplit(current)
            host = (address.hostname or "").lower()
            approved = (
                address.scheme == "https"
                and host in (
                    FASIH_HOST, "sso.bps.go.id", "sso-eksternal.bps.go.id"
                )
            )
            if host == FASIH_HOST and address.scheme == "http":
                raise FasihBrowserError(
                    "Browser diarahkan ke FASIH non-HTTPS. Pemeriksaan dibatalkan."
                )
            if approved:
                last_host = host
                # FASIH routes /app to its own official OAuth landing page.
                # Loading assets can delay innerText/readyState; confirm the
                # exact HTTPS hostname/path AND an independently readable page
                # title; never accept a URL alone or an arbitrary BPS-like site.
                if (host == FASIH_HOST
                    and address.path.lower().rstrip("/") == "/oauth_login.html"):
                    try:
                        title = str(driver.title or "").casefold()
                    except Exception:
                        title = ""
                    if "fasih" in title or "badan pusat statistik" in title:
                        report(
                            "Halaman OAuth FASIH resmi terverifikasi dari "
                            "alamat HTTPS dan judul tab melalui " + browser + "."
                        )
                        return browser

                try:
                    state = driver.execute_script("return document.readyState")
                    page_text = driver.execute_script(
                        "return (document.body && "
                        "(document.body.innerText || document.body.textContent) "
                        "|| '').slice(0, 4000)"
                    )
                    if state in ("interactive", "complete") and isinstance(page_text, str):
                        lowered = page_text.lower()
                        if any(needle in lowered for needle in (
                            "login sso", "badan pusat statistik",
                            "masuk", "sign in", "username", "password",
                        )):
                            report("Halaman login resmi BPS berhasil dimuat melalui " + browser + ".")
                            return browser
                except Exception:
                    # The page may be transitioning between FASIH and BPS SSO.
                    # Do not declare success until page evidence is verified.
                    pass
            elif address.scheme in ("http", "https") and host not in ("", FASIH_HOST):
                raise FasihBrowserError(
                    "Browser diarahkan ke domain di luar FASIH/SSO resmi BPS. "
                    "Pemeriksaan dibatalkan."
                )
            sleep(0.5)
        if last_host:
            raise FasihBrowserError(
                browser + " membuka host BPS, tetapi halaman login belum dapat "
                "dikonfirmasi siap dalam " + str(int(timeout_seconds)) + " detik. "
                "Periksa Riwayat Proses dan kondisi Chrome UC."
            )
        raise FasihBrowserError(
            browser + " terbuka, tetapi tidak mencapai halaman HTTPS FASIH/SSO "
            "resmi dalam " + str(int(timeout_seconds)) + " detik."
        )
    except FasihBrowserError:
        raise
    except Exception as exc:
        from selenium.common.exceptions import TimeoutException
        if isinstance(exc, TimeoutException):
            message = (
                browser + " gagal menyelesaikan navigasi FASIH tepat waktu "
                "meskipun browser mungkin terlihat terbuka."
            )
        else:
            message = (
                browser + " gagal memeriksa FASIH melalui Selenium ("
                + type(exc).__name__ + "). Periksa driver browser, VPN BPS, "
                "proxy dan sertifikat HTTPS."
            )
        raise FasihBrowserError(message) from exc
    finally:
        if driver is not None:
            report("Menutup Chrome khusus pemeriksaan (normal setelah tes)...")
            try:
                driver.quit()
            except Exception:
                pass
