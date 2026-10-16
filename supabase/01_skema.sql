-- =====================================================================
--  EGYPTIAN ARABIC VOCABULARY — SKEMA DATABASE SUPABASE
-- =====================================================================
--  Cara pakai: Supabase → SQL Editor → New query → paste SELURUH isi file
--  ini → Run. Aman dijalankan ulang (tidak menghapus data yang sudah ada).
--
--  Isi:
--   1. Tabel admin + fungsi cek admin
--   2. Nomor ID otomatis (KK-00001, ADM-001, MSK-00001)
--   3. Tabel kategori, kosakata, tentang, administrasi, panduan, masukan
--   4. Perapian otomatis + updated_at + pencatat log
--   5. Fungsi untuk website (data_publik, terima_masukan)
--   6. Hak akses (RLS): publik hanya baca lewat data_publik,
--      admin boleh ubah, pengunjung hanya boleh kirim masukan
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. ADMIN
-- ---------------------------------------------------------------------
create table if not exists public.admin (
  email   text primary key check (email = lower(email)),
  nama    text not null,
  aktif   boolean not null default true,
  dibuat  timestamptz not null default now()
);

/* true kalau yang sedang login adalah admin aktif */
create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin a
    where a.aktif and a.email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

/* Nama admin yang sedang login (Imam / Abrar), null kalau bukan admin */
create or replace function public.nama_admin()
returns text
language sql stable security definer
set search_path = public
as $$
  select a.nama from public.admin a
  where a.aktif and a.email = lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

/* Peran pemanggil: anon (pengunjung), authenticated (login), service_role (Sheets) */
create or replace function public.peran()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(nullif(auth.role(), ''), nullif(current_setting('role', true), 'none'), current_user::text);
$$;

/* Siapa yang melakukan perubahan, untuk kolom diubah_oleh dan log */
create or replace function public.pelaku()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() ->> 'email', ''),
    case public.peran()
      when 'service_role' then 'Sheets (sinkron)'
      when 'anon' then 'pengunjung'
      when 'authenticated' then 'pengguna login'
      else 'SQL editor'
    end
  );
$$;


-- ---------------------------------------------------------------------
-- 2. NOMOR ID OTOMATIS
--    Nomor tidak pernah dipakai ulang walaupun entri diarsipkan.
-- ---------------------------------------------------------------------
create sequence if not exists public.kosakata_no;
create sequence if not exists public.administrasi_no;
create sequence if not exists public.masukan_no;

create or replace function public.id_baru(awalan text, urutan text, digit int)
returns text
language sql volatile security definer
set search_path = public
as $$
  select awalan || lpad(nextval(format('public.%I', urutan)::regclass)::text, digit, '0');
$$;

/* Kalau ID diisi manual (misalnya dari Sheets), nomor otomatis berikutnya
   dinaikkan supaya tidak bentrok. */
create or replace function public.naikkan_nomor(urutan text, n bigint)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  terakhir bigint;
  dipanggil boolean;
begin
  execute format('select last_value, is_called from public.%I', urutan) into terakhir, dipanggil;
  if not dipanggil then terakhir := terakhir - 1; end if;
  if n > terakhir then
    perform setval(format('public.%I', urutan)::regclass, n, true);
  end if;
end;
$$;

/* Merapikan ID: "kk-7", "KK7", "KK-0007" -> "KK-00007" */
create or replace function public.rapikan_id(id_masuk text, awalan text, urutan text, digit int)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  n bigint;
  kode text := rtrim(awalan, '-');
begin
  if id_masuk is null or btrim(id_masuk) = '' then
    return public.id_baru(awalan, urutan, digit);
  end if;
  if btrim(id_masuk) ~* ('^' || kode || '-?\d+$') then
    n := (regexp_match(id_masuk, '(\d+)\s*$'))[1]::bigint;
    perform public.naikkan_nomor(urutan, n);
    return awalan || lpad(n::text, digit, '0');
  end if;
  return btrim(id_masuk);
