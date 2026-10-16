/* =====================================================================
   PEMBUAT HALAMAN UNTUK GOOGLE (SEO)
   ---------------------------------------------------------------------
   Dijalankan otomatis oleh Cloudflare Pages setiap kali website dibangun
   (Build command: node tools/buat_halaman.mjs).

   Yang dibuat di folder site/:
   - kata/<nama-kata>/index.html      satu halaman untuk setiap kata
   - kosakata/index.html              daftar semua situasi
   - kosakata/<situasi>/index.html    daftar kata per situasi
   - sitemap.xml & robots.txt         daftar halaman untuk Google
   - daftar link statis di index.html (supaya Google menemukan semuanya)

   Data diambil dari Supabase (alamat dibaca dari site/assets/js/config.js).
   Kalau Supabase tidak bisa dihubungi, dipakai assets/data/cadangan.json.
   Tidak butuh paket tambahan (cukup Node 18+).
   ===================================================================== */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(AKAR, 'site');

/* ---------- Pengaturan dari config.js ---------- */
async function bacaConfig() {
  const teks = await readFile(path.join(SITE, 'assets/js/config.js'), 'utf8');
  const ambil = (kunci) => {
    const m = teks.match(new RegExp(kunci + "\\s*:\\s*'([^']*)'"));
    return m ? m[1].trim() : '';
  };
  return {
    supabaseUrl: (process.env.SUPABASE_URL || ambil('supabaseUrl')).replace(/\/+$/, '').replace(/\/rest\/v1$/, ''),
    supabaseKey: process.env.SUPABASE_KEY || ambil('supabaseKey'),
    urlWebsite: (ambil('urlWebsite') || 'https://egypt-arabic-vocabulary.pages.dev').replace(/\/+$/, ''),
    namaCadangan: ambil('namaCadangan') || 'Abrar Akhmad Ridho'
  };
}

async function ambilData(cfg) {
  if (process.env.SUMBER_DATA) return JSON.parse(await readFile(process.env.SUMBER_DATA, 'utf8'));
  if (/^https:\/\//.test(cfg.supabaseUrl) && !/ISI-/.test(cfg.supabaseUrl + cfg.supabaseKey)) {
    try {
      const h = { apikey: cfg.supabaseKey };
      if (/^eyJ/.test(cfg.supabaseKey)) h.Authorization = 'Bearer ' + cfg.supabaseKey;
      const res = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/data_publik', { headers: h });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      console.log('[halaman] data diambil dari Supabase');
      return await res.json();
    } catch (err) {
      console.warn('[halaman] Supabase gagal, memakai cadangan.json:', err.message);
    }
  }
  return JSON.parse(await readFile(path.join(SITE, 'assets/data/cadangan.json'), 'utf8'));
}

/* ---------- Alat bantu ---------- */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const potong = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s);
function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' dan ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '') || 'kata';
}
const sudahDicek = (st) => /^(sudah|final)/i.test(String(st || ''));
function tanggal(iso) {
  const d = iso ? new Date(iso) : new Date();
  return isNaN(d) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
}

function olahData(raw) {
  const kolom = raw.kosakata_kolom || ['id', 'sub', 'tipe', 'indo', 'en', 'fusha_ar', 'fusha_lat', 'mesir_ar', 'mesir_lat',
    'saudi_ar', 'saudi_lat', 'catatan', 'catatan_en', 'status'];
  const kosakata = (raw.kosakata || []).map((b) => {
    if (!Array.isArray(b)) return b;
    const o = {};
    kolom.forEach((k, i) => { o[k] = b[i] == null ? '' : String(b[i]); });
    return o;
  }).filter((k) => k.indo && k.status !== 'Diarsipkan');
  const kategori = (raw.kategori || []).map((c) => ({ ...c, slug: slug(c.nama) }));
  /* alamat unik untuk setiap kata */
  const dipakai = new Set();
  kosakata.forEach((k) => {
    let s = slug(k.indo);
    if (dipakai.has(s)) s = s + '-' + String(k.id).toLowerCase().replace(/[^a-z0-9]+/g, '');
    dipakai.add(s);
    k.slug = s;
  });
  return { kategori, kosakata, diperbarui: raw.diperbarui, tentang: raw.tentang || {} };
}

