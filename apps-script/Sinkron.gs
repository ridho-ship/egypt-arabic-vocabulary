/**
 * =====================================================================
 *  SINKRON GOOGLE SHEETS ↔ SUPABASE (website Egyptian Arabic Vocabulary)
 * =====================================================================
 *  Website (Supabase) = sumber utama. Sheets = cadangan + tempat impor besar.
 *
 *  Cara kerja:
 *  - Tiap 5 menit, perubahan dari website disalin ke sheet (otomatis).
 *  - Edit di sheet dikirim ke website lewat menu  🌐 Website → Kirim perubahan ke website.
 *  - Setiap baris punya kolom "Tanggal Update". Kalau baris yang sama diubah
 *    di dua tempat, yang terakhir diubah yang menang.
 *  - Baris baru tanpa ID otomatis diberi ID (KK-00354, ADM-001, MSK-00001).
 *  - Menghapus baris di sheet TIDAK menghapus di website. Untuk "menghapus",
 *    ubah Status jadi "Diarsipkan".
 *
 *  Pemasangan (sekali saja): lihat panduan langkah demi langkah.
 *  Kunci Supabase disimpan di Script Properties, BUKAN di kode ini.
 * =====================================================================
 */

const PENGATURAN = {
  MENIT_OTOMATIS: 5,
  KOLOM_WAKTU: 'Tanggal Update',
  UKURAN_KIRIM: 200   /* baris per kiriman ke Supabase */
};

/*
 * Peta sheet ↔ tabel. [judul kolom di sheet (boleh beberapa ejaan), nama kolom database, jenis]
 * jenis: 'sub' (A. Sehari-hari ↔ A), 'angka', 'tanggal' (ditulis dd/MM/yyyy),
 *        'waktu' (tanggal-jam, hanya disalin dari website ke sheet),
 *        'status' / 'statusMasukan' / 'jenisMasukan' (dirapikan ke pilihan yang dikenal website)
 */
