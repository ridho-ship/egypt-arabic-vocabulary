/* =====================================================================
   PENGATURAN WEBSITE — satu-satunya file yang perlu diisi/diubah
   =====================================================================
   Setelah mengubah file ini, commit ke GitHub. Cloudflare otomatis
   memperbarui website dalam 1-2 menit.
   ===================================================================== */
window.EAV_CONFIG = {

  /* 1. SUPABASE
     Ambil dari Supabase → Project Settings → API Keys.
     - supabaseUrl  : "Project URL", contoh https://abcdefgh.supabase.co
     - supabaseKey  : "Publishable key" (sb_publishable_...) atau "anon public".
       Kunci ini memang aman dipasang di website.
       JANGAN pernah menempel "Secret key" / "service_role" di sini. */
  supabaseUrl: 'https://mkqvbrwceogxhssftwig.supabase.co',
  supabaseKey: 'sb_publishable_GEDgy3zJCaNjCwLDsO4eYw_l94R6W0L',

  /* 2. MEDIA DARI CLOUDINARY
     Tempel link dari Cloudinary. Kalau dibiarkan kosong, website memakai
     file cadangan di folder assets (tetap jalan normal). */
  media: {
    /* video logo saat loading */
    loaderVideo: 'https://res.cloudinary.com/zgglvjaj/video/upload/v1792137052/VID-20261016-WA0010.mp4',
    /* logo harus PNG transparan. Versi di Cloudinary sekarang JPG (latarnya tidak transparan,
       https://res.cloudinary.com/zgglvjaj/image/upload/v1792136963/IMG-20261016-WA0001.jpg),
       jadi sementara dikosongkan: website memakai logo transparan di assets/img. */
    logo: '',
    /* foto piramida siang (mode pagi) */
    headerPagi: 'https://res.cloudinary.com/zgglvjaj/image/upload/v1792136963/IMG-20261016-WA0008.jpg',
    /* foto piramida malam (mode malam) */
    headerMalam: 'https://res.cloudinary.com/zgglvjaj/image/upload/v1792136964/IMG-20261016-WA0009.jpg'
  },

  /* Detik video logo dipotong (aslinya 10 detik, logo sudah lengkap di 3,2 detik) */
  loaderPotongDetik: 3.5,

  /* 3. FITUR TAMBAHAN (bisa dinyalakan nanti) */
  trakteer: '',          /* contoh 'https://trakteer.id/namaabrar' — kosong = tombol tidak tampil */
  fiturMasukan: true,   /* true = tombol "Usulkan kata" dan formulir masukan tampil */

  /* 4. TEKS & LAINNYA */
  namaCadangan: 'Abrar Akhmad Ridho',
  urlWebsite: 'https://egypt-arabic-vocabulary.pages.dev'
};