/* ---------- Kerangka halaman ---------- */
function kerangka({ cfg, judul, deskripsi, jalur, isi, jsonld, gambar }) {
  const url = cfg.urlWebsite + jalur;
  return `<!DOCTYPE html>
<html lang="id" data-tema="pagi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(judul)}</title>
  <meta name="description" content="${esc(deskripsi)}">
  <link rel="canonical" href="${esc(url)}">
  <meta name="theme-color" content="#F4EBDD">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="Egyptian Arabic Vocabulary">
  <meta property="og:title" content="${esc(judul)}">
  <meta property="og:description" content="${esc(deskripsi)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(gambar || cfg.urlWebsite + '/assets/img/og.jpg')}">
  <meta property="og:locale" content="id_ID">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="/assets/img/ikon-180.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Marcellus&family=Plus+Jakarta+Sans:wght@400;500;700;800&display=swap" rel="stylesheet">
  <script>try{if(localStorage.getItem('eav-tema')==='malam')document.documentElement.setAttribute('data-tema','malam')}catch(e){}</script>
  <link rel="stylesheet" href="/assets/css/style.css?v=1">
  <link rel="stylesheet" href="/assets/css/halaman.css?v=1">
  <script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>
</head>
<body class="halaman-statis">
  <header class="atas-statis">
    <div class="wadah atas-statis-isi">
      <a class="merek-statis" href="/"><img src="/assets/img/lambang.webp" alt="" width="36" height="32"><span>Egyptian Arabic Vocabulary</span></a>
      <a class="tombol-utama kecil" href="/">Buka kamus</a>
    </div>
  </header>
  <main class="wadah isi-statis">
${isi}
  </main>
  <footer class="wadah kaki-statis">
    <p>Egyptian Arabic Vocabulary, kamus saku Fusha, 'Ammiyah Mesir, dan Madinah untuk mahasiswa baru Indonesia di Mesir. Dibuat oleh <a href="/#tentang">${esc(cfg.namaCadangan)}</a>.</p>
    <p><a href="/kosakata/">Semua kosakata</a> · <a href="/#administrasi">Administrasi di Mesir</a> · <a href="/">Kamus lengkap</a></p>
  </footer>
</body>
</html>
`;
}

function remah(cfg, item) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: item.map(([nama, jalur], i) => ({ '@type': 'ListItem', position: i + 1, name: nama, item: cfg.urlWebsite + jalur }))
  };
}
function remahHtml(item) {
  return `<nav class="remah" aria-label="Lokasi">${item.map(([nama, jalur], i) =>
    i === item.length - 1 ? `<span aria-current="page">${esc(nama)}</span>` : `<a href="${esc(jalur)}">${esc(nama)}</a>`).join(' <span aria-hidden="true">›</span> ')}</nav>`;
}

/* ---------- Halaman satu kata ---------- */
function halamanKata(cfg, k, kat, tetangga) {
  const jalur = `/kata/${k.slug}/`;
  const katJalur = kat ? `/kosakata/${kat.slug}/` : '/kosakata/';
  const katNama = kat ? kat.nama : 'Kosakata';
  const mesir = [k.mesir_ar, k.mesir_lat && `(${k.mesir_lat})`].filter(Boolean).join(' ');
  const judul = potong(`${k.indo.replace(/[?!.]+$/, '')} dalam Bahasa Arab Mesir${mesir ? ': ' + mesir : ''}`, 68) + ' | Kamus Mesir';
  const bagian = [
    k.mesir_ar && `Mesir ${k.mesir_ar}${k.mesir_lat ? ' (' + k.mesir_lat + ')' : ''}`,
    k.fusha_ar && `Fusha ${k.fusha_ar}${k.fusha_lat ? ' (' + k.fusha_lat + ')' : ''}`,
    k.saudi_ar && `Madinah ${k.saudi_ar}${k.saudi_lat ? ' (' + k.saudi_lat + ')' : ''}`
  ].filter(Boolean).join(', ');
  const deskripsi = potong(`Arti "${k.indo}" dalam bahasa Arab: ${bagian}.${k.en ? ' English: ' + k.en + '.' : ''} Kamus saku untuk maba Indonesia di Mesir.`, 158);
  const logat = [
    ['mesir', "'Ammiyah Mesir", k.mesir_ar, k.mesir_lat, 'Yang dipakai sehari-hari di jalan, pasar, dan kampus di Mesir.'],
    ['fusha', 'Fusha', k.fusha_ar, k.fusha_lat, 'Bahasa Arab baku, seperti di buku dan Al-Qur\'an.'],
    ['saudi', 'Madinah (Hijazi)', k.saudi_ar, k.saudi_lat, 'Pembanding, logat yang dipakai di Madinah dan Makkah.']
  ].filter((x) => x[2] || x[3]).map(([cls, nama, ar, lat, ket]) => `
      <div class="logat-statis ${cls}">
        <h2>${esc(nama)}</h2>
        <p class="ar" lang="ar" dir="rtl">${esc(ar) || '–'}</p>
        ${lat ? `<p class="lat">${esc(lat)}</p>` : ''}
        <p class="ket">${esc(ket)}</p>
      </div>`).join('');
  const lain = tetangga.map((t) => `<li><a href="/kata/${t.slug}/"><span>${esc(t.indo)}</span><span class="ar" lang="ar" dir="rtl">${esc(t.mesir_ar)}</span></a></li>`).join('');
  const isi = `
    ${remahHtml([['Beranda', '/'], [katNama, katJalur], [k.indo, jalur]])}
    <article class="kata-statis">
      <p class="label-statis">${esc(/kalimat/i.test(k.tipe) ? 'Kalimat' : 'Kosakata')} · ${esc(katNama)}${sudahDicek(k.status) ? '' : ' · <span class="draf">Belum diverifikasi</span>'}</p>
      <h1>${esc(k.indo)} <span>dalam bahasa Arab Mesir</span></h1>
      ${k.en ? `<p class="terjemah-statis" lang="en">English: ${esc(k.en)}</p>` : ''}
      <div class="grid-logat">${logat}</div>
      ${k.catatan ? `<div class="catatan-statis"><h2>Catatan pemakaian</h2><p>${esc(k.catatan)}</p>${k.catatan_en ? `<p lang="en" class="kecil">${esc(k.catatan_en)}</p>` : ''}</div>` : ''}
      <div class="aksi-form">
        <a class="tombol-utama" href="/#cari/${encodeURIComponent(k.indo)}">Lihat di kamus</a>
        <a class="tombol-garis" href="${esc(katJalur)}">Semua kata ${esc(katNama)}</a>
      </div>
    </article>
    ${lain ? `<section class="lain-statis"><h2>Kata lain di situasi ${esc(katNama)}</h2><ul>${lain}</ul></section>` : ''}`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTerm',
        name: k.indo,
        description: deskripsi,
        url: cfg.urlWebsite + jalur,
        inLanguage: 'id',
        alternateName: [k.mesir_ar, k.mesir_lat, k.fusha_ar, k.fusha_lat, k.saudi_ar, k.saudi_lat, k.en].filter(Boolean),
        inDefinedTermSet: { '@type': 'DefinedTermSet', name: `Kosakata Bahasa Arab Mesir: ${katNama}`, url: cfg.urlWebsite + katJalur }
      },
      remah(cfg, [['Beranda', '/'], [katNama, katJalur], [k.indo, jalur]])
    ]
  };
  return { jalur, html: kerangka({ cfg, judul, deskripsi, jalur, isi, jsonld }) };
}