const PETA = [
  {
    nama: 'kategori', sheet: 'Kategori', tabel: 'kategori', kunci: 'kode', bolehTambahBaris: false, polaKunci: /^[A-Z]$/,
    kolom: [
      [['Kode'], 'kode'], [['Nama Sub'], 'nama'], [['Nama Sub (English)'], 'nama_en'],
      [['Label Dropdown'], 'label'], [['Ikon'], 'ikon'], [['Deskripsi'], 'deskripsi'],
      [['Deskripsi (English)'], 'deskripsi_en'], [['Target'], 'target', 'angka']
    ]
  },
  {
    nama: 'tentang', sheet: 'Tentang Saya', tabel: 'tentang', kunci: 'kunci',
    kolom: [
      [['Kunci'], 'kunci'], [['Bagian'], 'bagian'], [['Panduan Isi'], 'panduan'],
      [['Isi (diisi Abrar)', 'Isi'], 'isi'], [['Isi (English)'], 'isi_en']
    ]
  },
  {
    nama: 'kosakata', sheet: 'Kosakata', tabel: 'kosakata', kunci: 'id', awalan: 'KK-', digit: 5, polaKunci: /^KK-\d{5,}$/,
    wajib: ['indo', 'sub'],
    kolom: [
      [['ID'], 'id'], [['Sub'], 'sub', 'sub'], [['Tipe'], 'tipe'],
      [['Bahasa Indonesia (ID)', 'Bahasa Indonesia'], 'indo'], [['English (ENG)', 'English'], 'en'],
      [['Fusha (Arab)'], 'fusha_ar'], [['Fusha (Latin)'], 'fusha_lat'],
      [['Mesir (Arab)'], 'mesir_ar'], [['Mesir (Latin)'], 'mesir_lat'],
      [['Saudi (Arab)', 'Madinah (Arab)', 'Madinah & Makkah (Arab)'], 'saudi_ar'],
      [['Madinah & Makkah (Latin)', 'Saudi (Latin)', 'Madinah (Latin)'], 'saudi_lat'],
      [['Catatan Penggunaan'], 'catatan'], [['Catatan (English)'], 'catatan_en'],
      [['Sumber / Informan'], 'sumber'], [['Status'], 'status', 'status'], [['Dicek oleh'], 'dicek_oleh']
    ]
  },
  {
    nama: 'administrasi', sheet: 'Administrasi', tabel: 'administrasi', kunci: 'id', awalan: 'ADM-', digit: 3, polaKunci: /^ADM-\d{3,}$/,
    wajib: ['judul'],
    kolom: [
      [['ID'], 'id'], [['Tahap'], 'tahap'], [['Judul Langkah'], 'judul'], [['Judul Langkah (ENG)'], 'judul_en'],
      [['Penjelasan'], 'penjelasan'], [['Penjelasan (ENG)'], 'penjelasan_en'],
      [['Dokumen yang Disiapkan'], 'dokumen'], [['Tempat / Instansi'], 'tempat'],
      [['Perkiraan Biaya'], 'biaya'], [['Perkiraan Waktu'], 'waktu'],
      [['Tips dari Pengalaman'], 'tips'], [['Tips dari Pengalaman (ENG)'], 'tips_en'],
      [['Sumber Resmi / Link'], 'sumber'], [['Terakhir Dicek'], 'terakhir_dicek', 'tanggal'], [['Status'], 'status', 'status']
    ]
  },
  {
    nama: 'masukan', sheet: 'Masukan', tabel: 'masukan', kunci: 'id', awalan: 'MSK-', digit: 5, polaKunci: /^MSK-\d{5,}$/,
    syarat: (o) => !!(o.indo || o.konteks || o.mesir_ar),
    kolom: [
      [['ID'], 'id'], [['Tanggal Masuk'], 'dibuat', 'waktu'], [['Jenis'], 'jenis', 'jenisMasukan'], [['Sub (usulan)'], 'sub'],
      [['Untuk Entri (ID)'], 'untuk_entri'], [['Bahasa Indonesia (ID)'], 'indo'], [['English (ENG)'], 'en'],
      [['Fusha (Arab)'], 'fusha_ar'], [['Fusha (Latin)'], 'fusha_lat'], [['Mesir (Arab)'], 'mesir_ar'],
      [['Mesir (Latin)'], 'mesir_lat'], [['Saudi (Arab)'], 'saudi_ar'], [['Madinah & Makkah (Latin)'], 'saudi_lat'],
      [['Konteks / Contoh Pemakaian'], 'konteks'], [['Nama Pengirim'], 'nama'], [['Kontak (opsional)'], 'kontak'],
      [['Tampilkan Nama?'], 'tampilkan_nama'], [['Status'], 'status', 'statusMasukan'], [['Catatan Admin'], 'catatan_admin'],
      [['Dicek oleh'], 'dicek_oleh'], [['Masuk ke ID'], 'masuk_ke_id']
    ]
  }
];


/* =====================================================================
   MENU
   ===================================================================== */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('🌐 Website')
    .addItem('Kirim perubahan ke website', 'menuKirim')
    .addItem('Ambil perubahan dari website', 'menuTarik')
    .addSeparator()
    .addItem('Nyalakan sinkron otomatis (tiap 5 menit)', 'nyalakanOtomatis')
    .addItem('Matikan sinkron otomatis', 'matikanOtomatis')
    .addSeparator()
    .addSubMenu(SpreadsheetApp.getUi().createMenu('Pengaturan & darurat')
      .addItem('1. Atur kunci Supabase', 'aturKunci')
      .addItem('2. Siapkan sheet (kolom Tanggal Update & status Diarsipkan)', 'siapkanSheet')
      .addItem('Cek koneksi', 'cekKoneksi')
      .addSeparator()
      .addItem('Kirim SEMUA baris (timpa website)', 'menuKirimSemua')
      .addItem('Ambil SEMUA data (timpa sheet)', 'menuTarikSemua'))
    .addToUi();
}

function menuKirim() { jalankanDenganKunci_(() => laporan_('Kirim ke website', kirim_(false)), true); }
function menuTarik() { jalankanDenganKunci_(() => laporan_('Ambil dari website', tarik_(false)), true); }