end;
$$;


-- ---------------------------------------------------------------------
-- 3. TABEL ISI WEBSITE
-- ---------------------------------------------------------------------
create table if not exists public.kategori (
  kode          text primary key check (kode ~ '^[A-Z]$'),
  nama          text not null,
  nama_en       text,
  label         text,
  ikon          text,
  deskripsi     text,
  deskripsi_en  text,
  target        integer,
  urutan        integer not null default 0,
  updated_at    timestamptz not null default now(),
  diubah_oleh   text
);

create table if not exists public.kosakata (
  id          text primary key,   -- diisi otomatis oleh trigger: KK-00001
  sub         text not null references public.kategori (kode) on update cascade,
  tipe        text not null default 'Kosakata',
  indo        text not null check (length(btrim(indo)) > 0),
  en          text,
  fusha_ar    text,
  fusha_lat   text,
  mesir_ar    text,
  mesir_lat   text,
  saudi_ar    text,
  saudi_lat   text,
  catatan     text,
  catatan_en  text,
  sumber      text,          -- hanya terlihat oleh admin
  status      text not null default 'Draf (perlu dicek)'
              check (status in ('Draf (perlu dicek)', 'Sudah dicek', 'Final', 'Diarsipkan')),
  dicek_oleh  text,
  dibuat      timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  diubah_oleh text
);
create index if not exists kosakata_sub_idx on public.kosakata (sub);
create index if not exists kosakata_updated_idx on public.kosakata (updated_at);

create table if not exists public.tentang (
  kunci       text primary key,
  bagian      text,
  panduan     text,
  isi         text,
  isi_en      text,
  urutan      integer not null default 0,
  updated_at  timestamptz not null default now(),
  diubah_oleh text
);

create table if not exists public.administrasi (
  id              text primary key,   -- diisi otomatis oleh trigger: ADM-001
  tahap           text,
  judul           text not null check (length(btrim(judul)) > 0),
  judul_en        text,
  penjelasan      text,
  penjelasan_en   text,
  dokumen         text,
  tempat          text,
  biaya           text,
  waktu           text,
  tips            text,
  tips_en         text,
  sumber          text,
  terakhir_dicek  text,
  status          text not null default 'Draf (perlu dicek)'
                  check (status in ('Draf (perlu dicek)', 'Sudah dicek', 'Final', 'Diarsipkan')),
  urutan          integer not null default 0,
  dibuat          timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  diubah_oleh     text
);
create index if not exists administrasi_updated_idx on public.administrasi (updated_at);

/* Bagian Panduan yang tampil di website: tujuan, kenapa 3 bahasa,
   prinsip, dan tabel cara baca (kunci baca_01, baca_02, ...) */
create table if not exists public.panduan (
  kunci       text primary key,
  label       text,
  isi         text,
  isi_en      text,
  urutan      integer not null default 0,
  updated_at  timestamptz not null default now(),
  diubah_oleh text
);