/* ---------- Halaman satu situasi ---------- */
function halamanKategori(cfg, kat, daftar) {
  const jalur = `/kosakata/${kat.slug}/`;
  const judul = potong(`Kosakata Bahasa Arab Mesir ${kat.nama}: ${daftar.length} kata & kalimat`, 68);
  const deskripsi = potong(`${daftar.length} kata dan kalimat bahasa Arab Mesir ('Ammiyah) untuk situasi ${kat.nama.toLowerCase()}, lengkap dengan Fusha, Madinah, dan cara baca latin. ${kat.deskripsi || ''}`, 158);
  const baris = daftar.map((k) => `
        <li><a href="/kata/${k.slug}/">
          <span class="indo">${esc(k.indo)}</span>
          <span class="ar" lang="ar" dir="rtl">${esc(k.mesir_ar)}</span>
          <span class="lat">${esc(k.mesir_lat)}</span>
        </a></li>`).join('');
  const isi = `
    ${remahHtml([['Beranda', '/'], ['Kosakata', '/kosakata/'], [kat.nama, jalur]])}
    <h1>${esc(kat.ikon || '')} Kosakata Bahasa Arab Mesir: ${esc(kat.nama)}</h1>
    <p class="lead">${esc(kat.deskripsi || '')} Klik kata untuk melihat versi Fusha dan Madinah.</p>
    <ul class="daftar-statis">${baris}</ul>
    <div class="aksi-form"><a class="tombol-utama" href="/#kosakata/${esc(kat.kode)}">Buka di kamus interaktif</a></div>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'DefinedTermSet',
        name: `Kosakata Bahasa Arab Mesir: ${kat.nama}`,
        description: deskripsi,
        url: cfg.urlWebsite + jalur,
        inLanguage: 'id',
        hasDefinedTerm: daftar.slice(0, 200).map((k) => ({ '@type': 'DefinedTerm', name: k.indo, url: `${cfg.urlWebsite}/kata/${k.slug}/` }))
      },
      remah(cfg, [['Beranda', '/'], ['Kosakata', '/kosakata/'], [kat.nama, jalur]])
    ]
  };
  return { jalur, html: kerangka({ cfg, judul, deskripsi, jalur, isi, jsonld }) };
}

function halamanSemuaKategori(cfg, data) {
  const jalur = '/kosakata/';
  const judul = 'Kamus Bahasa Arab Mesir untuk Maba Indonesia: Semua Kosakata';
  const deskripsi = potong(`${data.kosakata.length} kata dan kalimat bahasa Arab Mesir ('Ammiyah), Fusha, dan Madinah untuk mahasiswa baru Indonesia di Mesir, dikelompokkan per situasi.`, 158);
  const ubin = data.kategori.map((c) => {
    const n = data.kosakata.filter((k) => k.sub === c.kode).length;
    return `<li><a href="/kosakata/${c.slug}/"><span class="ikon" aria-hidden="true">${esc(c.ikon || '')}</span><strong>${esc(c.nama)}</strong><small>${esc(c.deskripsi || '')}</small><span class="jumlah">${n} kata dan kalimat</span></a></li>`;
  }).join('');
  const isi = `
    ${remahHtml([['Beranda', '/'], ['Kosakata', jalur]])}
    <h1>Kamus Bahasa Arab Mesir untuk Maba Indonesia</h1>
    <p class="lead">Kosakata dan kalimat sehari-hari dalam 'Ammiyah Mesir, dibandingkan dengan Fusha dan logat Madinah. Pilih situasi yang kamu hadapi.</p>
    <ul class="ubin-statis">${ubin}</ul>`;
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', name: judul, description: deskripsi, url: cfg.urlWebsite + jalur, inLanguage: 'id' },
      remah(cfg, [['Beranda', '/'], ['Kosakata', jalur]])
    ]
  };
  return { jalur, html: kerangka({ cfg, judul, deskripsi, jalur, isi, jsonld }) };
}