function menuKirimSemua() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Kirim SEMUA baris?',
    'Semua baris di sheet akan dikirim dan MENIMPA isi website, termasuk perubahan yang dibuat di website tapi belum ada di sheet. ' +
    'Pakai ini hanya untuk impor awal atau kalau website perlu dikembalikan sesuai sheet.\n\nLanjutkan?', ui.ButtonSet.YES_NO);
  if (ok === ui.Button.YES) jalankanDenganKunci_(() => laporan_('Kirim semua', kirim_(true)), true);
}

function menuTarikSemua() {
  const ui = SpreadsheetApp.getUi();
  const ok = ui.alert('Ambil SEMUA data?',
    'Isi sheet (kolom-kolom yang tersambung ke website) akan ditimpa dengan data dari website, termasuk edit di sheet yang belum dikirim. Lanjutkan?',
    ui.ButtonSet.YES_NO);
  if (ok === ui.Button.YES) jalankanDenganKunci_(() => laporan_('Ambil semua', tarik_(true)), true);
}

/** Dipanggil pemicu waktu tiap 5 menit */
function tarikOtomatis() {
  jalankanDenganKunci_(() => {
    const hasil = tarik_(false);
    const jumlah = hasil.reduce((s, h) => s + h.diubah + h.ditambah, 0);
    if (jumlah) SpreadsheetApp.getActive().toast(ringkas_(hasil), 'Sinkron dari website', 8);
  }, false);
}

function nyalakanOtomatis() {
  matikanOtomatis(true);
  ScriptApp.newTrigger('tarikOtomatis').timeBased().everyMinutes(PENGATURAN.MENIT_OTOMATIS).create();
  SpreadsheetApp.getUi().alert('Sinkron otomatis aktif. Perubahan dari website akan masuk ke sheet tiap ' + PENGATURAN.MENIT_OTOMATIS + ' menit.');
}

function matikanOtomatis(diam) {
  ScriptApp.getProjectTriggers()
    .filter((t) => t.getHandlerFunction() === 'tarikOtomatis')
    .forEach((t) => ScriptApp.deleteTrigger(t));
  if (diam !== true) SpreadsheetApp.getUi().alert('Sinkron otomatis dimatikan.');
}


/* =====================================================================
   PENGATURAN KUNCI & PERSIAPAN SHEET
   ===================================================================== */