/* Usulan kata / koreksi / saran dari pengunjung */
create table if not exists public.masukan (
  id              text primary key,   -- diisi otomatis oleh trigger: MSK-00001
  dibuat          timestamptz not null default now(),
  jenis           text not null default 'Usulan kata baru'
                  check (jenis in ('Usulan kata baru', 'Koreksi entri', 'Saran website', 'Lainnya')),
  sub             text,
  untuk_entri     text,
  indo            text,
  en              text,
  fusha_ar        text,
  fusha_lat       text,
  mesir_ar        text,
  mesir_lat       text,
  saudi_ar        text,
  saudi_lat       text,
  konteks         text,
  nama            text,
  kontak          text,
  tampilkan_nama  text not null default 'Tidak' check (tampilkan_nama in ('Ya', 'Tidak')),
  status          text not null default 'Baru'
                  check (status in ('Baru', 'Sedang dicek', 'Diterima', 'Ditolak', 'Duplikat')),
  catatan_admin   text,
  dicek_oleh      text,
  masuk_ke_id     text,
  updated_at      timestamptz not null default now(),
  diubah_oleh     text,
  constraint masukan_ada_isi check (
    coalesce(btrim(indo), '') <> '' or coalesce(btrim(konteks), '') <> '' or coalesce(btrim(mesir_ar), '') <> ''
  ),
  constraint masukan_tidak_kepanjangan check (
    length(coalesce(indo, '') || coalesce(en, '') || coalesce(fusha_ar, '') || coalesce(fusha_lat, '')
         || coalesce(mesir_ar, '') || coalesce(mesir_lat, '') || coalesce(saudi_ar, '') || coalesce(saudi_lat, '')
         || coalesce(konteks, '') || coalesce(nama, '') || coalesce(kontak, '') || coalesce(untuk_entri, '')) <= 4000
  )
);
create index if not exists masukan_updated_idx on public.masukan (updated_at);

/* Catatan setiap perubahan oleh admin atau sinkron Sheets */
create table if not exists public.log_admin (
  id         bigint generated always as identity primary key,
  waktu      timestamptz not null default now(),
  pelaku     text,
  aksi       text,
  tabel      text,
  baris_id   text,
  perubahan  jsonb
);
create index if not exists log_admin_waktu_idx on public.log_admin (waktu desc);

/* ID tidak memakai nilai bawaan kolom, tapi diisi trigger di bawah
   (supaya pengunjung tidak perlu hak akses ke penghitung nomor) */
alter table public.kosakata     alter column id drop default;
alter table public.administrasi alter column id drop default;
alter table public.masukan      alter column id drop default;


-- ---------------------------------------------------------------------
-- 4. PERAPIAN OTOMATIS, updated_at, DAN LOG
-- ---------------------------------------------------------------------
create or replace function public.rapikan_baris()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  nama text := public.nama_admin();
begin
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  else
    new.updated_at := coalesce(new.updated_at, now());
    if new.updated_at > now() then new.updated_at := now(); end if;
  end if;
  new.diubah_oleh := public.pelaku();

  if tg_table_name = 'kosakata' then
    if tg_op = 'INSERT' then
      new.id := public.rapikan_id(new.id, 'KK-', 'kosakata_no', 5);
    else
      new.id := old.id;
      new.dibuat := old.dibuat;
    end if;
    new.sub    := upper(left(btrim(coalesce(new.sub, '')), 1));
    new.tipe   := coalesce(nullif(initcap(btrim(coalesce(new.tipe, ''))), ''), 'Kosakata');
    new.status := coalesce(nullif(btrim(coalesce(new.status, '')), ''), 'Draf (perlu dicek)');
    if nama is not null and new.status in ('Sudah dicek', 'Final')
       and (tg_op = 'INSERT' or new.status is distinct from old.status) then
      new.dicek_oleh := nama;
    end if;

  elsif tg_table_name = 'administrasi' then
    if tg_op = 'INSERT' then
      new.id := public.rapikan_id(new.id, 'ADM-', 'administrasi_no', 3);
    else
      new.id := old.id;
      new.dibuat := old.dibuat;
    end if;
    new.status := coalesce(nullif(btrim(coalesce(new.status, '')), ''), 'Draf (perlu dicek)');

  elsif tg_table_name = 'masukan' then
    if tg_op = 'INSERT' then
      new.id := public.rapikan_id(new.id, 'MSK-', 'masukan_no', 5);
      new.dibuat := coalesce(new.dibuat, now());
      if nama is null and public.peran() in ('anon', 'authenticated') then
        /* Kiriman pengunjung: kolom admin selalu dikosongkan, dan dibatasi
           maksimal 30 kiriman per jam untuk seluruh website (anti spam) */
        if (select count(*) from public.masukan where dibuat > now() - interval '1 hour') >= 30 then
          raise exception 'Terlalu banyak masukan dalam satu jam. Coba lagi nanti.';
        end if;
        new.status := 'Baru';
        new.catatan_admin := null;
        new.dicek_oleh := null;
        new.masuk_ke_id := null;
        new.dibuat := now();
      end if;
    else
      new.id := old.id;
      new.dibuat := old.dibuat;
    end if;
    new.tampilkan_nama := case when lower(btrim(coalesce(new.tampilkan_nama, ''))) in ('ya', 'y', 'true', 'yes') then 'Ya' else 'Tidak' end;
    new.status := coalesce(nullif(btrim(coalesce(new.status, '')), ''), 'Baru');
    if nama is not null and tg_op = 'UPDATE' and new.status is distinct from old.status then
      new.dicek_oleh := nama;
    end if;

  elsif tg_table_name = 'kategori' then
    new.kode := upper(btrim(new.kode));
    if coalesce(btrim(new.label), '') = '' then new.label := new.kode || '. ' || new.nama; end if;
  end if;

  return new;
