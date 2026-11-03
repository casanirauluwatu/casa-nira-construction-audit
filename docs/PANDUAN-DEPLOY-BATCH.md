# Panduan Deploy — Batch Export ZIP (step by step)

Panduan ini mengaktifkan tombol **Batch Export ZIP** di tab *Client Report*:
satu klik mengunduh **satu file ZIP** berisi satu PDF per unit — selalu
**7 hari terakhir** yang berakhir pada tanggal yang dipilih di tab itu.
Sekali setup (±10 menit), selanjutnya tinggal klik tombol.

Yang dibutuhkan:

- Login ke akun Google pemilik sheet **Casa Nira — Batch Export Laporan Klien**
  (akun yang sama yang bisa membaca folder foto *Rekap*).
- Login ke project **Vercel** dashboard-nya.

---

## Bagian 0 — Deploy dulu kode dashboard-nya (sekali, sebelum semuanya)

Tombol **Batch Export ZIP** baru muncul setelah kode fiturnya masuk ke branch
**`main`** — situs produksi di Vercel men-deploy dari `main`, bukan dari
branch pengembangan.

1. Buka GitHub → repo `casa-nira-construction-audit` → buat **pull request**
   dari branch pengembangan ke `main`, lalu **Merge** (sama seperti PR-PR
   dashboard sebelumnya).
2. Vercel otomatis men-deploy `main` setelah merge (±1 menit). Kalau ragu, cek
   tab **Deployments** di Vercel — harus ada deployment Production baru.
3. Buka dashboard → tab **Client Report** → tombol **Batch Export ZIP**
   sekarang terlihat di toolbar, di sebelah *Print for Owner*.

   ⚠️ Tombolnya **boleh diklik sebelum Bagian A–B selesai** — hanya saja akan
   menjawab `BATCH_FEED not set`. Itu memang urutannya: Bagian 0 memunculkan
   tombol, Bagian A–B membuatnya berfungsi.

---

## Bagian A — Pasang skrip di Google Sheet (±5 menit)

1. Buka sheet batch:
   <https://docs.google.com/spreadsheets/d/1mPOm4EtN2j93cMwx4BRVWXQLiNjRwExuad2V-KWIZvA/edit>

2. Di menu sheet, klik **Extensions › Apps Script**
   (UI Indonesia: **Ekstensi › Apps Script**). Tab editor skrip terbuka.

3. Di editor, hapus semua isi file `Code.gs`, lalu **paste seluruh isi**
   [`apps-script/batch-export.gs`](../apps-script/batch-export.gs) dari repo ini.
   Tekan **Ctrl+S** (ikon disket) untuk menyimpan.

4. Klik tombol biru **Deploy › New deployment**.

5. Klik ikon **gerigi ⚙** di sebelah "Select type" → pilih **Web app**, lalu isi:

   | Kolom | Isi |
   | --- | --- |
   | Description | bebas, mis. `batch export v2` |
   | Execute as | **Me** (akun Anda) |
   | Who has access | **Anyone** — wajib; dashboard memanggilnya dari server tanpa login Google |

   Klik **Deploy**.

6. **Otorisasi** (hanya sekali): klik **Authorize access** → pilih akun Anda →
   muncul layar *"Google hasn't verified this app"* — ini **normal** untuk
   skrip buatan sendiri → klik **Advanced** → **Go to … (unsafe)** → **Allow**.
   Skrip minta akses Drive & Docs karena ia membuat PDF dan menyimpannya ke Drive.

7. Setelah deploy berhasil, **salin URL Web app** — bentuknya:
   `https://script.google.com/macros/s/AKfy…/exec`
   ⚠️ Pastikan berakhiran **`/exec`**, bukan `/dev`.

8. **Tes di browser** — buka dua alamat ini (ganti `<URL>` dengan URL tadi):

   - `<URL>?pretty=1` → harus muncul:
     ```json
     { "ok": true, "script": "batch-export", "scriptVersion": "v4-zip-download", … }
     ```
     (`scriptVersion` harus sama dengan `SCRIPT_VERSION` di file `.gs` yang
     di-paste — kalau beda, yang hidup masih kode lama.)
   - `<URL>?action=config&date=2026-11-03&pretty=1` (ganti tanggalnya dengan
     tanggal yang tercakup di sheet) → harus muncul baris-baris unit yang
     rentang tanggalnya mencakup tanggal itu.

   ✅ Kalau dua-duanya tampil, Bagian A selesai. Kalau yang muncul halaman
   login/HTML, cek lagi *Who has access = Anyone* dan pakai URL `/exec`.

---

## Bagian B — Pasang URL-nya di Vercel (±3 menit)

1. Buka <https://vercel.com> → project **casa-nira-construction-audit** →
   **Settings → Environment Variables**.

2. Tambah variabel baru:

   | Kolom | Isi |
   | --- | --- |
   | Key | `BATCH_FEED` |
   | Value | URL `/exec` dari Bagian A langkah 7 |
   | Environments | **Production** (centang Preview juga boleh) |

   Klik **Save**. URL ini jangan ditaruh di git — ia bisa menulis ke Drive.

3. Variabel baru hanya terbaca setelah deploy ulang: buka tab **Deployments**
   → menu **⋯** pada deployment teratas → **Redeploy** →
   **hilangkan centang "Use existing Build Cache"** → Redeploy.

---

## Bagian C — Tes tombolnya (±2 menit)