function aturKunci() {
  const ui = SpreadsheetApp.getUi();
  const p = PropertiesService.getScriptProperties();
  const a = ui.prompt('Kunci Supabase (1/2)', 'Tempel "Project URL" Supabase, contoh: https://abcdefgh.supabase.co', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const b = ui.prompt('Kunci Supabase (2/2)',
    'Tempel "Secret key" (sb_secret_...) atau "service_role".\nKunci ini RAHASIA: jangan dibagikan dan jangan ditaruh di website.', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  p.setProperty('SUPABASE_URL', a.getResponseText().trim().replace(/\/+$/, ''));
  p.setProperty('SUPABASE_KEY', b.getResponseText().trim());
  cekKoneksi();
}

function cekKoneksi() {
  const ui = SpreadsheetApp.getUi();
  try {
    const hasil = PETA.map((m) => {
      const n = hitung_(m.tabel);
      return '• ' + m.sheet + ': ' + n + ' baris di website';
    });
    ui.alert('Koneksi berhasil ✅', hasil.join('\n'), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Koneksi gagal ❌', String(err.message || err), ui.ButtonSet.OK);
  }
}

/** Menambah kolom "Tanggal Update" kalau belum ada, dan pilihan "Diarsipkan" di dropdown Status */
function siapkanSheet() {
  const ss = SpreadsheetApp.getActive();
  const catatan = [];
  PETA.forEach((m) => {
    const sh = ss.getSheetByName(m.sheet);
    if (!sh) { catatan.push('⚠ Sheet "' + m.sheet + '" tidak ditemukan.'); return; }
    const kolomWaktu = pastikanKolomWaktu_(sh);
    catatan.push('✓ ' + m.sheet + ': kolom "' + PENGATURAN.KOLOM_WAKTU + '" di kolom ' + kolomWaktu);
    if (m.tabel === 'kosakata' || m.tabel === 'administrasi') {
      if (tambahPilihanStatus_(sh, 'Diarsipkan')) catatan.push('  + pilihan "Diarsipkan" ditambahkan di dropdown Status');
    }
  });
  SpreadsheetApp.getUi().alert('Sheet siap', catatan.join('\n'), SpreadsheetApp.getUi().ButtonSet.OK);
}

function pastikanKolomWaktu_(sh) {
  const lebar = Math.max(1, sh.getLastColumn());
  const judul = sh.getRange(1, 1, 1, lebar).getDisplayValues()[0].map((s) => String(s).trim());
  const i = judul.indexOf(PENGATURAN.KOLOM_WAKTU);
  if (i >= 0) return i + 1;
  let kosong = judul.length;
  while (kosong > 0 && !judul[kosong - 1]) kosong--;
  const kol = kosong + 1;
  if (kol > sh.getMaxColumns()) sh.insertColumnsAfter(sh.getMaxColumns(), 1);
  const sel = sh.getRange(1, kol);
  sel.setValue(PENGATURAN.KOLOM_WAKTU);
  if (kosong > 0) sh.getRange(1, kosong).copyTo(sel, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  sh.getRange(2, kol, Math.max(1, sh.getMaxRows() - 1), 1).setNumberFormat('dd/MM/yyyy HH:mm');
  return kol;
}

function tambahPilihanStatus_(sh, pilihan) {
  const judul = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map((s) => String(s).trim());
  const kol = judul.indexOf('Status') + 1;
  if (!kol) return false;
  const rentang = sh.getRange(2, kol, sh.getMaxRows() - 1, 1);
  const aturan = rentang.getCell(1, 1).getDataValidation();
  if (!aturan || aturan.getCriteriaType() !== SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) return false;
  const daftar = aturan.getCriteriaValues()[0].slice();
  if (daftar.indexOf(pilihan) >= 0) return false;
  daftar.push(pilihan);
  rentang.setDataValidation(aturan.copy().requireValueInList(daftar, true).build());
  return true;
}


/* =====================================================================
   AMBIL DARI WEBSITE  (Supabase → Sheets)
   ===================================================================== */
function tarik_(semua) {
  const ss = SpreadsheetApp.getActive();
  const props = PropertiesService.getScriptProperties();
  const labelSub = petaLabelSub_();
  const hasil = [];

  PETA.forEach((m) => {
    const h = { sheet: m.sheet, diubah: 0, ditambah: 0, dilewati: 0, catatan: [] };
    hasil.push(h);
    const sh = ss.getSheetByName(m.sheet);
    if (!sh) { h.catatan.push('sheet tidak ditemukan'); return; }

    const sejak = semua ? null : props.getProperty('terakhir_' + m.nama);
    const baris = ambilSemua_(m.tabel, sejak);
    if (!baris.length) return;

    const t = bacaSheet_(sh, m);
    const terbaru = baris.reduce((x, r) => (r.updated_at > x ? r.updated_at : x), sejak || '');
    const baru = [];

    baris.forEach((r) => {
      const kunci = normalKunci_(m, r[m.kunci]);
      const i = t.indeks[kunci];
      const waktuDb = Date.parse(r.updated_at);
      if (i != null) {
        const waktuSheet = t.nilai[i][t.kolWaktu];
        if (!semua && waktuSheet instanceof Date && waktuSheet.getTime() > waktuDb + 1000) {
          h.dilewati++;   /* sheet lebih baru: biarkan, nanti dikirim */
          return;
        }
        const berubah = isiBaris_(m, t, t.nilai[i], r, labelSub);
        t.nilai[i][t.kolWaktu] = new Date(waktuDb);
        if (berubah) h.diubah++;
      } else if (m.bolehTambahBaris !== false) {
        const b = new Array(t.lebar).fill('');
        isiBaris_(m, t, b, r, labelSub);
        b[t.kolWaktu] = new Date(waktuDb);
        baru.push(b);
        h.ditambah++;
      }
    });

    tulisSheet_(sh, t, baru);
    if (terbaru) props.setProperty('terakhir_' + m.nama, terbaru);
  });
  return hasil;
}

/** Mengisi satu baris sheet dari data website. Mengembalikan true kalau ada yang berubah. */
function isiBaris_(m, t, b, r, labelSub) {
  let berubah = false;
  m.kolom.forEach(([, field, jenis]) => {
    const c = t.kol[field];
    if (c == null) return;
    let v = r[field];
    if (v == null) v = '';
    if (jenis === 'sub') v = labelSub[v] || v;
    if (jenis === 'waktu' && v) v = new Date(v);
    if (jenis === 'angka' && v !== '') v = Number(v);
    const lama = b[c];
    const sama = (lama instanceof Date && v instanceof Date) ? lama.getTime() === v.getTime()
      : (jenis === 'tanggal' && lama instanceof Date) ? formatTanggal_(lama) === String(v)
        : String(lama) === String(v);
    if (!sama) {
      if (jenis === 'tanggal' && lama instanceof Date) return;   /* tetap biarkan format tanggal sheet */
      b[c] = v;
      berubah = true;
    }
  });
  return berubah;
}


/* =====================================================================
   KIRIM KE WEBSITE  (Sheets → Supabase)
   ===================================================================== */
function kirim_(semua) {
  const ss = SpreadsheetApp.getActive();
  const hasil = [];

  PETA.forEach((m) => {
    const h = { sheet: m.sheet, diubah: 0, ditambah: 0, dilewati: 0, catatan: [] };
    hasil.push(h);
    const sh = ss.getSheetByName(m.sheet);
    if (!sh) { h.catatan.push('sheet tidak ditemukan'); return; }
    const t = bacaSheet_(sh, m);
    if (t.kol[m.kunci] == null) { h.catatan.push('kolom kunci tidak ditemukan'); return; }

    /* versi di website: kunci → updated_at */
    const diWeb = {};
    ambilSemua_(m.tabel, null, m.kunci + ',updated_at').forEach((r) => { diWeb[normalKunci_(m, r[m.kunci])] = Date.parse(r.updated_at); });

    const kirimDenganKunci = [];
    const kirimBaru = [];
    t.nilai.forEach((b, i) => {
      if (i === 0) return;
      const obj = keObjek_(m, t, b);
      if (!obj) return;
      const kunci = obj[m.kunci];
      const abaikan = [m.kunci, 'status', 'sub', 'tipe', 'tahap', 'jenis', 'tampilkan_nama'];
      const adaIsi = Object.keys(obj).some((k) => abaikan.indexOf(k) < 0 && obj[k] != null && obj[k] !== '');
      if (!adaIsi) return;                                   /* baris kosong (mis. ADM-05 tanpa isi) */
      const kurang = (m.wajib || []).filter((k) => !obj[k]);
      if (kurang.length || (m.syarat && !m.syarat(obj))) {
        h.catatan.push('baris ' + (i + 1) + ' dilewati: kolom wajib masih kosong (' + (kurang.join(', ') || 'isi') + ')');
        return;
      }
      if (kunci && m.polaKunci && !m.polaKunci.test(kunci)) {
        if (m.tabel !== 'kategori') h.catatan.push('baris ' + (i + 1) + ' dilewati: ID "' + kunci + '" tidak sesuai format. Kosongkan saja, nanti dibuat otomatis.');
        return;
      }
      if (!kunci) {
        if (m.awalan) { delete obj[m.kunci]; kirimBaru.push({ i, obj }); }
        return;
      }
      const waktuSheet = b[t.kolWaktu];
      const adaDiWeb = Object.prototype.hasOwnProperty.call(diWeb, kunci);
      if (!adaDiWeb || semua || (waktuSheet instanceof Date && waktuSheet.getTime() > diWeb[kunci] + 1000)) {
        kirimDenganKunci.push({ i, obj, baru: !adaDiWeb });
      } else if (waktuSheet instanceof Date && waktuSheet.getTime() < diWeb[kunci] - 1000) {
        h.dilewati++;   /* versi website lebih baru: akan masuk ke sheet saat "Ambil" */
      }
    });

    if (!kirimDenganKunci.length && !kirimBaru.length) return;

    /* 1. Baris yang sudah punya kunci: upsert. 2. Baris baru tanpa ID: ID dibuat database. */
    kirimKelompok_(m, t, h, kirimDenganKunci, m.tabel + '?on_conflict=' + m.kunci + '&select=*', 'resolution=merge-duplicates,return=representation');
    kirimKelompok_(m, t, h, kirimBaru, m.tabel + '?select=*', 'return=representation,missing=default');

    tulisSheet_(sh, t, []);
  });
  return hasil;
}

/** Mengirim per kelompok. Kalau satu kelompok ditolak, dicoba satu per satu supaya
    baris yang benar tetap masuk dan baris yang salah dilaporkan. */
function kirimKelompok_(m, t, h, daftar, jalur, prefer) {
  const terapkan = (x, r) => {
    t.nilai[x.i][t.kol[m.kunci]] = r[m.kunci];
    t.nilai[x.i][t.kolWaktu] = new Date(Date.parse(r.updated_at));
    if (x.baru === false) h.diubah++; else h.ditambah++;
  };
  potong_(daftar, PENGATURAN.UKURAN_KIRIM).forEach((kelompok) => {
    let balik = null;
    try {
      balik = panggil_('post', jalur, kelompok.map((x) => x.obj), prefer);
    } catch (err) {
      kelompok.forEach((x) => {
        try {
          const r = panggil_('post', jalur, [x.obj], prefer)[0];
          if (r) terapkan(x, r);
        } catch (e2) {
          h.catatan.push('baris ' + (x.i + 1) + ' ditolak: ' + pesanTolak_(e2));
        }
      });
      return;
    }
    if (jalur.indexOf('on_conflict') >= 0) {
      const peta = {};
      balik.forEach((r) => { peta[normalKunci_(m, r[m.kunci])] = r; });
      kelompok.forEach((x) => { const r = peta[normalKunci_(m, x.obj[m.kunci])]; if (r) terapkan(x, r); });
    } else {
      kelompok.forEach((x, j) => { if (balik[j]) terapkan(x, balik[j]); });
    }
  });
}

/** Satu baris sheet → objek untuk database. null kalau baris kosong. */
function keObjek_(m, t, b) {
  const o = {};
  let ada = false;
  m.kolom.forEach(([, field, jenis]) => {
    const c = t.kol[field];
    if (c == null || jenis === 'waktu') return;
    let v = b[c];
    if (v instanceof Date) v = formatTanggal_(v);
    v = v == null ? '' : String(v).trim();
    if (v !== '') ada = true;
    if (jenis === 'sub') v = v ? v.charAt(0).toUpperCase() : '';
    if (jenis && RAPIKAN[jenis]) v = RAPIKAN[jenis](v);
    if (jenis === 'angka') { o[field] = v === '' || isNaN(Number(v)) ? null : Number(v); return; }
    if (field === m.kunci) v = normalKunci_(m, v);
    o[field] = v === '' ? null : v;
  });
  return ada ? o : null;
}


/* =====================================================================
   BACA & TULIS SHEET
   ===================================================================== */
function bacaSheet_(sh, m) {
  const kolWaktu = pastikanKolomWaktu_(sh) - 1;
  const lebar = sh.getLastColumn();
  const tinggi = Math.max(1, sh.getLastRow());
  const rentang = sh.getRange(1, 1, tinggi, lebar);
  const nilai = rentang.getValues();
  const rumus = rentang.getFormulas();
  const judul = nilai[0].map((s) => String(s).trim());

  const kol = {};
  m.kolom.forEach(([nama, field]) => {
    for (let k = 0; k < nama.length; k++) {
      const c = judul.indexOf(nama[k]);
      if (c >= 0) { kol[field] = c; return; }
    }
  });
  const indeks = {};
  if (kol[m.kunci] != null) {
    for (let i = 1; i < nilai.length; i++) {
      const k = normalKunci_(m, nilai[i][kol[m.kunci]]);
      if (k && indeks[k] == null) indeks[k] = i;
    }
  }
  return { nilai, rumus, kol, kolWaktu, lebar, indeks };
}

/** Menulis kembali isi sheet. Sel berisi rumus tidak disentuh. */
function tulisSheet_(sh, t, baru) {
  const isi = t.nilai.map((b, i) => b.map((v, c) => (t.rumus[i][c] ? t.rumus[i][c] : v)));
  sh.getRange(1, 1, isi.length, t.lebar).setValues(isi);
  if (baru.length) {
    const mulai = sh.getLastRow() + 1;
    const perlu = mulai + baru.length - 1 - sh.getMaxRows();
    if (perlu > 0) sh.insertRowsAfter(sh.getMaxRows(), perlu);
    sh.getRange(mulai, 1, baru.length, t.lebar).setValues(baru);
  }
}

/** Saat sel diedit manual, isi kolom "Tanggal Update" baris itu dengan waktu sekarang */
function onEdit(e) {
  try {
    const sh = e.range.getSheet();
    if (!PETA.some((m) => m.sheet === sh.getName())) return;
    const r1 = e.range.getRow();
    const n = e.range.getNumRows();
    if (r1 + n - 1 < 2) return;
    const judul = sh.getRange(1, 1, 1, sh.getLastColumn()).getDisplayValues()[0].map((s) => String(s).trim());
    const c = judul.indexOf(PENGATURAN.KOLOM_WAKTU);
    if (c < 0) return;
    if (e.range.getColumn() === c + 1 && e.range.getNumColumns() === 1) return;
    const awal = Math.max(2, r1);
    const jumlah = r1 + n - awal;
    const sekarang = new Date();
    sh.getRange(awal, c + 1, jumlah, 1).setValues(Array.from({ length: jumlah }, () => [sekarang]));
  } catch (err) {
    /* jangan ganggu pengeditan */
  }
}


/* =====================================================================
   SUPABASE
   ===================================================================== */
function kunci_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('SUPABASE_URL');
  const key = p.getProperty('SUPABASE_KEY');
  if (!url || !key) throw new Error('Kunci Supabase belum diatur. Buka menu 🌐 Website → Pengaturan & darurat → 1. Atur kunci Supabase.');
  return { url, key };
}

function panggil_(metode, jalur, isi, prefer, kembalikanRespons) {
  const k = kunci_();
  const header = { apikey: k.key };
  if (/^eyJ/.test(k.key)) header.Authorization = 'Bearer ' + k.key;   /* kunci lama (service_role JWT) */
  if (prefer) header.Prefer = prefer;
  const opsi = { method: metode, headers: header, muteHttpExceptions: true, contentType: 'application/json' };
  if (isi != null) opsi.payload = JSON.stringify(isi);
  const res = UrlFetchApp.fetch(k.url + '/rest/v1/' + jalur, opsi);
  const kode = res.getResponseCode();
  const teks = res.getContentText();
  if (kode >= 300) throw new Error('Supabase menolak (' + kode + '): ' + teks.slice(0, 400));
  if (kembalikanRespons) return res;
  return teks ? JSON.parse(teks) : null;
}

function ambilSemua_(tabel, sejak, kolom) {
  const hasil = [];
  const filter = sejak ? '&updated_at=gt.' + encodeURIComponent(sejak) : '';
  for (let dari = 0; ; dari += 1000) {
    const data = panggil_('get', tabel + '?select=' + (kolom || '*') + filter + '&order=updated_at.asc&limit=1000&offset=' + dari);
    hasil.push.apply(hasil, data);
    if (data.length < 1000) break;
  }
  return hasil;
}

function hitung_(tabel) {
  const res = panggil_('get', tabel + '?select=updated_at&limit=1', null, 'count=exact', true);
  const h = res.getHeaders();
  const rentang = h['Content-Range'] || h['content-range'] || '';
  return rentang.split('/')[1] || '?';
}

function petaLabelSub_() {
  const peta = {};
  try {
    panggil_('get', 'kategori?select=kode,label,nama').forEach((k) => { peta[k.kode] = k.label || (k.kode + '. ' + k.nama); });
  } catch (err) { /* pakai kode saja */ }
  return peta;
}


/* =====================================================================
   ALAT BANTU
   ===================================================================== */
/* Merapikan isi kolom pilihan supaya diterima website (misal "Belum diisi" → Draf) */
const RAPIKAN = {
  status: (v) => (!v ? '' : /^final/i.test(v) ? 'Final' : /^sudah/i.test(v) ? 'Sudah dicek' : /arsip/i.test(v) ? 'Diarsipkan' : 'Draf (perlu dicek)'),
  statusMasukan: (v) => (!v ? '' : /sedang/i.test(v) ? 'Sedang dicek' : /terima/i.test(v) ? 'Diterima' : /tolak/i.test(v) ? 'Ditolak'
    : /duplikat/i.test(v) ? 'Duplikat' : 'Baru'),
  jenisMasukan: (v) => (!v ? '' : /koreksi/i.test(v) ? 'Koreksi entri' : /saran/i.test(v) ? 'Saran website' : /lain/i.test(v) ? 'Lainnya' : 'Usulan kata baru')
};

/** Pesan galat Supabase yang lebih mudah dipahami */
function pesanTolak_(err) {
  const teks = String(err.message || err).replace(/^Supabase menolak \(\d+\): /, '');
  try {
    const j = JSON.parse(teks);
    if (j.code === '23514') return 'ada isi yang tidak sesuai aturan (' + (j.message || '').replace(/.*constraint "?([^"]+)"?.*/, '$1') + ')';
    if (j.code === '23503') return 'Sub/kategori tidak dikenal';
    if (j.code === '23502') return 'kolom wajib kosong';
    return j.message || teks;
  } catch (e) { return teks.slice(0, 160); }
}
function normalKunci_(m, v) {
  let s = v == null ? '' : String(v).trim();
  if (!s) return '';
  if (m.awalan) {
    const kode = m.awalan.replace(/-$/, '');
    const cocok = s.match(new RegExp('^' + kode + '-?0*(\\d+)$', 'i'));
    if (cocok) s = m.awalan + ('0000000000' + cocok[1]).slice(-Math.max(m.digit, cocok[1].length));
  }
  if (m.tabel === 'kategori') s = s.toUpperCase();
  return s;
}

function formatTanggal_(d) {
  return Utilities.formatDate(d, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'dd/MM/yyyy');
}

function potong_(daftar, ukuran) {
  const hasil = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

function jalankanDenganKunci_(fungsi, tampilkanGalat) {
  const kunci = LockService.getScriptLock();
  if (!kunci.tryLock(30000)) {
    if (tampilkanGalat) SpreadsheetApp.getUi().alert('Sinkron lain sedang berjalan. Coba lagi sebentar lagi.');
    return;
  }
  try {
    fungsi();
  } catch (err) {
    console.error(err);
    if (tampilkanGalat) SpreadsheetApp.getUi().alert('Sinkron gagal ❌', String(err.message || err), SpreadsheetApp.getUi().ButtonSet.OK);
    else throw err;
  } finally {
    kunci.releaseLock();
  }
}

function ringkas_(hasil) {
  return hasil.filter((h) => h.diubah || h.ditambah || h.dilewati || h.catatan.length)
    .map((h) => h.sheet + ': ' + h.diubah + ' diubah, ' + h.ditambah + ' baru'
      + (h.dilewati ? ', ' + h.dilewati + ' dilewati (versi lain lebih baru)' : '')
      + (h.catatan.length ? '\n   ' + h.catatan.slice(0, 5).join('\n   ') + (h.catatan.length > 5 ? '\n   …' : '') : ''))
    .join('\n') || 'Tidak ada perubahan.';
}

function laporan_(judul, hasil) {
  SpreadsheetApp.getUi().alert(judul + ' selesai ✅', ringkas_(hasil), SpreadsheetApp.getUi().ButtonSet.OK);
}