end;
$$;

create or replace function public.catat_log()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  lama  jsonb;
  baru  jsonb;
  beda  jsonb := '{}'::jsonb;
  k     text;
  aksi  text;
  idv   text;
begin
  if tg_op = 'INSERT' then
    if public.peran() in ('anon', 'authenticated') and public.nama_admin() is null then
      return null;   /* kiriman masukan dari pengunjung tidak perlu dicatat */
    end if;
    baru := to_jsonb(new);
    idv  := baru ->> tg_argv[0];
    aksi := 'tambah';
    beda := baru - 'updated_at' - 'dibuat' - 'diubah_oleh';
  elsif tg_op = 'UPDATE' then
    lama := to_jsonb(old);
    baru := to_jsonb(new);
    idv  := baru ->> tg_argv[0];
    for k in select jsonb_object_keys(baru) loop
      if k not in ('updated_at', 'diubah_oleh') and (lama -> k) is distinct from (baru -> k) then
        beda := beda || jsonb_build_object(k, jsonb_build_array(lama -> k, baru -> k));
      end if;
    end loop;
    if beda = '{}'::jsonb then return null; end if;
    aksi := case
      when baru ->> 'status' = 'Diarsipkan' and lama ->> 'status' is distinct from 'Diarsipkan' then 'arsip'
      when lama ->> 'status' = 'Diarsipkan' and baru ->> 'status' is distinct from 'Diarsipkan' then 'pulihkan'
      else 'ubah'
    end;
  else
    lama := to_jsonb(old);
    idv  := lama ->> tg_argv[0];
    aksi := 'hapus';
    beda := lama;
  end if;

  insert into public.log_admin (pelaku, aksi, tabel, baris_id, perubahan)
  values (public.pelaku(), aksi, tg_table_name, idv, beda);
  return null;
end;
$$;

