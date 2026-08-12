# TimeMark - Panduan Menjalankan & Penggunaan

**TimeMark** adalah aplikasi Web (PWA) kamera yang menempelkan **watermark waktu, tanggal, lokasi, dan koordinat GPS** ke foto/video secara otomatis — seperti aplikasi TimeMark di Play Store. Bisa diinstal ke HP dan berfungsi offline.

---

## 1. Syarat yang Dibutuhkan

| Kebutuhan | Keterangan |
|---|---|
| Browser | **Chrome** atau **Edge** versi terbaru (paling stabil). Firefox juga bisa untuk foto/tampilan, tapi video watermark paling baik di Chrome/Edge. |
| Server lokal | Python 3 **atau** Node.js (sudah tersedia di komputer ini: Python 3.12 & Node 24). |
| Akses | Kamera + mikrofon + lokasi (GPS) harus diizinkan. |

> **Penting:** Akses kamera hanya berfungsi lewat `http://localhost` atau koneksi `https`. Tidak bisa dibuka langsung dari file (double-click `index.html`).

---

## 2. Cara Menjalankan (Windows)

### Cara A — Otomatis (disarankan)

1. Buka **PowerShell** di folder aplikasi:
   ```
   cd C:\Users\drean\OneDrive\Dokumen\TIMEMARK
   ```
2. Jalankan: `.\start.ps1`
3. Buka browser ke: **http://localhost:8080**
4. Untuk menghentikan: tekan `Ctrl+C`.

### Cara B — Manual dengan Python

```
python -m http.server 8080
```

### Cara C — Manual dengan Node

```
npx serve . -l 8080
```

Semua cara sama: buka **http://localhost:8080**.

---

## 3. Cara Menggunakan

### Langkah awal (permission)
- Saat pertama dibuka, klik **"Izinkan Akses"**, lalu beri izin **Kamera**, **Mikrofon**, dan **Lokasi** bila diminta browser.
- Tunggu indikator **GPS** berubah **hijau** (artinya lokasi sudah terkunci) dan alamat muncul di bawah layar.

### Ambil Foto
- Tekan tombol bulat putih besar **di tengah bawah**.
- Foto tersimpan otomatis dengan watermark **waktu + tanggal + koordinat GPS + alamat** tercetak permanen.

### Rekam Video
- Tekan tombol **merah bulat** di kanan bawah.
- Saat merekam muncul badge **REC**; tekan lagi untuk berhenti.
- Watermark ikut ter-rekam di setiap frame (terbakar permanen), dengan suara.

### Lihat Galeri
- Tekan tombol **bentuk gambar** (ikon galeri) di kanan bawah layar kamera.
- Klik salah satu hasil untuk melihat detail metadata lengkap.
- Tombol di modal: **Unduh** (simpan file), **Bagikan** (share langsung), **Ekspor** (simpan metadata JSON), **Hapus**.

### Fitur Tambahan
- **Milidetik** — aktifkan sakelar "Milidetik" di galeri agar watermark menampilkan presisi milidetik (`14:32:08.412`).
- **Ekspor metadata** — tombol **Ekspor** di galeri mengunduh semua metadata foto/video sebagai file JSON.
- **Riwayat Lokasi** — tombol **Riwayat Lokasi** menampilkan jejak titik GPS yang terlewati. Bisa diekspor ke **CSV** (buat Excel) atau **JSON**, dan dihapus.

### Instal ke HP / Desktop (PWA)
- Di Chrome/Edge ada ikon **instal** (gambar ↓) di pojok kanan galeri (muncul hanya jika browser mendukung PWA + koneksi HTTPS).
- Setelah diinstal, aplikasi terbuka layar penuh seperti aplikasi asli dan tetap bisa dipakai **offline**.

---

## 4. Akses dari HP (opsional)

Kamera dari HP lewat akses jarak cukup berbelit karena butuh **HTTPS**. Cara paling praktis:

1. **Opsional — gunakan tunnel HTTPS gratis** (misal Cloudflare Tunnel / ngrok) untuk membuka `http://localhost:8080` ke internet dengan alamat `https://...`.
2. Buka alamat HTTPS tersebut di Chrome HP, izinkan kamera, lalu **instal PWA**.

> Jika hanya memakai komputer yang sama, cukup ikuti bagian 2 dan 3.

---

## 5. Mengatasi Masalah

| Masalah | Solusi |
|---|---|
| Layar hitam / tidak ada kamera | Pastikan membuka lewat `http://localhost:8080` (bukan file). Periksa izin kamera di ikon gembok pada address bar. |
| GPS tidak aktif | Buka pengaturan browser/sistem, izinkan lokasi untuk situs ini. Di gedung, coba dekat jendela (sinyal GPS lemah di dalam ruangan). |
| Alamat tidak muncul | Reverse-geocoding butuh internet (OpenStreetMap). Foto tetap otomatis menyimpan koordinat GPS. |
| Video tidak bisa share/unduh | Coba unduh dulu, lalu bagikan lewat menu galeri handphone. |
| Ikon instal tidak muncul | Butuh koneksi HTTPS (bukan localhost). Host pakai tunnel HTTPS lalu buka lagi. |

---

## 7. Deploy ke GitHub Pages (agar bisa dipakai di HP)

Kamera di HP hanya aktif lewat HTTPS. Cara termudah: hosting gratis GitHub Pages.

1. Buka **github.com** → daftar/login akun (gratis).
2. Klik **+** (pojok kanan atas) → **New repository**.
   - Repository name: `timemark` (huruf kecil semua)
   - Pilih **Public**, jangan centang "Add a README", klik **Create repository**.
3. Di halaman repo (kondisi kosong): klik **Add file** → **Upload files**.
4. Buka folder `C:\Users\drean\OneDrive\Dokumen\TIMEMARK`, lalu **drag semua file & folder `icons/`** ke halaman upload:
   - `index.html`, `style.css`, `app.js`, `manifest.json`, `sw.js`, `README.md`, `start.ps1`, `make-icons.ps1`
   - folder `icons/` (bisa di-drag bersamaan; GitHub akan mempertahankan struktur foldernya)
5. Klik **Commit changes** (biarkan default).
6. Buka tab **Settings** repositori → menu kiri **Pages**.
   - Source: `Deploy from a branch` → Branch: `main`, folder: `/ (root)` → **Save**.
7. Tunggu **±1–2 menit**, lalu buka alamat Anda:
   `https://<nama-akun-anda>.github.io/timemark/`
   (Ganti `<nama-akun-anda>` dengan username GitHub Anda.)
8. Buka alamat itu di **HP**: izinkan kamera/lokasi → aplikasi siap dipakai.
9. Untuk instal ke HP: menu Chrome **⋮ → Add to Home screen / Install app**.
   > Tombol instal di aplikasi muncul setelah Anda mengunjungi lewat Chrome minimal 2 kali.

> **Update file di kemudian hari:** buka file di repo → ikon pensil (edit) → tempel isi file baru → **Commit changes**. Halaman otomatis ter-update beberapa menit kemudian.

---

## 6. Daftar File

| File | Fungsi |
|---|---|
| `index.html` | Halaman utama aplikasi |
| `style.css` | Tampilan / desain |
| `app.js` | Logika kamera, watermark, galeri, ekspor, riwayat lokasi |
| `manifest.json` | Konfigurasi PWA agar bisa diinstal |
| `sw.js` | Service worker (mode offline) |
| `start.ps1` | Skrip menjalankan server lokal (Windows) |
| `make-icons.ps1` | Membuat ulang ikon aplikasi |
| `icons/` | Ikon aplikasi |