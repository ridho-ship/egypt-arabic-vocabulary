/* =====================================================================
   EGYPTIAN ARABIC VOCABULARY — WEBSITE PENGUNJUNG
   ---------------------------------------------------------------------
   Alur:
   1. Layar loading (video logo + persen) sambil mengambil data Supabase
   2. Data diolah, lalu halaman Home tampil
   3. Mode admin (admin.js) baru dimuat kalau ada yang login
   Pengaturan (link Supabase, Cloudinary, fitur) ada di config.js.
   ===================================================================== */
(function () {
  'use strict';

  const CFG = window.EAV_CONFIG || {};
  const TEKS = window.EAV_TEKS || { id: {}, en: {} };
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.114.0/dist/umd/supabase.js';
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;
  const kurangiGerak = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Penyimpanan kecil di browser (tema, bahasa). Aman kalau diblokir. */
  const simpan = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* abaikan */ } }
  };

  /* ===================================================================
     BAHASA (ID / EN)
     =================================================================== */
  let bahasa = root.getAttribute('lang') === 'en' ? 'en' : 'id';

  function t(kunci, isi) {
    let s = (TEKS[bahasa] && TEKS[bahasa][kunci]);
    if (s == null) s = TEKS.id[kunci];
    if (s == null) s = kunci;
    if (isi) s = s.replace(/\{(\w+)\}/g, (_, n) => (isi[n] == null ? '' : isi[n]));
    return s;
  }
  /* Teks data: versi English kalau mode EN dan kolom English terisi, kalau tidak pakai Indonesia */
  function pilih(id, en) {
    return bahasa === 'en' && en && String(en).trim() ? en : (id || '');
  }

  /* ===================================================================
     ALAT BANTU
     =================================================================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  /* Baris kosong = paragraf baru, enter biasa = baris baru */
  function keParagraf(teks) {
    return String(teks || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
  }
  function sudahDicek(status) { return /^(sudah|final)/i.test(String(status || '')); }

  let waktuToast;
  function toast(pesan, gagal) {
    const el = $('toast');
    el.textContent = pesan;
    el.classList.toggle('gagal', !!gagal);
    el.hidden = false;
    clearTimeout(waktuToast);
    waktuToast = setTimeout(() => { el.hidden = true; }, gagal ? 6000 : 3500);
  }

  function headerSupabase(tambahan) {
    const k = String(CFG.supabaseKey || '');
    const h = { apikey: k, 'Content-Type': 'application/json' };
    if (/^eyJ/.test(k)) h.Authorization = 'Bearer ' + k;   /* kunci lama (anon JWT) */
    return Object.assign(h, tambahan || {});
  }
  function supabaseSiap() {
    return /^https:\/\/[^/]+/.test(CFG.supabaseUrl || '') && !/ISI-/.test((CFG.supabaseUrl || '') + (CFG.supabaseKey || ''));
  }
  function urlSupabase(jalur) { return String(CFG.supabaseUrl || '').replace(/\/+$/, '') + jalur; }

  /* ===================================================================
     MEDIA (Cloudinary, dengan cadangan file lokal)
     =================================================================== */
  const LOKAL = {
    loaderVideo: 'assets/media/loader.mp4',
    logo: 'assets/img/logo.webp',
    headerPagi: 'assets/img/header-pagi.jpg',
    headerMalam: 'assets/img/header-malam.jpg'
  };
  const RE_CLD = /^(https?:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload\/)(.+)$/;
  function cld(url, ubahan) {
    const m = String(url || '').match(RE_CLD);
    return m ? m[1] + ubahan + '/' + m[2] : url;
  }
  function media(k) {
    const u = CFG.media && CFG.media[k] ? String(CFG.media[k]).trim() : '';
    return u || LOKAL[k];
  }

  const fotoDimuat = {};
  function muatFoto(id, selesai) {
    const img = $(id);
    const kunci = id === 'fotoMalam' ? 'headerMalam' : 'headerPagi';
    if (fotoDimuat[id]) { if (selesai) fotoDimuat[id].then(selesai); return; }
    fotoDimuat[id] = new Promise((ok) => {
      const beres = () => { img.classList.add('siap'); ok(); };
      img.addEventListener('load', beres, { once: true });
      img.addEventListener('error', function cadangan() {
        if (img.dataset.cadangan) { ok(); return; }
        img.dataset.cadangan = '1';
        img.removeAttribute('srcset');
        img.addEventListener('load', beres, { once: true });
        img.addEventListener('error', ok, { once: true });
        img.src = LOKAL[kunci];
      }, { once: true });
      const url = media(kunci);
      if (RE_CLD.test(url)) {
        img.srcset = [800, 1280, 1920, 2560].map((w) => `${cld(url, 'f_auto,q_auto,c_limit,w_' + w)} ${w}w`).join(', ');
        img.sizes = '100vw';
        img.src = cld(url, 'f_auto,q_auto,c_limit,w_1600');
      } else {
        img.src = url;
      }
      if (img.complete && img.naturalWidth) beres();
    });
    if (selesai) fotoDimuat[id].then(selesai);
  }

  /* ===================================================================
     MODE PAGI / MALAM (dipilih manual, disimpan di browser)
     =================================================================== */
  function temaSekarang() { return root.getAttribute('data-tema') === 'malam' ? 'malam' : 'pagi'; }
  function terapkanTema(tema, simpanJuga) {
    root.setAttribute('data-tema', tema);
    const meta = $('warnaTema');
    if (meta) meta.setAttribute('content', tema === 'malam' ? '#0A1730' : '#F4EBDD');
    if (simpanJuga) simpan.set('eav-tema', tema);
    labelTema();
    muatFoto(tema === 'malam' ? 'fotoMalam' : 'fotoPagi');
  }
  function labelTema() {
    const malam = temaSekarang() === 'malam';
    document.querySelectorAll('.label-tema').forEach((el) => { el.dataset.label = malam ? t('modeMalam') : t('modePagi'); });
    document.querySelectorAll('[data-aksi="tema"]').forEach((el) => {
      el.setAttribute('aria-label', malam ? t('keModePagi') : t('keModeMalam'));
    });
  }

  /* ===================================================================
     LAYAR LOADING: persen mengikuti proses sebenarnya
     (data 60%, foto header 25%, huruf 15%) + video logo diputar sekali
     =================================================================== */
  const Loader = {
    bagian: { data: 0, foto: 0, font: 0 },
    bobot: { data: 0.6, foto: 0.25, font: 0.15 },
    tampil: 0,
    videoSelesai: false,
    dataSiap: false,
    tertutup: false,
    batasWaktu: null,
    set(k, v) { this.bagian[k] = Math.max(this.bagian[k], Math.min(1, v)); },
    semuaSiap() { return this.dataSiap && this.bagian.foto >= 1 && this.bagian.font >= 1; },
    target() {
      if (this.semuaSiap()) return 100;
      const n = Object.keys(this.bobot).reduce((s, k) => s + this.bobot[k] * this.bagian[k], 0) * 100;
      return Math.min(99, n);
    },
    jalan() {
      const langkah = () => {
        if (this.tertutup) return;
        const tg = this.target();
        const beda = tg - this.tampil;
        if (beda > 0) this.tampil = Math.min(tg, this.tampil + Math.max(0.6, beda * 0.14));
        const n = Math.floor(this.tampil);
        $('loaderAngka').textContent = n;
        $('loaderBar').style.width = n + '%';
        if (n >= 100 && this.videoSelesai) { this.tutup(); return; }
        if (this.semuaSiap() && !this.batasWaktu) {
          /* Kalau video tersendat, jangan menahan pengunjung lebih dari 6 detik */
          this.batasWaktu = setTimeout(() => { this.videoSelesai = true; }, 6000);
        }
        requestAnimationFrame(langkah);
      };
      requestAnimationFrame(langkah);
    },
    tutup() {
      this.tertutup = true;
      clearTimeout(this.batasWaktu);
      $('loader').classList.add('selesai');
      document.body.classList.remove('terkunci');
      document.body.classList.add('mulai');
      const v = $('loaderVideo');
      setTimeout(() => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) { /* abaikan */ } }, 600);
      /* Foto mode satunya dimuat belakangan supaya loading awal ringan */
      setTimeout(() => muatFoto(temaSekarang() === 'malam' ? 'fotoPagi' : 'fotoMalam'), 2500);
    },
    gagal(pesan) {
      this.tertutup = true;
      $('loaderGagal').hidden = false;
      $('loaderPesan').textContent = pesan;
      $('loaderUlang').textContent = t('cobaLagi');
    }
  };

  function mulaiVideoLoader() {
    const v = $('loaderVideo');
    const urlLogo = media('logo');
    if (urlLogo !== LOKAL.logo) {
      const img = $('loaderLogo');
      img.addEventListener('error', () => { img.src = LOKAL.logo; }, { once: true });
      img.src = RE_CLD.test(urlLogo) ? cld(urlLogo, 'f_auto,q_auto,c_limit,w_900') : urlLogo;
    }
    const logoDiam = () => {
      if (Loader.videoSelesai || !v.isConnected) return;
      v.hidden = true;
      $('loaderLogo').hidden = false;
      setTimeout(() => { Loader.videoSelesai = true; }, kurangiGerak ? 300 : 1600);
    };
    if (kurangiGerak) { logoDiam(); return; }

    const potong = Number(CFG.loaderPotongDetik) || 3.5;
    /* WebM (lebih kecil) kalau browser bisa, kalau tidak MP4 */
    const bisaWebm = !!v.canPlayType && v.canPlayType('video/webm; codecs="vp9"') !== '';
    let url = media('loaderVideo');
    if (RE_CLD.test(url)) {
      url = cld(url, `eo_${potong},ac_none,q_auto`);
      if (bisaWebm) url = url.replace(/\.(mp4|mov|m4v)(\?.*)?$/i, '.webm$2');
    } else if (url === LOKAL.loaderVideo && bisaWebm) {
      url = 'assets/media/loader.webm';
    }
    let cadangan = setTimeout(logoDiam, 2500);   /* video belum jalan dalam 2,5 detik */
    v.addEventListener('playing', () => { clearTimeout(cadangan); cadangan = null; }, { once: true });
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= potong - 0.05) { v.pause(); Loader.videoSelesai = true; }
    });
    v.addEventListener('ended', () => { Loader.videoSelesai = true; });
    v.addEventListener('error', () => { clearTimeout(cadangan); logoDiam(); });
    v.src = url;
    const p = v.play();
    if (p && p.catch) p.catch(() => { clearTimeout(cadangan); logoDiam(); });
  }

  /* ===================================================================
     DATA
     =================================================================== */
  let DATA = null;
  let pakaiCadangan = false;

  async function ambilJsonDenganProgres(url, opsi) {
    const res = await fetch(url, opsi);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(simpan.get('eav-ukuran')) || Number(res.headers.get('content-length')) || 260000;
    if (!res.body || !res.body.getReader || typeof TextDecoder === 'undefined') {
      const j = await res.json();
      Loader.set('data', 1);
      return j;
    }
    const reader = res.body.getReader();
    const potongan = [];
    let diterima = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      potongan.push(value);
      diterima += value.length;
      Loader.set('data', Math.min(0.97, diterima / total));
    }
    const semua = new Uint8Array(diterima);
    let posisi = 0;
    potongan.forEach((b) => { semua.set(b, posisi); posisi += b.length; });
    simpan.set('eav-ukuran', String(diterima));
    Loader.set('data', 1);
    return JSON.parse(new TextDecoder('utf-8').decode(semua));
  }

  async function ambilData() {
    if (supabaseSiap()) {
      try {
        return await ambilJsonDenganProgres(urlSupabase('/rest/v1/rpc/data_publik'),
          { headers: headerSupabase(), cache: 'no-store' });
      } catch (err) {
        console.warn('[EAV] Supabase tidak bisa dihubungi, memakai data cadangan.', err);
      }
    }
    /* Cadangan: salinan data di repo (dipakai sebelum Supabase diisi, atau saat Supabase bermasalah) */
    pakaiCadangan = true;
    return ambilJsonDenganProgres('assets/data/cadangan.json', { cache: 'no-cache' });
  }

  const KOLOM_KOSAKATA = ['id', 'sub', 'tipe', 'indo', 'en', 'fusha_ar', 'fusha_lat', 'mesir_ar', 'mesir_lat',
    'saudi_ar', 'saudi_lat', 'catatan', 'catatan_en', 'status'];

  /* Satu baris tabel kosakata (objek) -> bentuk yang dipakai tampilan */
  function dariBaris(r) {
    const g = (k) => (r[k] == null ? '' : String(r[k]));
    return {
      id: g('id'), sub: g('sub'), tipe: g('tipe'), indo: g('indo'), en: g('en'),
      fusha: { ar: g('fusha_ar'), lat: g('fusha_lat') },
      mesir: { ar: g('mesir_ar'), lat: g('mesir_lat') },
      saudi: { ar: g('saudi_ar'), lat: g('saudi_lat') },
      catatan: g('catatan'), catatan_en: g('catatan_en'), status: g('status')
    };
  }

  function siapkanData(raw) {
    const kolom = raw.kosakata_kolom || KOLOM_KOSAKATA;
    const kosakata = (raw.kosakata || []).map((baris) => {
      if (!Array.isArray(baris)) return dariBaris(baris);
      const o = {};
      kolom.forEach((k, i) => { o[k] = baris[i]; });
      return dariBaris(o);
    });
    const panduan = { tujuan: {}, kenapa: {}, prinsip: {}, caraBaca: [] };
    (raw.panduan || []).forEach((p) => {
      if (/^baca_/.test(p.kunci)) panduan.caraBaca.push(p);
      else panduan[p.kunci] = p;
    });
    return {
      kategori: raw.kategori || [],
      kosakata,
      tentang: raw.tentang || {},
      administrasi: raw.administrasi || [],
      panduan,
      diperbarui: raw.diperbarui || null
    };
  }

  /* ===================================================================
     PENCARIAN DUA ARAH (Indonesia/English/latin dan tulisan Arab)
     =================================================================== */
  const HURUF_ARAB = /[؀-ۿ]/;
  function normalLatin(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/sh/g, 'sy').replace(/[^a-z0-9\s]/g, '').replace(/(.)\1+/g, '$1').replace(/\s+/g, ' ').trim();
  }
  function normalArab(s) {
    return String(s || '').replace(/[ً-ْٰـ]/g, '').replace(/[إأآٱ]/g, 'ا')
      .replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/[؟،!?.,]/g, '').replace(/\s+/g, ' ').trim();
  }
  function indeksSatu(k) {
    k._indo = normalLatin(k.indo);
    k._en = normalLatin(k.en);
    k._lat = normalLatin([k.indo, k.en, k.fusha.lat, k.mesir.lat, k.saudi.lat].join(' '));
    k._ar = normalArab([k.fusha.ar, k.mesir.ar, k.saudi.ar].join(' '));
  }
  function perbaruiIndeks() { DATA.kosakata.forEach(indeksSatu); }

  function cari(q) {
    const arab = HURUF_ARAB.test(q);
    const nq = arab ? normalArab(q) : normalLatin(q);
    if (!nq) return [];
    const kata = nq.split(' ');
    const utama = (k) => (bahasa === 'en' && k._en ? k._en : k._indo);
    return DATA.kosakata
      .filter((k) => kata.every((w) => (arab ? k._ar : k._lat).indexOf(w) !== -1))
      .map((k) => {
        const u = utama(k);
        return { k, skor: u === nq ? 3 : (u.indexOf(nq) === 0 ? 2 : 1) };
      })
      .sort((a, b) => b.skor - a.skor).map((x) => x.k);
  }

  /* ===================================================================
     KEADAAN HALAMAN
     =================================================================== */
  const state = {
    view: 'home',          /* home, sub, cari, tentang, administrasi, usulkan, kelola */
    sebelumCari: 'home',
    sub: null,
    query: '',
    halaman: 0,
    tampil: { fusha: true, mesir: true, saudi: true },
    usulan: null           /* isian awal formulir masukan (misalnya koreksi entri tertentu) */
  };
  const perHalaman = () => (window.innerWidth < 900 ? 5 : 10);
  let arahGeser = '';
  const panel = $('panel');

  const hooks = { kartuAksi: null, setelahRender: null };
  const VIEWS = {};

  const logatDaftar = () => [
    { key: 'fusha', nama: t('logatFusha') },
    { key: 'mesir', nama: t('logatMesir') },
    { key: 'saudi', nama: t('logatSaudi') }
  ];
  function kategoriDari(kode) { return DATA.kategori.find((c) => c.kode === kode) || null; }
  function namaSub(kode) { const c = kategoriDari(kode); return c ? pilih(c.nama, c.nama_en) : kode; }
  function jumlahKata(kode) { return DATA.kosakata.filter((k) => k.sub === kode).length; }
  const BINTANG = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.5l2.6 4.2 4.8-1.1-1.1 4.8 4.2 2.6-4.2 2.6 1.1 4.8-4.8-1.1L12 22.5l-2.6-4.2-4.8 1.1 1.1-4.8L1.5 12l4.2-2.6-1.1-4.8 4.8 1.1z"/></svg>';
  function kotakKosong(judul, isi, tambahan) {
    return `<div class="kosong">${BINTANG}<h3>${judul}</h3><p>${isi}</p>${tambahan || ''}</div>`;
  }

  /* ===================================================================
     POTONGAN TAMPILAN
     =================================================================== */
  function tombolLogat() {
    return `<div class="logat-pilih" role="group" aria-label="${esc(t('pilihLogat'))}">
      ${logatDaftar().map((l) => `<button type="button" class="${l.key}" data-logat="${l.key}" aria-pressed="${state.tampil[l.key]}">${esc(l.nama)}</button>`).join('')}
    </div>`;
  }

  function kartuKata(k, denganSub) {
    const aktif = logatDaftar().filter((l) => state.tampil[l.key]);
    const isi = aktif.map((l) => {
      const v = k[l.key] || {};
      return `<div class="logat ${l.key}">
          <span class="logat-nama">${esc(l.nama)}</span>
          <div class="logat-teks"><p class="ar" lang="ar" dir="rtl">${esc(v.ar) || '&ndash;'}</p><p class="lat">${esc(v.lat)}</p></div>
        </div>`;
    }).join('');
    const judul = pilih(k.indo, k.en);
    const kedua = bahasa === 'en' ? (k.en ? k.indo : '') : k.en;
    const catatan = pilih(k.catatan, k.catatan_en);
    const tipe = /kalimat/i.test(k.tipe) ? t('tipeKalimat') : t('tipeKosakata');
    const aksi = [];
    if (CFG.fiturMasukan) aksi.push(`<button type="button" data-koreksi="${esc(k.id)}">${esc(t('laporkanKoreksi'))}</button>`);
    if (hooks.kartuAksi) aksi.push(hooks.kartuAksi(k));
    return `<article class="kartu" style="--n:${aktif.length}" data-id="${esc(k.id)}">
        <div class="kartu-kepala">
          <div>
            <h3>${esc(judul)}</h3>
            ${kedua ? `<p class="kartu-terjemah">${esc(kedua)}</p>` : ''}
            ${denganSub ? `<p class="kartu-asal">${esc(namaSub(k.sub))}</p>` : ''}
          </div>
          <div><span class="tipe">${esc(tipe)}</span>${sudahDicek(k.status) ? '' : `<br><span class="draf">${esc(t('belumDiverifikasi'))}</span>`}</div>
        </div>
        ${isi}
        ${catatan ? `<p class="catatan">${esc(catatan)}</p>` : ''}
        ${aksi.length ? `<div class="kartu-bawah">${aksi.join('')}</div>` : ''}
      </article>`;
  }

  function chipSub() {
    return DATA.kategori.map((c) =>
      `<button type="button" class="chip" data-sub="${esc(c.kode)}" aria-pressed="${state.view === 'sub' && c.kode === state.sub}">
         <span aria-hidden="true">${esc(c.ikon || '')}</span>${esc(pilih(c.nama, c.nama_en))}</button>`).join('');
  }

  function daftarBerhalaman(list, denganSub) {
    const per = perHalaman();
    const total = Math.max(1, Math.ceil(list.length / per));
    if (state.halaman > total - 1) state.halaman = total - 1;
    if (state.halaman < 0) state.halaman = 0;
    const awal = state.halaman * per;
    const potong = list.slice(awal, awal + per);
    const kelas = arahGeser ? ' ' + arahGeser : '';
    arahGeser = '';
    let html = `<div class="daftar${kelas}" id="daftarKartu">${potong.map((k) => kartuKata(k, denganSub)).join('')}</div>`;
    if (total > 1) {
      const titik = total <= 20
        ? `<div class="titik" role="group" aria-label="${esc(t('pilihHalaman'))}">${Array.from({ length: total }, (_, i) =>
          `<button type="button" data-ke="${i}" aria-label="${esc(t('halamanKe', { n: i + 1 }))}" aria-current="${i === state.halaman}"></button>`).join('')}</div>`
        : '';
      html += `<div class="halaman">
          <button type="button" data-hal="mundur" ${state.halaman === 0 ? 'disabled' : ''}>&lsaquo; ${esc(t('sebelumnya'))}</button>
          <span class="halaman-info" aria-live="polite"><b>${state.halaman + 1} / ${total}</b>${esc(t('rentang', { a: awal + 1, b: Math.min(awal + per, list.length), n: list.length }))}</span>
          <button type="button" data-hal="maju" ${state.halaman >= total - 1 ? 'disabled' : ''}>${esc(t('berikutnya'))} &rsaquo;</button>
        </div>${titik}`;
    }
    return html;
  }

  function gantiHalaman(arah) {
    const sebelum = state.halaman;
    if (arah === 'maju') state.halaman += 1;
    else if (arah === 'mundur') state.halaman -= 1;
    else state.halaman = Number(arah);
    if (state.halaman === sebelum) return;
    arahGeser = state.halaman > sebelum ? 'geser-kiri' : 'geser-kanan';
    render(false);
    const atas = $('daftarKartu');
    if (atas && atas.getBoundingClientRect().top < 64) {
      atas.scrollIntoView({ behavior: kurangiGerak ? 'auto' : 'smooth', block: 'start' });
    }
  }

  /* ===================================================================
     HALAMAN-HALAMAN
     =================================================================== */
  VIEWS.home = function () {
    const P = DATA.panduan;
    const ubin = DATA.kategori.map((c) => `
      <button type="button" class="ubin" data-sub="${esc(c.kode)}">
        <span class="ikon" aria-hidden="true">${esc(c.ikon || '')}</span>
        <strong>${esc(pilih(c.nama, c.nama_en))}</strong>
        <small>${esc(pilih(c.deskripsi, c.deskripsi_en))}</small>
        <span class="jumlah">${esc(t('jumlahKata', { n: jumlahKata(c.kode) }))}</span>
      </button>`).join('');

    const kenapaTeks = pilih(P.kenapa.isi, P.kenapa.isi_en);
    const kenapa = String(kenapaTeks || '').split('\n').map((b) => b.trim()).filter(Boolean).map((b) => {
      const i = b.indexOf(':');
      const label = i > 0 ? b.slice(0, i) : '';
      let isi = i > 0 ? b.slice(i + 1).trim() : b;
      isi = isi.charAt(0).toUpperCase() + isi.slice(1);
      const cls = /fusha/i.test(label) ? 'fusha' : /mesir|ammiyah|egypt/i.test(label) ? 'mesir' : 'saudi';
      return `<div class="baris-bahasa ${cls}"><b>${esc(label)}</b><span>${esc(isi)}</span></div>`;
    }).join('');

    const caraBaca = P.caraBaca.map((r) => {
      let baca = String(pilih(r.isi, r.isi_en)).trim();
      baca = baca.replace(/^\(apostrof\)/, "' (apostrof)").replace(/^\(apostrophe\)/, "' (apostrophe)");
      const huruf = HURUF_ARAB.test(r.label) ? r.label : pilih(r.label, ({ 'Vokal panjang': 'Long vowels', 'Khas Mesir': 'Egyptian specifics' })[r.label]);
      return `<tr><td ${HURUF_ARAB.test(r.label) ? 'lang="ar" dir="rtl" style="text-align:left"' : 'style="font-family:inherit;font-size:.92rem;font-weight:700"'}>${esc(huruf)}</td><td>${esc(baca)}</td></tr>`;
    }).join('');
    const prinsip = pilih(P.prinsip.isi, P.prinsip.isi_en);

    return `
      <h2>${esc(t('homeJudul'))}</h2>
      <p class="lead">${esc(pilih(P.tujuan.isi, P.tujuan.isi_en) || t('homeLeadCadangan'))}</p>
      <div class="grid-sub">${ubin}</div>
      ${kenapa ? `<div class="bagian"><h3>${esc(t('kenapaTigaBahasa'))}</h3><div class="tiga-bahasa">${kenapa}</div></div>` : ''}
      ${caraBaca ? `<div class="bagian">
        <details class="lipat">
          <summary>${esc(t('caraBaca'))}</summary>
          <div class="isi-lipat">
            ${prinsip ? `<p class="info">${esc(prinsip)}</p>` : ''}
            <table class="tabel-baca"><tbody>${caraBaca}</tbody></table>
          </div>
        </details></div>` : ''}`;
  };

  VIEWS.sub = function () {
    const s = kategoriDari(state.sub) || {};
    const list = DATA.kosakata.filter((k) => k.sub === state.sub);
    const tambah = hooks.tombolTambah ? hooks.tombolTambah(state.sub) : '';
    return `
      <div class="chips" role="group" aria-label="${esc(t('pilihSituasi'))}">${chipSub()}</div>
      <h2>${esc((s.ikon ? s.ikon + ' ' : '') + (pilih(s.nama, s.nama_en) || t('menuKosakata')))}</h2>
      <p class="lead" style="margin-bottom:0">${esc(pilih(s.deskripsi, s.deskripsi_en))}</p>
      ${tombolLogat()}
      <p class="info">${esc(t('jumlahKata', { n: list.length }))}</p>
      ${tambah}
      ${list.length
        ? daftarBerhalaman(list, false)
        : kotakKosong(esc(t('subKosongJudul')), esc(t('subKosongIsi')))}`;
  };

  VIEWS.cari = function () {
    const q = state.query.trim();
    const list = cari(q);
    const usul = CFG.fiturMasukan ? `<button type="button" class="tombol-garis" data-go="usulkan">${esc(t('usulkanKataIni'))}</button>` : '';
    return `
      <h2>${esc(t('hasilUntuk', { q }))}</h2>
      ${list.length ? tombolLogat() + `<p class="info">${esc(t('jumlahHasil', { n: list.length }))}</p>` : ''}
      ${list.length
        ? daftarBerhalaman(list, true)
        : kotakKosong(esc(t('tidakDitemukanJudul')), esc(t('tidakDitemukanIsi')), usul)}`;
  };

  function linkFoto(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([\w-]+)/) || s.match(/[?&]id=([\w-]+)/);
    if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w400`;
    if (RE_CLD.test(s)) return cld(s, 'f_auto,q_auto,c_fill,g_face,w_240,h_240');
    return s;
  }
  function daftarKontak(teks) {
    return String(teks || '').split(/[,\n|]+/).map((x) => x.trim()).filter(Boolean).map((x) => {
      const ig = x.match(/^(ig|instagram)\s*[:;]?\s*@?([\w.]+)/i);
      if (ig) return `<a href="https://instagram.com/${esc(ig[2])}" target="_blank" rel="noopener">Instagram @${esc(ig[2])}</a>`;
      if (/^https?:/i.test(x)) return `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(x.replace(/^https?:\/+/, ''))}</a>`;
      if (/^\S+@\S+\.\S+$/.test(x)) return `<a href="mailto:${esc(x)}">${esc(x)}</a>`;
      return `<span>${esc(x)}</span>`;
    }).join('');
  }
  function isiTentang(kunci) {
    const r = DATA.tentang[kunci];
    return r ? pilih(r.isi, r.isi_en) : '';
  }
  function namaPembuat() { return isiTentang('nama') || CFG.namaCadangan || ''; }

  VIEWS.tentang = function () {
    const nama = namaPembuat();
    const info = [['infoAsal', 'asal'], ['infoKampus', 'kampus'], ['infoTiba', 'angkatan']]
      .map(([label, k]) => [t(label), isiTentang(k)]).filter((x) => x[1])
      .map((x) => `<dt>${esc(x[0])}</dt><dd>${esc(x[1])}</dd>`).join('');
    const cerita = ['paragraf_1', 'paragraf_2', 'paragraf_3', 'paragraf_4'].filter((k) => isiTentang(k))
      .map((k) => `<h3>${esc(t('cerita_' + k))}</h3>${keParagraf(isiTentang(k))}`).join('');
    const awal = esc(nama.charAt(0) || '?');
    const fotoUrl = isiTentang('foto');
    const foto = fotoUrl
      ? `<img src="${esc(linkFoto(fotoUrl))}" alt="${esc(t('fotoDari', { nama }))}" onerror="this.parentNode.textContent='${awal}'">`
      : awal;
    const trakteer = CFG.trakteer
      ? `<div class="bagian"><p class="info">${esc(t('trakteerAjakan'))}</p><a class="tombol-trakteer" href="${esc(CFG.trakteer)}" target="_blank" rel="noopener"><span aria-hidden="true">☕</span> ${esc(t('trakteer'))}</a></div>`
      : '';
    return `
      <div class="profil">
        <div class="foto">${foto}</div>
        <div>
          <h2>${esc(nama)}</h2>
          ${info ? `<dl>${info}</dl>` : ''}
          ${isiTentang('kontak') ? `<div class="kontak">${daftarKontak(isiTentang('kontak'))}</div>` : ''}
        </div>
      </div>
      <div class="cerita">${cerita || kotakKosong(esc(t('ceritaKosongJudul')), esc(t('ceritaKosongIsi')))}</div>
      ${trakteer}`;
  };

  const URUTAN_TAHAP = ['1. Sebelum berangkat', '2. Minggu pertama di Mesir', '3. Selama tinggal', '4. Lainnya'];
  function daftarAtauTeks(s) {
    const bagian = String(s || '').split(/\n|;/).map((x) => x.trim()).filter(Boolean);
    return bagian.length > 1 ? `<ul>${bagian.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : `<p>${esc(s)}</p>`;
  }

  VIEWS.administrasi = function () {
    const kelompok = {};
    DATA.administrasi.forEach((a) => {
      const tahap = URUTAN_TAHAP.find((x) => x === a.tahap || x.slice(3) === a.tahap) || '4. Lainnya';
      (kelompok[tahap] = kelompok[tahap] || []).push(a);
    });
    const isi = URUTAN_TAHAP.map((tahap, i) => {
      const langkah = (kelompok[tahap] || []).map((a) => {
        const ringkas = [a.biaya && t('biaya', { x: a.biaya }), a.waktu && t('waktu', { x: a.waktu })].filter(Boolean).join(', ');
        const sumber = a.sumber
          ? (/^https?:/.test(a.sumber) ? `<a href="${esc(a.sumber)}" target="_blank" rel="noopener">${esc(t('bukaSumber'))}</a>` : esc(a.sumber))
          : esc(t('belumDicantumkan'));
        const tips = pilih(a.tips, a.tips_en);
        return `<details class="lipat langkah">
            <summary>${esc(pilih(a.judul, a.judul_en))}${sudahDicek(a.status) ? '' : ` <span class="draf">${esc(t('belumDiverifikasi'))}</span>`}
              ${ringkas ? `<span class="ringkas">${esc(ringkas)}</span>` : ''}</summary>
            <div class="isi-lipat">
              ${keParagraf(pilih(a.penjelasan, a.penjelasan_en))}
              ${a.dokumen ? `<h4>${esc(t('dokumen'))}</h4>${daftarAtauTeks(a.dokumen)}` : ''}
              ${a.tempat ? `<h4>${esc(t('tempat'))}</h4><p>${esc(a.tempat)}</p>` : ''}
              ${tips ? `<h4>${esc(t('tips'))}</h4><p>${esc(tips)}</p>` : ''}
              <h4>${esc(t('sumber'))}</h4><p>${sumber}${a.dicek ? esc(t('dicekPada', { x: a.dicek })) : ''}</p>
            </div>
          </details>`;
      }).join('');
      return `<div class="tahap">
          <h3 class="tahap-judul"><span class="tahap-no">${i + 1}</span>${esc(t('tahap' + (i + 1)))}</h3>
          ${langkah || `<p class="tahap-kosong">${esc(t('tahapKosong'))}</p>`}
        </div>`;
    }).join('');
    return `
      <h2>${esc(t('menuAdministrasi'))}</h2>
      <p class="lead">${esc(t('admLead'))}</p>
      <div class="peringatan">${esc(t('admPeringatan'))}</div>
      ${isi}`;
  };

  /* ---------- Formulir masukan / usulan kata ---------- */
  VIEWS.usulkan = function () {
    if (!CFG.fiturMasukan) return VIEWS.home();
    const u = state.usulan || {};
    const koreksi = u.jenis === 'Koreksi entri';
    const opsiSub = `<option value="">${esc(t('fBelumTahu'))}</option>` + DATA.kategori.map((c) =>
      `<option value="${esc(c.label || (c.kode + '. ' + c.nama))}" ${u.sub === c.kode ? 'selected' : ''}>${esc(c.kode + '. ' + pilih(c.nama, c.nama_en))}</option>`).join('');
    const jenis = ['Usulan kata baru', 'Koreksi entri', 'Saran website', 'Lainnya'];
    const isian = (nama, label, opsi) => {
      opsi = opsi || {};
      const nilai = esc(u[nama] || '');
      const ar = opsi.ar ? ' dir="rtl" lang="ar"' : '';
      const el = opsi.panjang
        ? `<textarea name="${nama}" rows="3"${ar}>${nilai}</textarea>`
        : `<input name="${nama}" value="${nilai}" autocomplete="off"${ar}${opsi.ph ? ` placeholder="${esc(opsi.ph)}"` : ''}>`;
      return `<label class="isian"><span>${esc(label)}</span>${el}${opsi.bantu ? `<small>${esc(opsi.bantu)}</small>` : ''}</label>`;
    };
    return `
      <h2>${esc(t('usulJudul'))}</h2>
      <p class="lead">${esc(t('usulLead'))}</p>
      <form class="formulir" id="formUsul" novalidate>
        <div class="baris-form dua">
          <label class="isian"><span>${esc(t('fJenis'))}</span>
            <select name="jenis">${jenis.map((j) => `<option value="${j}" ${(u.jenis || jenis[0]) === j ? 'selected' : ''}>${esc(t('jenis_' + jenis.indexOf(j)))}</option>`).join('')}</select></label>
          <label class="isian"><span>${esc(t('fSub'))}</span><select name="sub">${opsiSub}</select></label>
        </div>
        <div class="baris-form" ${koreksi ? '' : 'hidden'} data-koreksi-saja>
          ${isian('untuk_entri', t('fUntukEntri'), { bantu: t('fUntukEntriBantu') })}
        </div>
        ${isian('indo', t('fIndo'), { ph: t('fIndoContoh') })}
        <fieldset class="grup mesir"><legend>${esc(t('logatMesir'))}</legend>
          <div class="baris-form dua">${isian('mesir_ar', t('fArab'), { ar: true })}${isian('mesir_lat', t('fLatin'))}</div>
        </fieldset>
        <details class="lipat"><summary>${esc(t('fTambahan'))}</summary><div class="isi-lipat formulir" style="padding-top:4px">
          <fieldset class="grup fusha"><legend>${esc(t('logatFusha'))}</legend>
            <div class="baris-form dua">${isian('fusha_ar', t('fArab'), { ar: true })}${isian('fusha_lat', t('fLatin'))}</div></fieldset>
          <fieldset class="grup saudi"><legend>${esc(t('logatSaudi'))}</legend>
            <div class="baris-form dua">${isian('saudi_ar', t('fArab'), { ar: true })}${isian('saudi_lat', t('fLatin'))}</div></fieldset>
          ${isian('en', t('fEnglish'))}
        </div></details>
        ${isian('konteks', t('fKonteks'), { panjang: true, bantu: t('fKonteksBantu') })}
        <div class="baris-form dua">${isian('nama', t('fNama'), { bantu: t('fOpsional') })}${isian('kontak', t('fKontak'), { bantu: t('fKontakBantu') })}</div>
        <label class="isian cek"><input type="checkbox" name="tampilkan_nama"><span>${esc(t('fTampilkanNama'))}</span></label>
        <label class="madu" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label>
        <div class="aksi-form">
          <button type="submit" class="tombol-utama">${esc(t('fKirim'))}</button>
          <button type="button" class="tombol-garis" data-go="home">${esc(t('batal'))}</button>
        </div>
      </form>`;
  };

  async function kirimUsulan(form) {
    const fd = new FormData(form);
    if (fd.get('website')) return;   /* robot mengisi kolom tersembunyi */
    const ambil = (k) => String(fd.get(k) || '').trim();
    const data = {
      jenis: ambil('jenis'), sub: ambil('sub') || null, untuk_entri: ambil('untuk_entri') || null,
      indo: ambil('indo') || null, en: ambil('en') || null,
      fusha_ar: ambil('fusha_ar') || null, fusha_lat: ambil('fusha_lat') || null,
      mesir_ar: ambil('mesir_ar') || null, mesir_lat: ambil('mesir_lat') || null,
      saudi_ar: ambil('saudi_ar') || null, saudi_lat: ambil('saudi_lat') || null,
      konteks: ambil('konteks') || null, nama: ambil('nama') || null, kontak: ambil('kontak') || null,
      tampilkan_nama: fd.get('tampilkan_nama') ? 'Ya' : 'Tidak'
    };
    if (data.jenis !== 'Koreksi entri') data.untuk_entri = null;
    if (!data.indo && !data.mesir_ar && !data.konteks) { toast(t('fIsiDulu'), true); return; }
    if (!supabaseSiap()) { toast(t('fBelumAktif'), true); return; }
    const tombol = form.querySelector('[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = t('fMengirim');
    try {
      const res = await fetch(urlSupabase('/rest/v1/masukan'), {
        method: 'POST', headers: headerSupabase({ Prefer: 'return=minimal' }), body: JSON.stringify(data)
      });
      if (!res.ok) {
        const teks = await res.text();
        throw new Error(/Terlalu banyak/.test(teks) ? t('fTerlaluBanyak') : t('fGagal'));
      }
      state.usulan = null;
      panel.innerHTML = `<div class="pesan-ok"><h3>${esc(t('fTerkirimJudul'))}</h3><p>${esc(t('fTerkirimIsi'))}</p>
        <div class="aksi-form"><button type="button" class="tombol-utama" data-go="usulkan">${esc(t('fKirimLagi'))}</button>
        <button type="button" class="tombol-garis" data-go="home">${esc(t('menuHome'))}</button></div></div>`;
    } catch (err) {
      toast(err.message || t('fGagal'), true);
      tombol.disabled = false;
      tombol.textContent = t('fKirim');
    }
  }

  /* ===================================================================
     NAVIGASI (dengan alamat #... supaya tombol Back di HP berfungsi)
     =================================================================== */
  function keHash() {
    switch (state.view) {
      case 'home': return '';
      case 'sub': return '#kosakata/' + encodeURIComponent(state.sub || '');
      case 'cari': return '#cari/' + encodeURIComponent(state.query);
      default: return '#' + state.view;
    }
  }
  function catatRiwayat(ganti) {
    const url = location.pathname + location.search + keHash();
    if (url === location.pathname + location.search + location.hash) return;
    try { history[ganti ? 'replaceState' : 'pushState'](null, '', url); } catch (e) { /* abaikan */ }
  }
  function bacaHash() {
    let h = location.hash.slice(1);
    try { h = decodeURIComponent(h); } catch (e) { /* biarkan */ }
    if (!h || /=/.test(h.split('/')[0])) return { view: 'home' };
    const [a, ...sisa] = h.split('/');
    const b = sisa.join('/');
    if (a === 'kosakata') return { view: 'sub', sub: b || null };
    if (a === 'cari') return { view: 'cari', query: b };
    if (VIEWS[a]) return { view: a };
    return { view: 'home' };
  }
  function terapkanHash() {
    const h = bacaHash();
    if (h.view === 'sub') state.sub = kategoriDari(h.sub) ? h.sub : (DATA.kategori[0] || {}).kode;
    if (h.view === 'cari') {
      if (!h.query) h.view = 'home';
      else { state.query = h.query; $('inputCari').value = h.query; }
    }
    if (h.view === 'kelola' && !VIEWS.kelola) h.view = 'home';
    state.view = h.view;
    state.halaman = 0;
  }

  function render(scroll) {
    if (!DATA) return;
    const fungsi = VIEWS[state.view] || VIEWS.home;
    panel.innerHTML = fungsi();
    if (scroll !== 'diam') {
      panel.classList.remove('masuk');
      void panel.offsetWidth;
      panel.classList.add('masuk');
    }
    const aktif = state.view === 'cari' ? '' : state.view;
    document.querySelectorAll('[data-go]').forEach((b) => {
      if (b.classList.contains('link-nama') || b.classList.contains('merek') || b.closest('#panel') || b.closest('footer')) return;
      b.setAttribute('aria-current', String(b.dataset.go === aktif));
    });
    $('menuSub').innerHTML = chipSub();
    if (hooks.setelahRender) hooks.setelahRender();
    if (scroll === true) {
      panel.scrollIntoView({ behavior: kurangiGerak ? 'auto' : 'smooth', block: 'start' });
      panel.focus({ preventScroll: true });
    }
  }

  function buka(view, scroll) {
    if (view === 'sub' && !state.sub && DATA.kategori.length) state.sub = DATA.kategori[0].kode;
    if (!VIEWS[view]) view = 'home';
    state.view = view;
    state.halaman = 0;
    if (view !== 'cari') { state.query = ''; $('inputCari').value = ''; }
    catatRiwayat(false);
    render(scroll !== false);
  }

  /* ===================================================================
     KEJADIAN (klik, ketik, geser)
     =================================================================== */
  function pasangKejadian() {
    document.addEventListener('click', (e) => {
      const aksi = e.target.closest('[data-aksi]');
      if (aksi) {
        if (aksi.dataset.aksi === 'tema') terapkanTema(temaSekarang() === 'malam' ? 'pagi' : 'malam', true);
        if (aksi.dataset.aksi === 'bahasa') terapkanBahasa(bahasa === 'id' ? 'en' : 'id');
        return;
      }
      if (!DATA) return;
      const go = e.target.closest('[data-go]');
      if (go) {
        if (go.dataset.go === 'usulkan' && state.view === 'cari' && state.query) state.usulan = { indo: state.query };
        buka(go.dataset.go);
        return;
      }
      const sub = e.target.closest('[data-sub]');
      if (sub) { state.sub = sub.dataset.sub; buka('sub'); return; }
      const hal = e.target.closest('[data-hal]');
      if (hal) { gantiHalaman(hal.dataset.hal); return; }
      const ke = e.target.closest('[data-ke]');
      if (ke) { gantiHalaman(ke.dataset.ke); return; }
      const koreksi = e.target.closest('[data-koreksi]');
      if (koreksi) {
        const k = DATA.kosakata.find((x) => x.id === koreksi.dataset.koreksi) || {};
        state.usulan = { jenis: 'Koreksi entri', untuk_entri: k.id, indo: k.indo, sub: k.sub };
        buka('usulkan');
        return;
      }
      const lg = e.target.closest('[data-logat]');
      if (lg) {
        const key = lg.dataset.logat;
        const jumlahAktif = Object.values(state.tampil).filter(Boolean).length;
        if (state.tampil[key] && jumlahAktif === 1) return;   /* minimal satu bahasa tetap tampil */
        state.tampil[key] = !state.tampil[key];
        render('diam');
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches('#formUsul [name="jenis"]')) {
        const blok = document.querySelector('[data-koreksi-saja]');
        if (blok) blok.hidden = e.target.value !== 'Koreksi entri';
      }
    });
    document.addEventListener('submit', (e) => {
      if (e.target.id === 'formUsul') { e.preventDefault(); kirimUsulan(e.target); }
    });

    $('tombolKosakata').addEventListener('click', () => {
      const buka = $('menuSub').hidden;
      $('menuSub').hidden = !buka;
      $('tombolKosakata').setAttribute('aria-expanded', String(buka));
    });

    /* Pencarian langsung saat mengetik */
    let jeda;
    const jalankanCari = (scroll) => {
      if (!DATA) return;
      const q = $('inputCari').value.trim();
      if (q) {
        const baru = state.view !== 'cari';
        if (baru) state.sebelumCari = state.view;
        if (q !== state.query) state.halaman = 0;
        state.query = q;
        state.view = 'cari';
        catatRiwayat(!baru);
        render(scroll);
      } else if (state.view === 'cari') {
        state.view = state.sebelumCari === 'cari' ? 'home' : state.sebelumCari;
        state.query = '';
        catatRiwayat(true);
        render(false);
      }
    };
    $('inputCari').addEventListener('input', () => { clearTimeout(jeda); jeda = setTimeout(() => jalankanCari(false), 160); });
    $('formCari').addEventListener('submit', (e) => {
      e.preventDefault(); clearTimeout(jeda); jalankanCari(true); $('inputCari').blur();
    });

    window.addEventListener('popstate', () => {
      if (!DATA) return;
      terapkanHash();
      if (state.view !== 'cari') $('inputCari').value = '';
      render(false);
    });

    /* Geser kiri/kanan di daftar kartu untuk pindah halaman (HP & tablet) */
    let sx = null;
    let sy = null;
    panel.addEventListener('touchstart', (e) => {
      if (!e.target.closest('#daftarKartu')) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    panel.addEventListener('touchend', (e) => {
      if (sx === null || !panel.querySelector('[data-hal]')) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) gantiHalaman(dx < 0 ? 'maju' : 'mundur');
    }, { passive: true });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((en) => $('mini').classList.toggle('tampil', !en[0].isIntersecting), { threshold: 0, rootMargin: '-60px 0px 0px 0px' })
        .observe(document.querySelector('.hero-isi .menu'));
    }
    window.addEventListener('scroll', () => $('keAtas').classList.toggle('tampil', window.scrollY > 700), { passive: true });
    $('keAtas').addEventListener('click', () => window.scrollTo({ top: 0, behavior: kurangiGerak ? 'auto' : 'smooth' }));

    $('tombolAdmin').addEventListener('click', () => {
      if (window.EAV_ADMIN && window.EAV_ADMIN.aktif()) { buka('kelola'); return; }
      muatAdmin().then((a) => a && a.masuk());
    });
    $('loaderUlang').addEventListener('click', () => location.reload());
  }

  /* ===================================================================
     TEKS STATIS & JAM
     =================================================================== */
  function terjemahkanStatis() {
    document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = t(el.dataset.t); });
    document.querySelectorAll('[data-t-html]').forEach((el) => { el.innerHTML = t(el.dataset.tHtml); });
    $('inputCari').placeholder = t('cariContoh');
    document.title = t('judulHalaman');
    $('keAtas').setAttribute('aria-label', t('keAtas'));
    document.querySelectorAll('[data-aksi="bahasa"]').forEach((el) => el.setAttribute('aria-label', t('gantiBahasa')));
    labelTema();
    if (DATA) {
      const nama = namaPembuat();
      $('namaPembuat').textContent = nama;
      $('footerNama').textContent = nama;
      $('footerWaktu').textContent = (DATA.diperbarui ? t('diperbarui', { waktu: formatWaktu(DATA.diperbarui) }) : '')
        + (pakaiCadangan ? ' ' + t('dataCadangan') : '');
    }
    if (CFG.trakteer) { $('tombolTrakteer').href = CFG.trakteer; $('tombolTrakteer').hidden = false; }
    $('tombolUsulkan').hidden = !CFG.fiturMasukan;
    if (window.EAV_ADMIN && window.EAV_ADMIN.aktif()) $('tombolAdmin').textContent = t('kelolaData');
  }

  function formatWaktu(iso) {
    try {
      return new Intl.DateTimeFormat(bahasa === 'en' ? 'en-GB' : 'id-ID', {
        timeZone: 'Africa/Cairo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
      }).format(new Date(iso)).replace(',', '');
    } catch (e) { return String(iso); }
  }

  let jamTimer;
  function jalankanJam() {
    const ZONA = [
      { nama: t('jamMesir'), tz: 'Africa/Cairo' },
      { nama: t('jamIndonesia'), tz: 'Asia/Jakarta' },
      { nama: t('jamSaudi'), tz: 'Asia/Riyadh' }
    ];
    const lokal = bahasa === 'en' ? 'en-GB' : 'id-ID';
    $('jam').innerHTML = ZONA.map((z, i) =>
      `<div class="jam-item"><span class="jam-nama">${esc(z.nama)}</span><span class="jam-waktu" id="jam${i}">--:--</span><span class="jam-hari" id="hari${i}"></span></div>`).join('');
    const fJam = ZONA.map((z) => new Intl.DateTimeFormat(lokal, { timeZone: z.tz, hour: '2-digit', minute: '2-digit', hour12: false }));
    const fHari = ZONA.map((z) => new Intl.DateTimeFormat(lokal, { timeZone: z.tz, weekday: 'short' }));
    const tik = () => {
      const now = new Date();
      ZONA.forEach((z, i) => {
        $('jam' + i).textContent = fJam[i].format(now).replace('.', ':');
        $('hari' + i).textContent = fHari[i].format(now);
      });
    };
    tik();
    clearInterval(jamTimer);
    jamTimer = setInterval(tik, 10000);
  }

  function terapkanBahasa(b) {
    bahasa = b;
    root.setAttribute('lang', b);
    simpan.set('eav-bahasa', b);
    terjemahkanStatis();
    jalankanJam();
    if (DATA) render('diam');
  }

  /* ===================================================================
     MODE ADMIN (dimuat hanya kalau perlu)
     =================================================================== */
  function muatSkrip(src) {
    return new Promise((ok, gagal) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => gagal(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }
  let janjiAdmin = null;
  function muatAdmin() {
    if (!supabaseSiap()) { toast(t('adminBelumSiap'), true); return Promise.resolve(null); }
    if (!janjiAdmin) {
      janjiAdmin = (window.supabase ? Promise.resolve() : muatSkrip(SUPABASE_JS))
        .then(() => muatSkrip('assets/js/admin.js?v=1'))
        .then(() => window.EAV_ADMIN.mulai())
        .then(() => window.EAV_ADMIN)
        .catch((err) => {
          console.error(err);
          janjiAdmin = null;
          toast(t('adminGagalMuat'), true);
          return null;
        });
    }
    return janjiAdmin;
  }
  function adaSesiTersimpan() {
    try { return Object.keys(localStorage).some((k) => /^sb-.+-auth-token$/.test(k)); } catch (e) { return false; }
  }
  function kembaliDariLogin() {
    return /[?&](code|error_description)=/.test(location.search) || /(access_token|error_description)=/.test(location.hash);
  }

  /* Ganti seluruh data (dipakai admin setelah mengubah Tentang/Panduan/Kategori/Administrasi) */
  function gantiData(raw) {
    DATA = siapkanData(raw);
    pakaiCadangan = false;
    perbaruiIndeks();
    terjemahkanStatis();
    if (!kategoriDari(state.sub) && DATA.kategori.length) state.sub = DATA.kategori[0].kode;
  }

  /* Dipakai admin.js */
  window.EAV = {
    CFG, t, pilih, esc, keParagraf, sudahDicek, toast, headerSupabase, urlSupabase,
    get DATA() { return DATA; },
    state, hooks, views: VIEWS, render, buka, dariBaris, indeksSatu, perbaruiIndeks,
    namaSub, kartuKata, kotakKosong, terjemahkanStatis, gantiData, catatRiwayat,
    bahasa: () => bahasa
  };

  /* ===================================================================
     MULAI
     =================================================================== */
  function mulai() {
    document.body.classList.add('terkunci');
    terapkanTema(temaSekarang(), false);
    terjemahkanStatis();
    jalankanJam();
    pasangKejadian();

    /* bagian progres: foto header, huruf, data */
    const fotoAwal = temaSekarang() === 'malam' ? 'fotoMalam' : 'fotoPagi';
    muatFoto(fotoAwal, () => Loader.set('foto', 1));
    setTimeout(() => Loader.set('foto', 1), 8000);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => Loader.set('font', 1));
    else Loader.set('font', 1);
    setTimeout(() => Loader.set('font', 1), 3000);

    mulaiVideoLoader();
    Loader.jalan();

    ambilData()
      .then((raw) => {
        DATA = siapkanData(raw);
        if (!DATA.kategori.length) {
          DATA.kategori = [...new Set(DATA.kosakata.map((k) => k.sub))].map((k) => ({ kode: k, nama: k }));
        }
        state.sub = DATA.kategori.length ? DATA.kategori[0].kode : null;
        perbaruiIndeks();
        terjemahkanStatis();
        terapkanHash();
        render(false);
        Loader.dataSiap = true;
        if (kembaliDariLogin() || adaSesiTersimpan()) muatAdmin();
      })
      .catch((err) => {
        console.error(err);
        Loader.gagal(t('gagalMuat'));
      });
  }

  window.addEventListener('error', () => {
    if (!Loader.tertutup && !DATA) Loader.gagal(t('gagalMuat'));
  });

  mulai();
})();
