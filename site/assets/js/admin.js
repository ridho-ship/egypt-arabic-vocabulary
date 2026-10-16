/* =====================================================================
   EGYPTIAN ARABIC VOCABULARY — MODE ADMIN
   ---------------------------------------------------------------------
   Dimuat otomatis hanya kalau ada yang login (atau menekan "Masuk admin").
   Login pakai Google lewat Supabase. Yang boleh mengubah data hanyalah
   email yang terdaftar di tabel "admin" (dicek juga oleh database).
   ===================================================================== */
(function () {
  'use strict';

  const E = window.EAV;
  const CFG = E.CFG;
  const esc = E.esc;
  const $ = (id) => document.getElementById(id);

  const STATUS = ['Draf (perlu dicek)', 'Sudah dicek', 'Final', 'Diarsipkan'];
  const STATUS_MASUKAN = ['Baru', 'Sedang dicek', 'Diterima', 'Ditolak', 'Duplikat'];
  const TAHAP = ['1. Sebelum berangkat', '2. Minggu pertama di Mesir', '3. Selama tinggal', '4. Lainnya'];

  let sb = null;
  let profil = null;              /* { email, nama } */
  const A = {                     /* data lengkap khusus admin */
    kosakata: [], masukan: null, tentang: null, administrasi: null, panduan: null, kategori: null,
    log: [], logHabis: false, jumlahMasukanBaru: 0
  };
  const ui = { tab: 'kosakata', cari: '', status: '', sub: '', batas: 25, filterMasukan: 'Baru' };

  /* ===================================================================
     ALAT BANTU
     =================================================================== */
  function muatCss() {
    if (document.querySelector('link[data-admin-css]')) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'assets/css/admin.css?v=1';
    l.dataset.adminCss = '1';
    document.head.appendChild(l);
  }
  function waktu(iso) {
    if (!iso) return '';
    try {
      return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
        .format(new Date(iso)).replace(',', '').replace('.', ':');
    } catch (e) { return iso; }
  }
  function kelasStatus(s) {
    return 's-' + String(s || '').toLowerCase().replace(/\(.*\)/, '').trim().replace(/\s+/g, '-');
  }
  function pesanGalat(err) {
    const m = (err && (err.message || err.error_description)) || String(err);
    if (/JWT|token/i.test(m)) return 'Sesi login sudah habis. Keluar lalu masuk lagi.';
    if (/row-level security|permission denied/i.test(m)) return 'Akses ditolak. Pastikan email ini terdaftar sebagai admin.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Tidak ada koneksi internet. Coba lagi.';
    return m;
  }
  async function ambilSemua(tabel, urut, menurun) {
    const hasil = [];
    for (let dari = 0; ; dari += 1000) {
      const { data, error } = await sb.from(tabel).select('*').order(urut, { ascending: !menurun }).range(dari, dari + 999);
      if (error) throw error;
      hasil.push(...data);
      if (data.length < 1000) break;
    }
    return hasil;
  }
  function unduh(namaFile, isi, tipe) {
    const blob = new Blob([isi], { type: tipe });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = namaFile;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  /* ===================================================================
     LOGIN
     =================================================================== */
  async function mulai() {
    muatCss();
    sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'sb-eav-auth-token' }
    });
    const q = new URLSearchParams(location.search);
    const galatLogin = q.get('error_description') || new URLSearchParams(location.hash.replace(/^#/, '')).get('error_description');
    const { data } = await sb.auth.getSession();
    bersihkanUrl();
    if (galatLogin) E.toast('Login gagal: ' + galatLogin, true);
    sb.auth.onAuthStateChange((kejadian) => { if (kejadian === 'SIGNED_OUT' && profil) matikan(); });
    if (data && data.session) await setelahLogin(data.session);
  }

  function bersihkanUrl() {
    const q = new URLSearchParams(location.search);
    let ubah = false;
    ['code', 'error', 'error_code', 'error_description', 'state'].forEach((k) => { if (q.has(k)) { q.delete(k); ubah = true; } });
    let hash = location.hash;
    if (/(access_token|error_description)=/.test(hash)) { hash = ''; ubah = true; }
    if (ubah) {
      const qs = q.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + hash);
    }
  }

  async function masuk() {
    if (profil) { E.buka('kelola'); return; }
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } }
    });
    if (error) E.toast(pesanGalat(error), true);
  }

  async function setelahLogin(sesi) {
    const email = (sesi.user && sesi.user.email) || '';
    const { data: ok, error } = await sb.rpc('is_admin');
    if (error) { E.toast(pesanGalat(error), true); return; }
    if (!ok) {
      E.toast(`Akun ${email} tidak terdaftar sebagai admin. Kamu sudah dikeluarkan lagi.`, true);
      await sb.auth.signOut();
      return;
    }
    const { data: nama } = await sb.rpc('nama_admin');
    profil = { email, nama: nama || email };
    aktifkan();
  }

  async function keluar() {
    await sb.auth.signOut();
    matikan();
    E.toast('Kamu sudah keluar dari mode admin.');
  }

  /* ===================================================================
     MENYALAKAN / MEMATIKAN MODE ADMIN
     =================================================================== */
  function aktifkan() {
    document.body.classList.add('mode-admin');
    pasangBar();
    pasangModal();
    E.hooks.kartuAksi = (k) => `<button type="button" class="edit" data-edit-kata="${esc(k.id)}">✎ Edit</button>`;
    E.hooks.tombolTambah = (sub) => `<div class="aksi-form admin-tambah"><button type="button" class="tombol-garis" data-tambah-kata="${esc(sub)}">＋ Tambah kata di sub ini</button></div>`;
    E.views.kelola = viewKelola;
    E.terjemahkanStatis();
    muatKosakata().then(() => { if (E.state.view === 'kelola') E.render('diam'); });
    hitungMasukanBaru();
    if (/^#kelola/.test(location.hash)) { E.state.view = 'kelola'; }
    E.render('diam');
    E.toast(`Mode admin aktif. Halo, ${profil.nama}!`);
  }

  function matikan() {
    profil = null;
    document.body.classList.remove('mode-admin');
    const bar = $('barAdmin');
    if (bar) bar.remove();
    E.hooks.kartuAksi = null;
    E.hooks.tombolTambah = null;
    delete E.views.kelola;
    $('tombolAdmin').textContent = E.t('masukAdmin');
    if (E.state.view === 'kelola') E.buka('home', false);
    else E.render('diam');
  }

  function pasangBar() {
    if ($('barAdmin')) return;
    const bar = document.createElement('div');
    bar.id = 'barAdmin';
    bar.className = 'bar-admin';
    bar.innerHTML = `<div class="wadah bar-admin-isi">
        <span class="bar-admin-nama">🛠 Mode admin · <b>${esc(profil.nama)}</b> <small>${esc(profil.email)}</small></span>
        <span class="bar-admin-aksi">
          <button type="button" data-go="kelola">Kelola data<span class="lencana" id="lencanaMasukan" hidden></span></button>
          <button type="button" data-tambah-kata="">＋ Tambah kata</button>
          <button type="button" data-admin="keluar">Keluar</button>
        </span>
      </div>`;
    $('loader').after(bar);
  }

  async function hitungMasukanBaru() {
    const { count, error } = await sb.from('masukan').select('id', { count: 'exact', head: true }).eq('status', 'Baru');
    if (error) return;
    A.jumlahMasukanBaru = count || 0;
    const l = $('lencanaMasukan');
    if (l) { l.textContent = A.jumlahMasukanBaru; l.hidden = !A.jumlahMasukanBaru; }
  }

  /* ===================================================================
     DATA KOSAKATA (versi admin: termasuk sumber & yang diarsipkan)
     =================================================================== */
  async function muatKosakata() {
    try {
      A.kosakata = await ambilSemua('kosakata', 'id');
    } catch (err) {
      E.toast(pesanGalat(err), true);
    }
  }
  function cariKata(id) { return A.kosakata.find((k) => k.id === id); }

  /* Setelah satu kata disimpan: perbarui daftar admin & tampilan publik */
  function terapkanKata(baris) {
    const i = A.kosakata.findIndex((k) => k.id === baris.id);
    if (i >= 0) A.kosakata[i] = baris; else A.kosakata.push(baris);
    const pub = E.DATA.kosakata;
    const j = pub.findIndex((k) => k.id === baris.id);
    if (baris.status === 'Diarsipkan') {
      if (j >= 0) pub.splice(j, 1);
    } else {
      const k = E.dariBaris(baris);
      E.indeksSatu(k);
      if (j >= 0) pub[j] = k;
      else { pub.push(k); pub.sort((a, b) => (a.id < b.id ? -1 : 1)); }
    }
    E.render('diam');
  }

  async function muatUlangPublik() {
    const { data, error } = await sb.rpc('data_publik');
    if (error) { E.toast(pesanGalat(error), true); return; }
    E.gantiData(data);
  }

  /* ===================================================================
     FORMULIR (modal) — dipakai untuk kosakata & administrasi
     =================================================================== */
  const FORM = {
    kosakata: {
      tabel: 'kosakata', kunci: 'id',
      grup: [
        { judul: 'Arti', isi: [
          { k: 'indo', label: 'Bahasa Indonesia', wajib: true },
          { k: 'en', label: 'English' }] },
        { judul: 'Fusha', warna: 'fusha', isi: [
          { k: 'fusha_ar', label: 'Tulisan Arab', ar: true }, { k: 'fusha_lat', label: 'Latin' }] },
        { judul: 'Mesir', warna: 'mesir', isi: [
          { k: 'mesir_ar', label: 'Tulisan Arab', ar: true }, { k: 'mesir_lat', label: 'Latin' }] },
        { judul: 'Madinah', warna: 'saudi', isi: [
          { k: 'saudi_ar', label: 'Tulisan Arab', ar: true }, { k: 'saudi_lat', label: 'Latin' }] },
        { judul: 'Catatan', isi: [
          { k: 'catatan', label: 'Catatan penggunaan', panjang: true },
          { k: 'catatan_en', label: 'Catatan (English)', panjang: true }] },
        { judul: 'Pengaturan', isi: [
          { k: 'sub', label: 'Sub', pilihan: () => E.DATA.kategori.map((c) => [c.kode, c.kode + '. ' + c.nama]), wajib: true },
          { k: 'tipe', label: 'Tipe', pilihan: () => ['Kosakata', 'Kalimat'] },
          { k: 'status', label: 'Status', pilihan: () => STATUS },
          { k: 'sumber', label: 'Sumber / informan', bantu: 'Hanya terlihat oleh admin, tidak tampil di website.' }] }
      ]
    },
    administrasi: {
      tabel: 'administrasi', kunci: 'id',
      grup: [
        { judul: 'Langkah', isi: [
          { k: 'tahap', label: 'Tahap', pilihan: () => TAHAP, wajib: true },
          { k: 'status', label: 'Status', pilihan: () => STATUS },
          { k: 'judul', label: 'Judul langkah', wajib: true },
          { k: 'judul_en', label: 'Judul (English)' }] },
        { judul: 'Penjelasan', isi: [
          { k: 'penjelasan', label: 'Penjelasan', panjang: true },
          { k: 'penjelasan_en', label: 'Penjelasan (English)', panjang: true },
          { k: 'dokumen', label: 'Dokumen yang disiapkan', panjang: true, bantu: 'Satu dokumen per baris.' },
          { k: 'tempat', label: 'Tempat / instansi' }] },
        { judul: 'Rincian', isi: [
          { k: 'biaya', label: 'Perkiraan biaya' }, { k: 'waktu', label: 'Perkiraan waktu' },
          { k: 'tips', label: 'Tips dari pengalaman', panjang: true },
          { k: 'tips_en', label: 'Tips (English)', panjang: true },
          { k: 'sumber', label: 'Sumber resmi / link' }, { k: 'terakhir_dicek', label: 'Terakhir dicek', bantu: 'Contoh: 16/10/2026' },
          { k: 'urutan', label: 'Urutan tampil', angka: true, bantu: 'Angka kecil tampil lebih dulu.' }] }
      ]
    }
  };

  let formAktif = null;   /* { def, lama, selesai } */

  function pasangModal() {
    if ($('modalAdmin')) return;
    const m = document.createElement('div');
    m.id = 'modalAdmin';
    m.className = 'modal';
    m.hidden = true;
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'modalJudul');
    m.innerHTML = `<div class="modal-latar" data-tutup-modal></div>
      <div class="modal-isi">
        <div class="modal-kepala"><h2 id="modalJudul"></h2><button type="button" class="modal-tutup" data-tutup-modal aria-label="Tutup">✕</button></div>
        <form id="modalForm" class="formulir" novalidate></form>
      </div>`;
    document.body.appendChild(m);
  }

  function isianHtml(f, nilai) {
    const v = nilai == null ? '' : String(nilai);
    let el;
    if (f.pilihan) {
      const opsi = f.pilihan().map((o) => (Array.isArray(o) ? o : [o, o]));
      if (v && !opsi.some((o) => o[0] === v)) opsi.unshift([v, v]);
      el = `<select name="${f.k}">${f.wajib ? '' : '<option value=""></option>'}${opsi.map((o) =>
        `<option value="${esc(o[0])}" ${o[0] === v ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    } else if (f.panjang) {
      el = `<textarea name="${f.k}" rows="3"${f.ar ? ' dir="rtl" lang="ar"' : ''}>${esc(v)}</textarea>`;
    } else {
      el = `<input name="${f.k}" value="${esc(v)}" autocomplete="off"${f.angka ? ' inputmode="numeric"' : ''}${f.ar ? ' dir="rtl" lang="ar"' : ''}>`;
    }
    return `<label class="isian"><span>${esc(f.label)}${f.wajib ? ' *' : ''}</span>${el}${f.bantu ? `<small>${esc(f.bantu)}</small>` : ''}</label>`;
  }

  function bukaForm(def, lama, awal) {
    return new Promise((selesai) => {
      formAktif = { def, lama, selesai };
      const nilai = Object.assign({}, awal || {}, lama || {});
      const judul = lama ? `Edit ${lama[def.kunci]}` : (def.tabel === 'kosakata' ? 'Tambah kata baru' : 'Tambah langkah baru');
      $('modalJudul').textContent = judul;
      const info = lama
        ? `<p class="info-baris">${lama.dicek_oleh ? `Dicek oleh <b>${esc(lama.dicek_oleh)}</b> · ` : ''}Terakhir diubah ${esc(waktu(lama.updated_at))}${lama.diubah_oleh ? ` oleh ${esc(lama.diubah_oleh)}` : ''}</p>`
        : '<p class="info-baris">ID dibuat otomatis setelah disimpan.</p>';
      const grup = def.grup.map((g) => `<fieldset class="grup ${g.warna || ''}"><legend>${esc(g.judul)}</legend>
          <div class="baris-form dua">${g.isi.map((f) => isianHtml(f, nilai[f.k])).join('')}</div></fieldset>`).join('');
      const arsip = lama && 'status' in lama
        ? (lama.status === 'Diarsipkan'
          ? '<button type="button" class="tombol-garis" data-form="pulihkan">↩ Pulihkan</button>'
          : '<button type="button" class="tombol-bahaya" data-form="arsip">Arsipkan</button>')
        : '';
      $('modalForm').innerHTML = `${info}${grup}
        <div class="aksi-form modal-aksi">
          <button type="submit" class="tombol-utama">Simpan</button>
          <button type="button" class="tombol-garis" data-tutup-modal>Batal</button>
          <span class="spasi"></span>${arsip}
        </div>`;
      $('modalAdmin').hidden = false;
      document.body.classList.add('terkunci');
      const pertama = $('modalForm').querySelector('input, textarea');
      if (pertama && window.innerWidth > 800) pertama.focus();
    });
  }

  function tutupForm(hasil) {
    $('modalAdmin').hidden = true;
    document.body.classList.remove('terkunci');
    if (formAktif) { const s = formAktif.selesai; formAktif = null; s(hasil || null); }
  }

  function bacaForm() {
    const fd = new FormData($('modalForm'));
    const o = {};
    formAktif.def.grup.forEach((g) => g.isi.forEach((f) => {
      let v = String(fd.get(f.k) == null ? '' : fd.get(f.k)).trim();
      if (f.angka) v = v === '' ? 0 : Number(v) || 0;
      o[f.k] = v;
    }));
    return o;
  }

  async function simpanForm(tambahan) {
    const { def, lama } = formAktif;
    const nilai = Object.assign(bacaForm(), tambahan || {});
    for (const g of def.grup) {
      for (const f of g.isi) {
        if (f.wajib && !String(nilai[f.k]).trim()) { E.toast(`Kolom "${f.label}" wajib diisi.`, true); return; }
      }
    }
    const ubah = {};
    Object.keys(nilai).forEach((k) => {
      const baru = nilai[k] === '' ? null : nilai[k];
      if (!lama) { if (baru !== null) ubah[k] = baru; }
      else if (String(lama[k] == null ? '' : lama[k]) !== String(baru == null ? '' : baru)) ubah[k] = baru;
    });
    if (lama && !Object.keys(ubah).length) { tutupForm(null); E.toast('Tidak ada perubahan.'); return; }

    const tombol = $('modalForm').querySelector('[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = 'Menyimpan…';
    try {
      let res;
      if (lama) {
        res = await sb.from(def.tabel).update(ubah).eq(def.kunci, lama[def.kunci]).eq('updated_at', lama.updated_at).select();
      } else {
        res = await sb.from(def.tabel).insert(ubah).select();
      }
      if (res.error) throw res.error;
      if (lama && !res.data.length) {
        /* Ada yang mengubah baris ini lebih dulu (admin lain atau sinkron Sheets) */
        const segar = await sb.from(def.tabel).select('*').eq(def.kunci, lama[def.kunci]).single();
        E.toast('Data ini baru saja diubah di tempat lain (mungkin dari Sheets). Form dimuat ulang dengan versi terbaru: cek lalu simpan lagi.', true);
        const s = formAktif.selesai;
        formAktif = null;
        bukaForm(def, segar.data).then(s);
        return;
      }
      const baris = res.data[0];
      E.toast(lama ? `${baris[def.kunci]} tersimpan.` : `Tersimpan sebagai ${baris[def.kunci]}.`);
      tutupForm(baris);
    } catch (err) {
      E.toast(pesanGalat(err), true);
      tombol.disabled = false;
      tombol.textContent = 'Simpan';
    }
  }

  async function editKata(id) {
    if (!A.kosakata.length) await muatKosakata();
    const lama = cariKata(id);
    if (!lama) { E.toast('Entri ' + id + ' tidak ditemukan.', true); return; }
    const baris = await bukaForm(FORM.kosakata, lama);
    if (baris) { terapkanKata(baris); if (E.state.view === 'kelola') E.render('diam'); }
  }
  async function tambahKata(sub) {
    const awal = { sub: sub || E.state.sub || (E.DATA.kategori[0] || {}).kode, tipe: 'Kosakata', status: 'Draf (perlu dicek)' };
    const baris = await bukaForm(FORM.kosakata, null, awal);
    if (baris) terapkanKata(baris);
  }

  /* ===================================================================
     HALAMAN "KELOLA DATA"
     =================================================================== */
  const TAB = [
    ['kosakata', 'Kosakata'], ['masukan', 'Masukan'], ['tentang', 'Tentang Saya'], ['administrasi', 'Administrasi'],
    ['panduan', 'Panduan'], ['kategori', 'Kategori'], ['log', 'Log'], ['cadangan', 'Cadangan']
  ];

  function viewKelola() {
    if (!profil) return E.kotakKosong('Belum login', 'Masuk sebagai admin dulu.');
    const tab = TAB.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" aria-selected="${ui.tab === k}">${l}${k === 'masukan' && A.jumlahMasukanBaru ? ` <span class="lencana">${A.jumlahMasukanBaru}</span>` : ''}</button>`).join('');
    const isi = { kosakata: tabKosakata, masukan: tabMasukan, tentang: tabTentang, administrasi: tabAdministrasi,
      panduan: tabPanduan, kategori: tabKategori, log: tabLog, cadangan: tabCadangan }[ui.tab]();
    return `<div class="kelola">
        <h2>Kelola data</h2>
        <p class="lead">Masuk sebagai <b>${esc(profil.nama)}</b> (${esc(profil.email)}). Perubahan langsung tampil di website, dan tersalin ke Google Sheets sekitar 5 menit kemudian.</p>
        <div class="tab-admin" role="tablist">${tab}</div>
        <div class="isi-tab" id="isiTab">${isi}</div>
      </div>`;
  }

  /* ---------- Tab Kosakata ---------- */
  function normal(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ًͯ-ْـ]/g, ''); }
  function tabKosakata() {
    if (!A.kosakata.length) return '<p class="info">Memuat data…</p>';
    const hitung = {};
    A.kosakata.forEach((k) => { hitung[k.status] = (hitung[k.status] || 0) + 1; });
    const q = normal(ui.cari);
    const list = A.kosakata.filter((k) =>
      (!ui.status || k.status === ui.status) && (!ui.sub || k.sub === ui.sub) &&
      (!q || normal([k.id, k.indo, k.en, k.fusha_ar, k.fusha_lat, k.mesir_ar, k.mesir_lat, k.saudi_ar, k.saudi_lat, k.sumber].join(' ')).indexOf(q) !== -1));
    const tampil = list.slice(0, ui.batas);
    return `
      <div class="ringkasan">${STATUS.map((s) => `<button type="button" class="ringkas-status ${kelasStatus(s)}" data-filter-status="${esc(s)}" aria-pressed="${ui.status === s}"><b>${hitung[s] || 0}</b>${esc(s.replace(' (perlu dicek)', ''))}</button>`).join('')}</div>
      <div class="alat-admin">
        <input type="search" id="adminCari" placeholder="Cari ID, kata, Arab, latin, sumber…" value="${esc(ui.cari)}" autocomplete="off">
        <select id="adminSub"><option value="">Semua sub</option>${E.DATA.kategori.map((c) => `<option value="${c.kode}" ${ui.sub === c.kode ? 'selected' : ''}>${esc(c.kode + '. ' + c.nama)}</option>`).join('')}</select>
        <button type="button" class="tombol-utama" data-tambah-kata="">＋ Tambah kata</button>
      </div>
      <p class="info">${list.length} entri${ui.status ? ` berstatus ${esc(ui.status)}` : ''}${ui.status || ui.sub || ui.cari ? ' · <button type="button" class="link-kecil" data-filter-reset>hapus filter</button>' : ''}</p>
      <div class="daftar-admin">${tampil.map((k) => `
        <button type="button" class="baris-admin" data-edit-kata="${esc(k.id)}">
          <span class="ba-id">${esc(k.id)}</span>
          <span class="ba-teks"><b>${esc(k.indo)}</b><small>${esc(k.en || '')}</small></span>
          <span class="ba-ar" lang="ar" dir="rtl">${esc(k.mesir_ar || '')}</span>
          <span class="lencana-status ${kelasStatus(k.status)}">${esc(k.status.replace(' (perlu dicek)', ''))}</span>
        </button>`).join('')}</div>
      ${list.length > ui.batas ? `<div class="aksi-form" style="justify-content:center;margin-top:12px"><button type="button" class="tombol-garis" data-lagi>Tampilkan ${Math.min(25, list.length - ui.batas)} lagi</button></div>` : ''}`;
  }

  /* ---------- Tab Masukan ---------- */
  async function muatMasukan() {
    try {
      A.masukan = await ambilSemua('masukan', 'dibuat', true);
    } catch (err) { A.masukan = []; E.toast(pesanGalat(err), true); }
    hitungMasukanBaru();
  }
  function tabMasukan() {
    if (!A.masukan) { muatMasukan().then(() => E.render('diam')); return '<p class="info">Memuat masukan…</p>'; }
    const catatan = CFG.fiturMasukan ? ''
      : '<p class="peringatan">Formulir masukan di website belum dinyalakan (config.js → fiturMasukan: false). Masukan yang diisi lewat sheet tetap muncul di sini.</p>';
    const filter = ['Baru', 'Sedang dicek', 'Diterima', 'Ditolak', 'Duplikat', ''];
    const list = A.masukan.filter((m) => !ui.filterMasukan || m.status === ui.filterMasukan);
    const opsiSub = E.DATA.kategori.map((c) => `<option value="${c.kode}">${esc(c.kode + '. ' + c.nama)}</option>`).join('');
    const kartu = list.map((m) => {
      const baris = (label, ar, lat) => (ar || lat) ? `<div class="msk-logat"><span>${label}</span><span class="ar" lang="ar" dir="rtl">${esc(ar || '')}</span><i>${esc(lat || '')}</i></div>` : '';
      const subAwal = String(m.sub || '').charAt(0).toUpperCase();
      return `<article class="kartu-masukan" data-masukan="${esc(m.id)}">
          <div class="msk-kepala"><b>${esc(m.id)}</b> · ${esc(m.jenis)} · <span class="info">${esc(waktu(m.dibuat))}</span>
            <span class="lencana-status ${kelasStatus(m.status)}">${esc(m.status)}</span></div>
          ${m.indo ? `<h3>${esc(m.indo)}${m.en ? ` <small>(${esc(m.en)})</small>` : ''}</h3>` : ''}
          ${m.untuk_entri ? `<p>Koreksi untuk <button type="button" class="link-kecil" data-edit-kata="${esc(m.untuk_entri)}">${esc(m.untuk_entri)}</button></p>` : ''}
          ${baris('Mesir', m.mesir_ar, m.mesir_lat)}${baris('Fusha', m.fusha_ar, m.fusha_lat)}${baris('Madinah', m.saudi_ar, m.saudi_lat)}
          ${m.konteks ? `<p class="msk-konteks">${esc(m.konteks)}</p>` : ''}
          <p class="info">Dari: ${esc(m.nama || 'anonim')}${m.kontak ? ` · ${esc(m.kontak)}` : ''} · tampilkan nama: ${esc(m.tampilkan_nama)}${m.masuk_ke_id ? ` · jadi <button type="button" class="link-kecil" data-edit-kata="${esc(m.masuk_ke_id)}">${esc(m.masuk_ke_id)}</button>` : ''}${m.dicek_oleh ? ` · dicek ${esc(m.dicek_oleh)}` : ''}</p>
          <label class="isian"><span>Catatan admin</span><textarea rows="2" data-catatan-masukan>${esc(m.catatan_admin || '')}</textarea></label>
          <div class="aksi-form">
            ${!m.masuk_ke_id && m.indo && m.jenis !== 'Saran website' ? `<select data-sub-terima aria-label="Sub untuk entri baru">${opsiSub.replace(`value="${subAwal}"`, `value="${subAwal}" selected`)}</select><button type="button" class="tombol-utama" data-terima>✓ Terima jadi draf</button>` : ''}
            <button type="button" class="tombol-garis" data-status-masukan="Sedang dicek">Sedang dicek</button>
            ${m.masuk_ke_id || m.jenis !== 'Usulan kata baru' ? '<button type="button" class="tombol-garis" data-status-masukan="Diterima">Tandai diterima</button>' : ''}
            <button type="button" class="tombol-garis" data-status-masukan="Duplikat">Duplikat</button>
            <button type="button" class="tombol-bahaya" data-status-masukan="Ditolak">Tolak</button>
          </div>
        </article>`;
    }).join('');
    return `${catatan}
      <div class="chips">${filter.map((f) => `<button type="button" class="chip" data-filter-masukan="${f}" aria-pressed="${ui.filterMasukan === f}">${f || 'Semua'} (${A.masukan.filter((m) => !f || m.status === f).length})</button>`).join('')}</div>
      ${kartu || E.kotakKosong('Tidak ada masukan', ui.filterMasukan ? `Belum ada masukan berstatus "${esc(ui.filterMasukan)}".` : 'Belum ada masukan sama sekali.')}`;
  }

  async function ubahMasukan(id, perubahan) {
    const { data, error } = await sb.from('masukan').update(perubahan).eq('id', id).select();
    if (error) { E.toast(pesanGalat(error), true); return null; }
    const i = A.masukan.findIndex((m) => m.id === id);
    if (i >= 0 && data[0]) A.masukan[i] = data[0];
    hitungMasukanBaru();
    return data[0];
  }

  async function terimaMasukan(id, sub) {
    const kartu = document.querySelector(`[data-masukan="${id}"]`);
    const catatan = kartu ? kartu.querySelector('[data-catatan-masukan]').value.trim() : '';
    const { data: idBaru, error } = await sb.rpc('terima_masukan', { p_id: id, p_sub: sub || null });
    if (error) { E.toast(pesanGalat(error), true); return; }
    if (catatan) await sb.from('masukan').update({ catatan_admin: catatan }).eq('id', id);
    const [kata, msk] = await Promise.all([
      sb.from('kosakata').select('*').eq('id', idBaru).single(),
      sb.from('masukan').select('*').eq('id', id).single()
    ]);
    if (kata.data) terapkanKata(kata.data);
    if (msk.data) { const i = A.masukan.findIndex((m) => m.id === id); if (i >= 0) A.masukan[i] = msk.data; }
    hitungMasukanBaru();
    E.render('diam');
    E.toast(`Diterima sebagai ${idBaru} (Draf). Lengkapi lalu ubah statusnya kalau sudah dicek.`);
    editKata(idBaru);
  }

  /* ---------- Tab Tentang Saya / Panduan / Kategori (edit langsung di tempat) ---------- */
  async function muatTabel(nama, urut) {
    try { A[nama] = await ambilSemua(nama, urut); } catch (err) { A[nama] = []; E.toast(pesanGalat(err), true); }
  }

  const TABEL_RINGAN = {
    tentang: { kunci: 'kunci', urut: 'urutan', judul: (r) => r.bagian || r.kunci, bantu: (r) => r.panduan,
      kolom: [{ k: 'isi', label: 'Isi (Indonesia)', panjang: true }, { k: 'isi_en', label: 'Isi (English)', panjang: true }] },
    panduan: { kunci: 'kunci', urut: 'urutan', judul: (r) => r.label || r.kunci, bantu: (r) => (/^baca_/.test(r.kunci) ? 'Baris tabel cara baca latin' : ''),
      kolom: [{ k: 'label', label: 'Label / huruf' }, { k: 'isi', label: 'Isi (Indonesia)', panjang: true }, { k: 'isi_en', label: 'Isi (English)', panjang: true }] },
    kategori: { kunci: 'kode', urut: 'urutan', judul: (r) => `${r.kode}. ${r.nama}`, bantu: () => '',
      kolom: [{ k: 'nama', label: 'Nama sub' }, { k: 'nama_en', label: 'Nama (English)' }, { k: 'ikon', label: 'Ikon (emoji)' },
        { k: 'target', label: 'Target jumlah kata', angka: true }, { k: 'deskripsi', label: 'Deskripsi', panjang: true },
        { k: 'deskripsi_en', label: 'Deskripsi (English)', panjang: true }] }
  };

  function tabRingan(nama) {
    const def = TABEL_RINGAN[nama];
    if (!A[nama]) { muatTabel(nama, def.urut).then(() => E.render('diam')); return '<p class="info">Memuat…</p>'; }
    return `<p class="info">Ubah isinya lalu tekan <b>Simpan perubahan</b> di bawah. Kolom English boleh kosong (website memakai versi Indonesia).</p>
      <form id="formRingan" data-tabel="${nama}" class="formulir lebar">
        ${A[nama].map((r) => `<fieldset class="grup" data-kunci="${esc(r[def.kunci])}"><legend>${esc(def.judul(r))}</legend>
          ${def.bantu(r) ? `<small class="info">${esc(def.bantu(r))}</small>` : ''}
          <div class="baris-form dua">${def.kolom.map((f) => {
            const v = r[f.k] == null ? '' : String(r[f.k]);
            const ar = nama === 'panduan' && f.k === 'label' && /[؀-ۿ]/.test(v);
            return `<label class="isian"><span>${esc(f.label)}</span>${f.panjang
              ? `<textarea name="${f.k}" rows="${nama === 'tentang' ? 6 : 3}">${esc(v)}</textarea>`
              : `<input name="${f.k}" value="${esc(v)}"${f.angka ? ' inputmode="numeric"' : ''}${ar ? ' dir="rtl" lang="ar"' : ''}>`}</label>`;
          }).join('')}</div></fieldset>`).join('')}
        <div class="aksi-form tempel-bawah"><button type="submit" class="tombol-utama">Simpan perubahan</button></div>
      </form>`;
  }

  async function simpanRingan(form) {
    const nama = form.dataset.tabel;
    const def = TABEL_RINGAN[nama];
    const tugas = [];
    form.querySelectorAll('fieldset[data-kunci]').forEach((fs) => {
      const kunci = fs.dataset.kunci;
      const lama = A[nama].find((r) => String(r[def.kunci]) === kunci);
      const ubah = {};
      def.kolom.forEach((f) => {
        const el = fs.querySelector(`[name="${f.k}"]`);
        let v = el.value.trim();
        if (f.angka) v = v === '' ? null : Number(v);
        else if (v === '') v = null;
        if (String(lama[f.k] == null ? '' : lama[f.k]) !== String(v == null ? '' : v)) ubah[f.k] = v;
      });
      if (Object.keys(ubah).length) tugas.push({ kunci, ubah });
    });
    if (!tugas.length) { E.toast('Tidak ada perubahan.'); return; }
    const tombol = form.querySelector('[type="submit"]');
    tombol.disabled = true;
    tombol.textContent = 'Menyimpan…';
    let gagal = 0;
    for (const x of tugas) {
      const { data, error } = await sb.from(nama).update(x.ubah).eq(def.kunci, x.kunci).select();
      if (error || !data.length) { gagal++; continue; }
      const i = A[nama].findIndex((r) => String(r[def.kunci]) === x.kunci);
      A[nama][i] = data[0];
    }
    await muatUlangPublik();
    E.render('diam');
    E.toast(gagal ? `${tugas.length - gagal} tersimpan, ${gagal} gagal. Coba lagi.` : `${tugas.length} bagian tersimpan.`, !!gagal);
  }

  const tabTentang = () => tabRingan('tentang');
  const tabPanduan = () => tabRingan('panduan');
  const tabKategori = () => tabRingan('kategori');

  /* ---------- Tab Administrasi ---------- */
  function tabAdministrasi() {
    if (!A.administrasi) { muatTabel('administrasi', 'id').then(() => E.render('diam')); return '<p class="info">Memuat…</p>'; }
    const list = A.administrasi.slice().sort((a, b) => (a.tahap || '').localeCompare(b.tahap || '') || (a.urutan - b.urutan) || a.id.localeCompare(b.id));
    return `<div class="alat-admin"><button type="button" class="tombol-utama" data-tambah-adm>＋ Tambah langkah</button></div>
      ${list.length ? `<div class="daftar-admin">${list.map((a) => `
        <button type="button" class="baris-admin" data-edit-adm="${esc(a.id)}">
          <span class="ba-id">${esc(a.id)}</span>
          <span class="ba-teks"><b>${esc(a.judul)}</b><small>${esc(a.tahap || 'Tanpa tahap')}</small></span>
          <span></span>
          <span class="lencana-status ${kelasStatus(a.status)}">${esc(a.status.replace(' (perlu dicek)', ''))}</span>
        </button>`).join('')}</div>` : E.kotakKosong('Belum ada langkah', 'Tekan "Tambah langkah", atau isi di sheet Administrasi lalu kirim ke website.')}`;
  }
  async function editAdm(id) {
    const lama = id ? A.administrasi.find((a) => a.id === id) : null;
    const baris = await bukaForm(FORM.administrasi, lama, lama ? null : { tahap: TAHAP[0], status: 'Draf (perlu dicek)', urutan: 0 });
    if (!baris) return;
    const i = A.administrasi.findIndex((a) => a.id === baris.id);
    if (i >= 0) A.administrasi[i] = baris; else A.administrasi.push(baris);
    await muatUlangPublik();
    E.render('diam');
  }

  /* ---------- Tab Log ---------- */
  async function muatLog(lanjut) {
    const dari = lanjut ? A.log.length : 0;
    const { data, error } = await sb.from('log_admin').select('*').order('id', { ascending: false }).range(dari, dari + 99);
    if (error) { E.toast(pesanGalat(error), true); return; }
    A.log = lanjut ? A.log.concat(data) : data;
    A.logHabis = data.length < 100;
  }
  function ringkasPerubahan(l) {
    const p = l.perubahan || {};
    if (l.aksi === 'impor') return Object.keys(p).map((k) => `${k}: ${p[k]}`).join(', ');
    if (l.aksi === 'tambah') return esc(p.indo || p.judul || p.nama || p.kunci || '');
    return Object.keys(p).slice(0, 6).map((k) => {
      const v = p[k];
      if (!Array.isArray(v)) return esc(k);
      const pendek = (x) => { const s = x == null ? '∅' : String(x); return s.length > 40 ? s.slice(0, 40) + '…' : s; };
      return `<b>${esc(k)}</b>: ${esc(pendek(v[0]))} → ${esc(pendek(v[1]))}`;
    }).join('<br>');
  }
  function tabLog() {
    if (!A.log.length && !A.logHabis) { muatLog(false).then(() => E.render('diam')); return '<p class="info">Memuat log…</p>'; }
    return `<p class="info">100 perubahan terakhir. "Sheets (sinkron)" = perubahan yang dikirim dari Google Sheets.</p>
      <div class="daftar-log">${A.log.map((l) => `
        <div class="baris-log">
          <span class="bl-waktu">${esc(waktu(l.waktu))}</span>
          <span class="bl-siapa">${esc(l.pelaku || '')}</span>
          <span class="bl-aksi a-${esc(l.aksi)}">${esc(l.aksi)}</span>
          <span class="bl-apa">${esc(l.tabel)}${l.baris_id ? ' · ' + esc(l.baris_id) : ''}</span>
          <span class="bl-isi">${ringkasPerubahan(l)}</span>
        </div>`).join('')}</div>
      ${A.logHabis ? '' : '<div class="aksi-form" style="justify-content:center;margin-top:12px"><button type="button" class="tombol-garis" data-log-lagi>Muat lebih lama</button></div>'}`;
  }

  /* ---------- Tab Cadangan ---------- */
  function tabCadangan() {
    return `<div class="formulir lebar">
      <div class="grup-teks">
        <h3>Salinan cadangan untuk website</h3>
        <p>Website menyimpan salinan data di file <code>assets/data/cadangan.json</code>. Salinan ini dipakai otomatis kalau Supabase sedang bermasalah, jadi pengunjung tetap bisa membuka kamus.</p>
        <p>Sebulan sekali (atau setelah banyak menambah kata): unduh file di bawah, lalu ganti file dengan nama yang sama di GitHub (folder <code>assets/data</code>).</p>
        <button type="button" class="tombol-utama" data-unduh="cadangan">⬇ Unduh cadangan.json</button>
      </div>
      <div class="grup-teks">
        <h3>Semua kosakata (CSV)</h3>
        <p>Untuk arsip pribadi atau dibuka di Excel/Sheets. Termasuk kolom sumber dan entri yang diarsipkan.</p>
        <button type="button" class="tombol-garis" data-unduh="csv">⬇ Unduh kosakata.csv</button>
      </div></div>`;
  }
  async function unduhCadangan() {
    const { data, error } = await sb.rpc('data_publik');
    if (error) { E.toast(pesanGalat(error), true); return; }
    unduh('cadangan.json', JSON.stringify(data), 'application/json');
  }
  async function unduhCsv() {
    if (!A.kosakata.length) await muatKosakata();
    const kol = ['id', 'sub', 'tipe', 'indo', 'en', 'fusha_ar', 'fusha_lat', 'mesir_ar', 'mesir_lat', 'saudi_ar', 'saudi_lat',
      'catatan', 'catatan_en', 'sumber', 'status', 'dicek_oleh', 'updated_at'];
    const sel = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const csv = '﻿' + [kol.join(',')].concat(A.kosakata.map((r) => kol.map((k) => sel(r[k])).join(','))).join('\n');
    unduh('kosakata.csv', csv, 'text/csv;charset=utf-8');
  }

  /* ===================================================================
     KEJADIAN
     =================================================================== */
  document.addEventListener('click', async (e) => {
    if (!profil) return;
    const el = (sel) => e.target.closest(sel);
    let x;
    if ((x = el('[data-tutup-modal]'))) { tutupForm(null); return; }
    if ((x = el('[data-form="arsip"]'))) {
      if (confirm('Arsipkan entri ini? Entri tidak tampil lagi di website, tapi tetap tersimpan dan bisa dipulihkan.')) simpanForm({ status: 'Diarsipkan' });
      return;
    }
    if ((x = el('[data-form="pulihkan"]'))) { simpanForm({ status: 'Draf (perlu dicek)' }); return; }
    if ((x = el('[data-edit-kata]'))) { e.preventDefault(); editKata(x.dataset.editKata); return; }
    if ((x = el('[data-tambah-kata]'))) { tambahKata(x.dataset.tambahKata); return; }
    if ((x = el('[data-admin="keluar"]'))) { keluar(); return; }
    if ((x = el('[data-tab]'))) { ui.tab = x.dataset.tab; ui.batas = 25; E.render('diam'); return; }
    if ((x = el('[data-filter-status]'))) { ui.status = ui.status === x.dataset.filterStatus ? '' : x.dataset.filterStatus; ui.batas = 25; E.render('diam'); return; }
    if ((x = el('[data-filter-reset]'))) { ui.status = ''; ui.sub = ''; ui.cari = ''; E.render('diam'); return; }
    if ((x = el('[data-lagi]'))) { ui.batas += 25; E.render('diam'); return; }
    if ((x = el('[data-filter-masukan]'))) { ui.filterMasukan = x.dataset.filterMasukan; E.render('diam'); return; }
    if ((x = el('[data-terima]'))) {
      const kartu = x.closest('[data-masukan]');
      x.disabled = true;
      await terimaMasukan(kartu.dataset.masukan, kartu.querySelector('[data-sub-terima]').value);
      return;
    }
    if ((x = el('[data-status-masukan]'))) {
      const kartu = x.closest('[data-masukan]');
      const catatan = kartu.querySelector('[data-catatan-masukan]').value.trim() || null;
      const r = await ubahMasukan(kartu.dataset.masukan, { status: x.dataset.statusMasukan, catatan_admin: catatan });
      if (r) { E.toast(`${r.id}: ${r.status}`); E.render('diam'); }
      return;
    }
    if ((x = el('[data-tambah-adm]'))) { editAdm(null); return; }
    if ((x = el('[data-edit-adm]'))) { editAdm(x.dataset.editAdm); return; }
    if ((x = el('[data-log-lagi]'))) { await muatLog(true); E.render('diam'); return; }
    if ((x = el('[data-unduh="cadangan"]'))) { unduhCadangan(); return; }
    if ((x = el('[data-unduh="csv"]'))) { unduhCsv(); }
  });

  document.addEventListener('submit', (e) => {
    if (!profil) return;
    if (e.target.id === 'modalForm') { e.preventDefault(); simpanForm(); }
    if (e.target.id === 'formRingan') { e.preventDefault(); simpanRingan(e.target); }
  });

  let jedaCari;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'adminCari') {
      clearTimeout(jedaCari);
      jedaCari = setTimeout(() => {
        ui.cari = e.target.value;
        ui.batas = 25;
        E.render('diam');
        const el = $('adminCari');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 220);
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id === 'adminSub') { ui.sub = e.target.value; ui.batas = 25; E.render('diam'); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && formAktif) tutupForm(null);
  });

  window.EAV_ADMIN = { mulai, masuk, keluar, aktif: () => !!profil };
})();