1. Buka dashboard → tab **Client Report**
   (<https://casa-nira-construction-audit.vercel.app/#klien>).
2. Pastikan **Date** di toolbar menunjuk tanggal yang **tercakup rentang di
   sheet** (mis. 3 November, bila ada baris 2026-10-28 → 2026-11-03).
3. Klik **Batch Export ZIP**. Catatan progres muncul di bawah toolbar:
   baca sheet → ambil daftar foto 7 hari → ekspor unit satu per satu
   (1/19, 2/19, …).
4. Selesai: browser **mengunduh satu file ZIP** —
   `Casa Nira Client Reports - <tanggal>.zip`, berisi satu PDF per unit.
   Tidak ada yang tersimpan di Drive.

✅ Setup selesai. Baris yang dilewati (tanggal salah, rentang tak mencakup
tanggal terpilih, unit tak dikenal) disebut di catatan hasil, lengkap dengan
nomor barisnya.

---

## Pemakaian rutin tiap minggu

1. Buka sheet batch → tab `Batch`.
2. **Tambah baris baru di bawah** untuk tiap unit (jangan hapus baris lama —
   itu arsip): isi *Tanggal Mulai*, *Tanggal Akhir* (wajib, format
   `YYYY-MM-DD`), *Unit*, *Highlights*, *Lowlights*.
   - *Tanggal Mulai* kosong = otomatis 7 hari sampai *Tanggal Akhir*.
3. Di dashboard, pilih **Date**, lalu klik **Batch Export ZIP** → tunggu →
   ZIP terunduh.

Cara pemilihan barisnya: untuk tiap unit dipakai **baris yang rentang
tanggalnya mencakup tanggal yang dipilih** (Mulai ≤ tanggal ≤ Akhir; kalau ada
dua baris yang sama-sama mencakup, baris paling bawah yang menang). Isi
laporannya sendiri selalu **7 hari terakhir** sampai tanggal terpilih — jadi
memilih tanggal minggu lalu otomatis memakai baris arsip minggu itu.

Keterangan foto (caption) diketik di tab Client Report dan tersimpan di
browser itu — jadi jalankan batch dari komputer tempat caption diketik.
Highlights/Lowlights ikut sheet, aman dari komputer mana pun.

---

## Kalau skrip di repo berubah (update)

Menyimpan kode **tidak** otomatis mengubah URL `/exec` yang sudah hidup:

1. Paste kode baru ke editor Apps Script, Save.
2. **Deploy › Manage deployments → ✏️ Edit → Version: "New version" → Deploy.**
3. ⚠️ **Jangan** pakai *New deployment* — itu membuat URL `/exec` **baru** dan
   URL lama tetap menjalankan kode lama (terlihat seperti "tidak ada yang
   berubah"). Kalau terlanjur, ganti `BATCH_FEED` di Vercel ke URL baru.
4. Cek `<URL>?pretty=1` — `scriptVersion` harus sesuai versi di file.

---

## Troubleshooting

| Gejala | Penyebab & solusi |
| --- | --- |
| `BATCH_FEED not set — deploy apps-script/batch-export.gs…` | Bagian B belum selesai: variabel belum diisi, atau belum Redeploy setelah mengisinya. |
| `batch feed answered non-JSON (HTTP …)` | *Who has access* bukan **Anyone**, atau URL-nya `/dev` bukan `/exec`, atau salah salin. Ulangi A.5–A.8. |
| Layar *"Google hasn't verified this app"* saat otorisasi | Normal — Advanced → Go to … → Allow (lihat A.6). |
| `Exception: … Drive` / soal izin saat run pertama | Otorisasi belum lengkap: di editor Apps Script jalankan fungsi `doGet` sekali (tombol Run) dan setujui semua izin, lalu coba lagi. |
| `batch-export.gs behind BATCH_FEED is outdated (…)` | Kode di Apps Script belum versi terbaru — paste ulang file `.gs` lalu **Manage deployments › Edit › New version** (lihat bagian update di bawah). |
| Baris di-skip: `tanggal tidak terbaca — pakai YYYY-MM-DD` | Isi tanggal dengan format `2026-11-03` (atau biarkan Google Sheet mengenalinya sebagai tanggal betulan). |
| Baris di-skip: `Tanggal Akhir kosong` | *Tanggal Akhir* wajib diisi; hanya *Tanggal Mulai* yang boleh kosong. |
| Unit di-skip: `no sheet row covers <tanggal>` | Tidak ada baris unit itu yang rentangnya mencakup tanggal terpilih — tambah barisnya di sheet, atau ganti **Date** di dashboard. |
| `no sheet row covers <tanggal>` (semua) | Tanggal terpilih di luar semua rentang di sheet — biasanya lupa menambah baris minggu ini. |
| Satu unit: `Too large to download through the dashboard` | PDF unit itu > ±3 MB (foto sangat banyak) sehingga tidak muat lewat proxy — file-nya diparkir di folder Drive *Casa Nira — Client Reports* dan ditautkan di catatan hasil; sisanya tetap masuk ZIP. |
| Satu unit `batch feed timeout` | Render unit itu kehabisan waktu di proxy (60 dtk) — jalankan ulang batch; biasanya berhasil pada percobaan kedua karena thumbnail foto sudah hangat. |
| Foto di PDF jadi `[photo could not be fetched]` | File Drive-nya tidak terbaca akun skrip — pastikan folder *Rekap* dibagikan ke akun yang men-deploy (atau *anyone with link — Viewer*). |
