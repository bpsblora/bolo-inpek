"""BOLO INPEK Updater — aplikasi portable Windows, tanpa server scraping.

Workflow: pengguna mengaktifkan FortiClient VPN secara manual, memilih script
scraper lokal, menggunakan satu akun SSO bersama dari .env privat, serta memperbarui Sheets.
Kredensial tidak ditanam ke EXE, diunggah, atau ditampilkan oleh aplikasi.
"""
from __future__ import annotations

from pathlib import Path
from queue import Empty, Queue
import sys
import threading
import tkinter as tk
from tkinter import filedialog, messagebox, scrolledtext, ttk
import webbrowser

from legacy_bridge import check_files, run_legacy_scraper
from cloud_config import synchronize_online, read_public_settings, read_desktop_oauth_client
from preflight import preflight_google_sheets, read_local_setup, PreflightError
from run_lock import local_update_lock

DASHBOARD_URL = "https://bpsblora.github.io/bolo-inpek/"
APP_TITLE = "BOLO INPEK Updater"


def application_directory() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


class Updater(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title(APP_TITLE + " • Portable")
        self.geometry("850x670")
        self.minsize(650, 540)
        self.configure(bg="#edf4ff")
        self.events: Queue[tuple[str, str]] = Queue()
        self.running = False
        self.selected_script = tk.StringVar()
        self.vpn_confirmed = tk.BooleanVar(value=False)
        self.online_mode = tk.BooleanVar(value=True)
        self.status = tk.StringVar(value="Belum siap")
        self._style()
        self._layout()
        guessed = application_directory() / "ambil_data_monitoring_inpek_v2.py"
        if guessed.is_file():
            self.selected_script.set(str(guessed))
        self.after(150, self.update_status)
        self.after(120, self.drain_events)

    def _style(self):
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Page.TFrame", background="#edf4ff")
        style.configure("Card.TFrame", background="white")
        style.configure("Heading.TLabel", background="#edf4ff",
                        foreground="#163a66", font=("Segoe UI", 19, "bold"))
        style.configure("Subtitle.TLabel", background="#edf4ff",
                        foreground="#556c86", font=("Segoe UI", 10))
        style.configure("Section.TLabel", background="white",
                        foreground="#173e70", font=("Segoe UI", 11, "bold"))
        style.configure("Body.TLabel", background="white",
                        foreground="#465c72", font=("Segoe UI", 9))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"),
                        padding=(16, 9))
        style.configure("Normal.TButton", padding=(12, 8))

    def _layout(self):
        root = ttk.Frame(self, style="Page.TFrame", padding=22)
        root.pack(fill="both", expand=True)
        ttk.Label(root, text="BOLO INPEK Updater", style="Heading.TLabel").pack(anchor="w")
        ttk.Label(root, text="Pembaruan FASIH-SM • VPN manual, akun SSO bersama",
                  style="Subtitle.TLabel").pack(anchor="w", pady=(3, 16))

        panel = ttk.Frame(root, style="Card.TFrame", padding=17)
        panel.pack(fill="x")
        ttk.Label(panel, text="1. Persiapan Akses", style="Section.TLabel").pack(anchor="w")
        ttk.Label(panel, text="Hubungkan FortiClient VPN menggunakan prosedur resmi BPS.",
                  style="Body.TLabel").pack(anchor="w", pady=(6, 8))
        ttk.Checkbutton(panel, text="Saya sudah mengaktifkan VPN FortiClient dan berwenang mengakses FASIH",
                        variable=self.vpn_confirmed, command=self.update_status).pack(anchor="w")
        ttk.Label(panel, text="Centang ini adalah konfirmasi operator, bukan pemeriksaan otomatis VPN.",
                  style="Body.TLabel").pack(anchor="w", pady=(3, 0))

        scripts = ttk.Frame(root, style="Card.TFrame", padding=17)
        scripts.pack(fill="x", pady=(12, 0))
        ttk.Label(scripts, text="2. Script Scraping Lokal", style="Section.TLabel").pack(anchor="w")
        ttk.Label(scripts, text="Script lama dan akun SSO bersama tetap di PC; daftar survei dibaca dari pengaturan online.",
                  style="Body.TLabel").pack(anchor="w", pady=(5, 10))
        entry_row = ttk.Frame(scripts, style="Card.TFrame")
        entry_row.pack(fill="x")
        ttk.Entry(entry_row, textvariable=self.selected_script).pack(side="left", fill="x", expand=True)
        ttk.Button(entry_row, text="Pilih File", command=self.pick_script,
                   style="Normal.TButton").pack(side="left", padx=(7, 0))
        self.file_status = ttk.Label(scripts, text="", style="Body.TLabel",
                                     wraplength=760, justify="left")
        self.file_status.pack(anchor="w", pady=(9, 0))
        modes = ttk.Frame(scripts, style="Card.TFrame")
        modes.pack(fill="x", pady=(10, 0))
        ttk.Radiobutton(
            modes, text="Online • ambil daftar survei terbaru dari BOLO INPEK",
            variable=self.online_mode, value=True, command=self.update_status
        ).pack(anchor="w")
        ttk.Radiobutton(
            modes, text="Lokal • hanya untuk pengujian dengan config_survei.json di PC",
            variable=self.online_mode, value=False, command=self.update_status
        ).pack(anchor="w", pady=(4, 0))

        controls = ttk.Frame(root, style="Page.TFrame")
        controls.pack(fill="x", pady=(16, 13))
        self.run_button = ttk.Button(controls, text="▶  Perbarui Data FASIH",
                                     style="Primary.TButton", command=self.start_update)
        self.run_button.pack(side="left")
        ttk.Button(controls, text="Periksa Persiapan", command=self.check_preparation,
                   style="Normal.TButton").pack(side="left", padx=(8, 0))
        ttk.Button(controls, text="Buka Dashboard", command=lambda: webbrowser.open(DASHBOARD_URL),
                   style="Normal.TButton").pack(side="left", padx=9)
        ttk.Label(controls, textvariable=self.status, style="Subtitle.TLabel").pack(side="right")

        console = ttk.Frame(root, style="Card.TFrame", padding=14)
        console.pack(fill="both", expand=True)
        ttk.Label(console, text="3. Riwayat Proses (di PC Ini)",
                  style="Section.TLabel").pack(anchor="w", pady=(0, 8))
        self.log_window = scrolledtext.ScrolledText(
            console, height=11, font=("Consolas", 9), wrap="word",
            background="#f7faff", foreground="#1a3959", relief="flat",
            padx=10, pady=10, state="disabled"
        )
        self.log_window.pack(fill="both", expand=True)
        self._append_log("Siap memeriksa file. Scraper memakai akun SSO bersama dari .env lokal.")
        ttk.Label(root,
                  text="Mode pengembangan • Rahasiakan file .env dan credentials.json; jangan bagikan ke GitHub.",
                  style="Subtitle.TLabel").pack(anchor="w", pady=(11, 0))

    def pick_script(self):
        path = filedialog.askopenfilename(
            title="Pilih script scraper BOLO INPEK yang tepercaya",
            filetypes=[("Python script", "*.py")]
        )
        if path:
            self.selected_script.set(path)
        self.update_status()

    def update_status(self):
        script = Path(self.selected_script.get() or "")
        problems = check_files(script, require_config=not self.online_mode.get())
        if not problems:
            try:
                read_local_setup(script.parent)
            except PreflightError as exc:
                problems.append(str(exc))
        if problems:
            self.file_status.configure(text="Persiapan: " + " | ".join(problems))
        else:
            self.file_status.configure(text=(
                "Mode online: daftar survei diperiksa saat pembaruan. "
                "Google meminta izin operator sekali per sesi."
                if self.online_mode.get() else
                "Mode uji lokal: scraper memakai config_survei.json pada PC."
            ))
        ready = not problems and self.vpn_confirmed.get() and not self.running
        self.run_button.configure(state=("normal" if ready else "disabled"))
        self.status.set("Sedang memperbarui" if self.running else
                        "Siap diperbarui" if ready else "Belum siap")

    def _append_log(self, line):
        self.log_window.configure(state="normal")
        self.log_window.insert("end", line.rstrip() + "\n")
        self.log_window.see("end")
        self.log_window.configure(state="disabled")

    def start_update(self):
        if self.running:
            return
        script = Path(self.selected_script.get())
        if not self.vpn_confirmed.get() or check_files(
            script, require_config=not self.online_mode.get()
        ):
            messagebox.showwarning(APP_TITLE, "Periksa VPN dan berkas pendukung terlebih dahulu.")
            return
        try:
            read_local_setup(script.parent)
        except PreflightError as exc:
            messagebox.showwarning(APP_TITLE, str(exc))
            return
        confirmed = messagebox.askyesno(
            APP_TITLE,
            "Jalankan scraper dari file lokal yang dipilih?\n\n"
            ("Updater akan mengambil daftar survei TERBARU dari BOLO INPEK online. "
             "Akun Google yang diberi izin perlu login untuk membaca ID FASIH. "
             if self.online_mode.get() else "Updater menggunakan konfigurasi uji lokal. ")
            + "Chrome FASIH menggunakan akun SSO bersama dari konfigurasi privat. "
            + "Hasilnya akan ditulis ke Google Sheets."
        )
        if not confirmed:
            return
        self.running = True
        self.update_status()
        self._append_log("Mulai pembaruan manual dari " + script.name)
        threading.Thread(
            target=self._run, args=(script, self.online_mode.get()), daemon=True
        ).start()

    def check_preparation(self):
        """Diagnostik tanpa menjalankan scraping atau mengubah spreadsheet."""
        if self.running:
            return
        script = Path(self.selected_script.get() or "")
        if check_files(script, require_config=not self.online_mode.get()):
            messagebox.showwarning(APP_TITLE, "Pilih file Python dan lengkapi konfigurasi dulu.")
            return
        self.running = True
        self.update_status()
        self._append_log("Memulai audit persiapan tanpa scraping...")
        threading.Thread(
            target=self._check_preparation_worker,
            args=(script.parent, self.online_mode.get()), daemon=True
        ).start()

    def _check_preparation_worker(self, script_dir, online):
        try:
            def report(line):
                self.events.put(("log", str(line)))
            preflight_google_sheets(script_dir, report)
            if online:
                settings = read_public_settings(script_dir)
                read_desktop_oauth_client(
                    script_dir, settings["google_oauth_desktop_client_id"]
                )
                report("Konfigurasi Firebase dan OAuth Desktop telah valid secara struktur.")
                report("Izin operator dan login SSO belum diuji; diperiksa saat uji terjadwal.")
            self.events.put((
                "done",
                "Prajalankan selesai. Tidak ada scraping atau perubahan data."
            ))
        except BaseException as error:
            self.events.put((
                "failed", type(error).__name__ + ": " + str(error)
            ))

    def _run(self, script, use_online):
        try:
            def report(line):
                self.events.put(("log", str(line)))
            with local_update_lock(script.parent):
                report("Pemeriksaan akses dua spreadsheet sebelum scraping...")
                preflight_google_sheets(script.parent, report)
                if use_online:
                    report("Mengambil daftar survei aktif dari BOLO INPEK online...")
                    count = synchronize_online(script.parent, report)
                    report(str(count) + " survei siap diperbarui.")
                else:
                    report("Mode uji lokal: tidak menarik konfigurasi online.")
                run_legacy_scraper(script, report)
            self.events.put(("done", "Proses selesai. Buka dashboard untuk memuat data terbaru."))
        except BaseException as error:
            self.events.put(("failed", type(error).__name__ + ": " + str(error)))

    def drain_events(self):
        while True:
            try:
                kind, text = self.events.get_nowait()
            except Empty:
                break
            if kind == "log":
                self._append_log(text)
            elif kind in ("done", "failed"):
                self.running = False
                self._append_log(("[✓] " if kind == "done" else "[X] ") + text)
                self.update_status()
                if kind == "failed":
                    messagebox.showerror(APP_TITLE, "Pembaruan gagal.\n\n" + text[:1200])
        self.after(120, self.drain_events)


if __name__ == "__main__":
    Updater().mainloop()