/* ---------- Tulis semua ---------- */
async function tulis(jalur, html) {
  const file = path.join(SITE, jalur, 'index.html');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, html, 'utf8');
}

async function main() {
  const cfg = await bacaConfig();
  const data = olahData(await ambilData(cfg));
  const hariIni = tanggal(data.diperbarui);

  for (const dir of ['kata', 'kosakata']) {
    if (existsSync(path.join(SITE, dir))) await rm(path.join(SITE, dir), { recursive: true, force: true });
  }

  const halaman = [];
  const perKat = {};
  data.kosakata.forEach((k) => { (perKat[k.sub] = perKat[k.sub] || []).push(k); });

  for (const k of data.kosakata) {
    const kat = data.kategori.find((c) => c.kode === k.sub);
    const satuSub = perKat[k.sub] || [];
    const i = satuSub.indexOf(k);
    const tetangga = satuSub.slice(Math.max(0, i - 6), i).concat(satuSub.slice(i + 1, i + 7)).slice(0, 12);
    const h = halamanKata(cfg, k, kat, tetangga);
    await tulis(h.jalur, h.html);
    halaman.push([h.jalur, 0.6]);
  }
  for (const kat of data.kategori) {
    const h = halamanKategori(cfg, kat, perKat[kat.kode] || []);
    await tulis(h.jalur, h.html);
    halaman.push([h.jalur, 0.8]);
  }
  const semua = halamanSemuaKategori(cfg, data);
  await tulis(semua.jalur, semua.html);
  halaman.push([semua.jalur, 0.9]);

  /* sitemap & robots */
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${cfg.urlWebsite}/</loc><lastmod>${hariIni}</lastmod><priority>1.0</priority></url>
${halaman.map(([j, p]) => `  <url><loc>${esc(cfg.urlWebsite + j)}</loc><lastmod>${hariIni}</lastmod><priority>${p}</priority></url>`).join('\n')}
</urlset>
`;
  await writeFile(path.join(SITE, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(path.join(SITE, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${cfg.urlWebsite}/sitemap.xml\n`, 'utf8');

  /* link statis di halaman utama (di antara penanda) */
  const indexFile = path.join(SITE, 'index.html');
  let index = await readFile(indexFile, 'utf8');
  const daftar = `<!--DAFTAR-KOSAKATA-->
      <nav class="daftar-situs" aria-label="Daftar kosakata">
        <p><b>Daftar kosakata:</b> ${data.kategori.map((c) => `<a href="/kosakata/${c.slug}/">${esc(c.nama)}</a>`).join(' · ')} · <a href="/kosakata/">Semua</a></p>
      </nav>
      <!--/DAFTAR-KOSAKATA-->`;
  index = index.replace(/<!--DAFTAR-KOSAKATA-->[\s\S]*?<!--\/DAFTAR-KOSAKATA-->/, daftar);
  await writeFile(indexFile, index, 'utf8');

  console.log(`[halaman] selesai: ${data.kosakata.length} halaman kata, ${data.kategori.length} halaman situasi, sitemap ${halaman.length + 1} alamat`);
}

main().catch((err) => {
  /* Jangan sampai website gagal online hanya karena halaman SEO gagal dibuat */
  console.error('[halaman] GAGAL membuat halaman SEO:', err);
  process.exit(0);
});
