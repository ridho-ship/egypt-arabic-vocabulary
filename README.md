# Egyptian Arabic Vocabulary

Kamus saku Fusha, 'Ammiyah Mesir, dan Madinah untuk mahasiswa baru Indonesia di Mesir.
Dibuat oleh **Abrar Akhmad Ridho** (Universitas Al-Azhar), dibantu Imam.

🌐 https://egypt-arabic-vocabulary.pages.dev

## Susunan

| Bagian | Teknologi | Isi |
|---|---|---|
| Website | Cloudflare Pages (HTML, CSS, JS biasa, tanpa build) | folder `site/` |
| Database & login admin | Supabase (Postgres + Google login) | folder `supabase/` |
| Cadangan & impor besar | Google Sheets + Apps Script | folder `apps-script/` |
| Media | Cloudinary | link diisi di `site/assets/js/config.js` |

```
site/
  index.html               halaman utama
  _headers                 aturan cache & keamanan Cloudflare
  assets/js/config.js      ← SATU-SATUNYA file yang perlu diisi (Supabase, Cloudinary, fitur)
  assets/js/teks.js        teks tampilan Indonesia / English
  assets/js/app.js         website pengunjung (loading, pencarian, halaman)
  assets/js/admin.js       mode admin (dimuat hanya saat login)
  assets/css/style.css     tampilan + warna mode pagi/malam
  assets/css/admin.css     tampilan mode admin
  assets/data/cadangan.json salinan data, dipakai kalau Supabase bermasalah
  assets/img, assets/media logo, foto header, video loading (cadangan lokal)
supabase/
  01_skema.sql             tabel, aturan akses (RLS), fungsi
  02_data_awal.sql         data awal dari spreadsheet (353 kata)
apps-script/
  Sinkron.gs               sinkron dua arah Sheets ↔ Supabase
tools/
  buat_seed.py             membuat ulang 02_data_awal.sql dari file .xlsx
```

## Fitur

- Layar loading dengan video logo dan persen yang mengikuti proses loading sebenarnya
- Header foto piramida: siang untuk mode pagi, malam untuk mode malam (dipilih manual, diingat browser)
- Bahasa tampilan Indonesia / English (isi kamus memakai kolom English, kalau kosong kembali ke Indonesia)
- Pencarian dua arah: Indonesia, English, latin, atau tulisan Arab
- 5 situasi (Sehari-hari, Kampus, Pasar, Rumah Sakit, Dasar Berbahasa), halaman per 5/10 kartu, bisa digeser
- Tentang Saya, Administrasi di Mesir, tombol Back HP berfungsi (alamat `#kosakata/A`, `#tentang`, ...)
- Mode admin (login Google): edit / tambah / arsipkan kata, kelola masukan, Tentang Saya, Administrasi,
  Panduan, Kategori, log perubahan, unduh cadangan
- Siap dinyalakan nanti: formulir "Usulkan kata" (`fiturMasukan: true`) dan tombol Trakteer (`trakteer: '...'`)

## Keamanan singkat

- Pengunjung hanya bisa **membaca** lewat fungsi `data_publik` dan **mengirim** masukan.
- Hanya email di tabel `admin` yang bisa mengubah data (dicek di database, bukan hanya di website).
- Kolom `sumber` (nama informan) tidak pernah dikirim ke pengunjung.
- Kunci rahasia Supabase hanya disimpan di Script Properties Apps Script, tidak di website/GitHub.
- Menghapus = mengubah status jadi **Diarsipkan**. Nomor ID tidak pernah dipakai ulang.