do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('kategori', 'kode'), ('kosakata', 'id'), ('tentang', 'kunci'),
      ('administrasi', 'id'), ('panduan', 'kunci'), ('masukan', 'id')
    ) as x(tabel, kunci)
  loop
    execute format('drop trigger if exists a_rapikan on public.%I', t.tabel);
    execute format('create trigger a_rapikan before insert or update on public.%I
                    for each row execute function public.rapikan_baris()', t.tabel);
    execute format('drop trigger if exists z_log on public.%I', t.tabel);
    execute format('create trigger z_log after insert or update or delete on public.%I
                    for each row execute function public.catat_log(%L)', t.tabel, t.kunci);
  end loop;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. FUNGSI UNTUK WEBSITE
-- ---------------------------------------------------------------------

/* Semua data untuk pengunjung dalam satu panggilan.
   Kolom sumber, dicek_oleh, dan entri yang diarsipkan TIDAK ikut. */
create or replace function public.data_publik()
returns json
language sql stable security definer
set search_path = public
as $$
  select json_build_object(
    'kategori', coalesce((
      select json_agg(json_build_object(
        'kode', kode, 'nama', nama, 'nama_en', nama_en, 'ikon', ikon,
        'deskripsi', deskripsi, 'deskripsi_en', deskripsi_en
      ) order by urutan, kode)
      from public.kategori), '[]'::json),

    'kosakata_kolom', json_build_array('id', 'sub', 'tipe', 'indo', 'en', 'fusha_ar', 'fusha_lat',
      'mesir_ar', 'mesir_lat', 'saudi_ar', 'saudi_lat', 'catatan', 'catatan_en', 'status'),
    'kosakata', coalesce((
      select json_agg(json_build_array(id, sub, tipe, indo, en, fusha_ar, fusha_lat,
        mesir_ar, mesir_lat, saudi_ar, saudi_lat, catatan, catatan_en, status) order by id)
      from public.kosakata where status <> 'Diarsipkan'), '[]'::json),

    'tentang', coalesce((
      select json_object_agg(kunci, json_build_object('isi', isi, 'isi_en', isi_en))
      from public.tentang), '{}'::json),

    'administrasi', coalesce((
      select json_agg(json_build_object(
        'id', id, 'tahap', tahap, 'judul', judul, 'judul_en', judul_en,
        'penjelasan', penjelasan, 'penjelasan_en', penjelasan_en, 'dokumen', dokumen,
        'tempat', tempat, 'biaya', biaya, 'waktu', waktu, 'tips', tips, 'tips_en', tips_en,
        'sumber', sumber, 'dicek', terakhir_dicek, 'status', status
      ) order by urutan, id)
      from public.administrasi where status <> 'Diarsipkan'), '[]'::json),

    'panduan', coalesce((
      select json_agg(json_build_object('kunci', kunci, 'label', label, 'isi', isi, 'isi_en', isi_en)
        order by urutan, kunci)
      from public.panduan), '[]'::json),

    'diperbarui', greatest(
      (select max(updated_at) from public.kosakata),
      (select max(updated_at) from public.kategori),
      (select max(updated_at) from public.tentang),
      (select max(updated_at) from public.administrasi),
      (select max(updated_at) from public.panduan)
    )
  );
$$;

/* Admin menerima usulan pengunjung: dibuat entri baru berstatus Draf,
   masukan ditandai Diterima. Mengembalikan ID entri baru. */
create or replace function public.terima_masukan(p_id text, p_sub text default null)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  m     public.masukan;
  v_kode text;
  baru  text;
begin
  if not public.is_admin() then
    raise exception 'Hanya admin yang boleh menerima masukan.';
  end if;

  select * into m from public.masukan where id = p_id for update;
  if not found then
    raise exception 'Masukan % tidak ditemukan.', p_id;
  end if;
  if m.masuk_ke_id is not null then
    return m.masuk_ke_id;
  end if;
  if coalesce(btrim(m.indo), '') = '' then
    raise exception 'Kolom Bahasa Indonesia di masukan % masih kosong. Isi dulu sebelum diterima.', p_id;
  end if;

  v_kode := upper(left(btrim(coalesce(nullif(p_sub, ''), m.sub, '')), 1));
  if not exists (select 1 from public.kategori k0 where k0.kode = v_kode) then
    v_kode := (select k.kode from public.kategori k order by k.urutan, k.kode limit 1);
  end if;

  insert into public.kosakata (sub, tipe, indo, en, fusha_ar, fusha_lat, mesir_ar, mesir_lat,
                               saudi_ar, saudi_lat, catatan, sumber, status)
  values (
    v_kode,
    case when m.indo ~ '[?!.]\s*$' or array_length(regexp_split_to_array(btrim(m.indo), '\s+'), 1) >= 3
         then 'Kalimat' else 'Kosakata' end,
    upper(left(btrim(m.indo), 1)) || substr(btrim(m.indo), 2), m.en, m.fusha_ar, m.fusha_lat, m.mesir_ar, m.mesir_lat, m.saudi_ar, m.saudi_lat,
    m.konteks,
    'Masukan ' || m.id || coalesce(' dari ' || nullif(btrim(m.nama), ''), ''),
    'Draf (perlu dicek)'
  )
  returning id into baru;

  update public.masukan
     set status = 'Diterima', masuk_ke_id = baru
   where id = p_id;

  return baru;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. HAK AKSES
-- ---------------------------------------------------------------------
alter table public.admin        enable row level security;
alter table public.kategori     enable row level security;
alter table public.kosakata     enable row level security;
alter table public.tentang      enable row level security;
alter table public.administrasi enable row level security;
alter table public.panduan      enable row level security;
alter table public.masukan      enable row level security;
alter table public.log_admin    enable row level security;

/* Mulai dari nol: cabut semua hak bawaan, lalu beri yang perlu saja */
revoke all on public.admin, public.kategori, public.kosakata, public.tentang, public.administrasi,
              public.panduan, public.masukan, public.log_admin
  from anon, authenticated;
revoke all on sequence public.kosakata_no, public.administrasi_no, public.masukan_no from anon, authenticated;

/* Admin (login Google) boleh baca, tambah, dan ubah. Tidak ada hapus:
   menghapus = mengubah status jadi "Diarsipkan". */
grant select, insert, update on public.kategori, public.kosakata, public.tentang,
                                public.administrasi, public.panduan to authenticated;
grant select, update on public.masukan to authenticated;
grant select on public.admin, public.log_admin to authenticated;

/* Pengunjung (tanpa login) hanya boleh MENGIRIM masukan, kolom tertentu saja */
grant insert (jenis, sub, untuk_entri, indo, en, fusha_ar, fusha_lat, mesir_ar, mesir_lat,
              saudi_ar, saudi_lat, konteks, nama, kontak, tampilkan_nama)
  on public.masukan to anon, authenticated;

/* Sinkron Sheets memakai service role: boleh semuanya */
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['kategori', 'kosakata', 'tentang', 'administrasi', 'panduan'] loop
    execute format('drop policy if exists admin_baca on public.%I', t);
    execute format('drop policy if exists admin_tambah on public.%I', t);
    execute format('drop policy if exists admin_ubah on public.%I', t);
    execute format('create policy admin_baca on public.%I for select to authenticated using (public.is_admin())', t);
    execute format('create policy admin_tambah on public.%I for insert to authenticated with check (public.is_admin())', t);
    execute format('create policy admin_ubah on public.%I for update to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end;
$$;

drop policy if exists admin_baca on public.admin;
create policy admin_baca on public.admin for select to authenticated using (public.is_admin());

drop policy if exists admin_baca on public.log_admin;
create policy admin_baca on public.log_admin for select to authenticated using (public.is_admin());

drop policy if exists kirim_masukan on public.masukan;
drop policy if exists admin_baca on public.masukan;
drop policy if exists admin_ubah on public.masukan;
create policy kirim_masukan on public.masukan for insert to anon, authenticated with check (true);
create policy admin_baca on public.masukan for select to authenticated using (public.is_admin());
create policy admin_ubah on public.masukan for update to authenticated using (public.is_admin()) with check (public.is_admin());

/* Fungsi yang boleh dipanggil dari website */
revoke execute on function public.terima_masukan(text, text) from public, anon;
revoke execute on function public.id_baru(text, text, int) from public, anon, authenticated;
revoke execute on function public.naikkan_nomor(text, bigint) from public, anon, authenticated;
revoke execute on function public.rapikan_id(text, text, text, int) from public, anon, authenticated;
grant execute on function public.data_publik() to anon, authenticated;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.nama_admin() to authenticated;
grant execute on function public.terima_masukan(text, text) to authenticated;

-- Selesai. Lanjut jalankan 02_data_awal.sql
