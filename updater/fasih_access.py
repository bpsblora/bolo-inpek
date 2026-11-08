"""Pemeriksaan FASIH sebelum login SSO.

FortiClient VPN tetap diaktifkan manual. Pemeriksaan ini tidak mengubah
koneksi VPN, tidak memasukkan kredensial, dan tidak menggunakan data SSO.
Hasil positif hanya membuktikan portal FASIH menjawab melalui jaringan
saat itu; bukan memastikan status proses FortiClient atau hak akses survei.
"""
from __future__ import annotations

from urllib.parse import urlparse
import requests

FASIH_URL = "https://fasih-sm.bps.go.id/app"
FASIH_HOST = "fasih-sm.bps.go.id"
ACCESSIBLE = {200, 301, 302, 303, 307, 308, 401}


class FasihAccessError(RuntimeError):
    """VPN/portal FASIH belum siap; hentikan proses sebelum SSO."""


def verify_fasih_access(*, get=requests.get, url=FASIH_URL) -> None:
    """Periksa portal melalui HTTPS terverifikasi tanpa follow redirect.

    Redirect login SSO menandakan portal dapat dijangkau. Tidak melakukan
    login, tidak mengirim data rahasia, dan tidak menyimpan sesi/cookie.
    """
    address = urlparse(url)
    if address.scheme != "https" or address.hostname != FASIH_HOST:
        raise FasihAccessError("Alamat portal FASIH tidak sesuai konfigurasi resmi.")
    try:
        response = get(
            url, timeout=(6, 12),
            allow_redirects=False,
        )
    except requests.exceptions.SSLError as exc:
        raise FasihAccessError(
            "Portal FASIH terhubung, tetapi sertifikat HTTPS tidak dapat "
            "diverifikasi. Minta sertifikat CA resmi kepada TI BPS."
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise FasihAccessError(
            "Portal FASIH belum dapat dijangkau. Pastikan VPN FortiClient "
            "berstatus Connected, lalu ulangi pemeriksaan."
        ) from exc

    if response.status_code not in ACCESSIBLE:
        raise FasihAccessError(
            "Akses portal FASIH belum siap (HTTP " + str(response.status_code)
            + "). Periksa koneksi FortiClient/VPN dan portal."
        )
    if response.status_code in {301, 302, 303, 307, 308}:
        location = response.headers.get("Location", "")
        if location:
            target = urlparse(location)
            if target.scheme and target.scheme != "https":
                raise FasihAccessError("FASIH mengarahkan ke halaman non-HTTPS.")
    # Browser/Selenium berikutnya tetap memverifikasi hasil login sebenarnya.
