"""Browser-based FASIH reachability for Windows VPN connections.

Some office networks route Edge/Firefox differently from Python requests and
Chrome. This module tests the actual selected browser, not an unauthenticated
Python HTTP request. It never bypasses TLS checks or VPN requirements.
"""
from __future__ import annotations

from urllib.parse import urlsplit

FASIH_URL = "https://fasih-sm.bps.go.id/app"
FASIH_HOST = "fasih-sm.bps.go.id"
BROWSER_CHOICES = ("Microsoft Edge", "Mozilla Firefox", "Google Chrome")


class FasihBrowserError(RuntimeError):
    """Tidak dapat membuka FASIH dengan browser yang dipilih."""


def open_fasih_browser(browser: str):
    """Start an isolated browser session using the installed browser.

    Edge and Firefox use official Selenium WebDriver + Selenium Manager; a
    compatible driver may be downloaded on first use depending on the PC.
    """
    if browser not in BROWSER_CHOICES:
        raise FasihBrowserError("Pilihan browser FASIH tidak dikenali.")
    try:
        if browser == "Microsoft Edge":
            from selenium import webdriver
            options = webdriver.EdgeOptions()
            options.page_load_strategy = "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            driver = webdriver.Edge(options=options)
        elif browser == "Mozilla Firefox":
            from selenium import webdriver
            options = webdriver.FirefoxOptions()
            options.page_load_strategy = "eager"
            driver = webdriver.Firefox(options=options)
            driver.maximize_window()
        else:
            import undetected_chromedriver as uc
            options = uc.ChromeOptions()
            options.page_load_strategy = "eager"
            options.add_argument("--start-maximized")
            options.add_argument("--disable-notifications")
            driver = uc.Chrome(options=options, use_subprocess=False, version_main=None)
    except Exception as exc:
        raise FasihBrowserError(
            "Tidak dapat memulai " + browser + " untuk FASIH ("
            + type(exc).__name__ + "). Periksa browser sudah terpasang, "
            "driver Selenium yang sesuai tersedia, dan akses unduh driver "
            "jika diperlukan."
        ) from exc
    driver.set_page_load_timeout(50)
    return driver


def verify_fasih_in_browser(browser: str, *, driver_factory=None) -> str:
    """Verify HTTPS FASIH page with the browser, without SSO or credentials.

    A browser tab reaching a validated BPS HTTPS host is a readiness signal,
    not proof of SSO authorization or API access. Failed navigation is not
    counted as success. Driver always closes after this diagnostic.
    """
    if browser not in BROWSER_CHOICES:
        raise FasihBrowserError("Pilihan browser tidak dikenal.")
    driver = None
    try:
        driver = (driver_factory or open_fasih_browser)(browser)
        driver.get(FASIH_URL)
        final_url = str(driver.current_url or "")
        address = urlsplit(final_url)
        host = (address.hostname or "").lower()
        if address.scheme != "https" or not (
            host == FASIH_HOST
            or host in ("sso.bps.go.id", "sso-eksternal.bps.go.id")
        ):
            raise FasihBrowserError(
                "Browser terbuka, tetapi tidak mencapai portal FASIH/SSO "
                "resmi BPS melalui HTTPS. Periksa alamat yang terbuka."
            )
        # Browser navigation finished without an SSL/network error. No login
        # or privileged API call was made.
        return browser
    except FasihBrowserError:
        raise
    except Exception as exc:
        from selenium.common.exceptions import TimeoutException
        if isinstance(exc, TimeoutException):
            message = (
                browser + " tidak selesai memuat halaman FASIH tepat waktu. "
                "Buka FASIH di browser biasa untuk membandingkan."
            )
        else:
            message = (
                browser + " gagal membuka FASIH melalui otomasi Selenium ("
                + type(exc).__name__ + "). Periksa driver browser, VPN BPS, "
                "proxy, dan sertifikat HTTPS."
            )
        raise FasihBrowserError(message) from exc
    finally:
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass
