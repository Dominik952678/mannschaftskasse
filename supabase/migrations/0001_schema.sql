-- ═══════════════════════════════════════════════════════════════════════════
--  Mannschaftskasse — Schema, Anmeldung und Schreibfunktionen
--
--  Anmeldung in zwei Schritten:
--    1. Die App meldet sich anonym an (Supabase Auth). Damit gibt es ein
--       echtes JWT und eine auth.uid(), an der die Policies hängen können.
--    2. `spieler_verifizieren` prüft den vierstelligen Code gegen den Hash
--       in `spieler_geheim` und verknüpft das anonyme Konto mit genau einem
--       Spielerprofil. Erst danach sieht man die Kasse.
--
--  Gelesen wird direkt aus den Tabellen, geschrieben nur über die Funktionen
--  weiter unten — die prüfen die Rolle. Die Tabellen selbst nehmen von der
--  App keine INSERTs oder UPDATEs an.
--
--  Voraussetzung: Authentication → Providers → "Anonymous sign-ins" aktiviert.
-- ═══════════════════════════════════════════════════════════════════════════

-- pgcrypto liegt bei Supabase in `extensions`; die Funktionen unten rufen
-- crypt() unqualifiziert auf und pinnen dafür ihren search_path.
create extension if not exists pgcrypto with schema extensions;

-- ── Stammdaten ────────────────────────────────────────────────────────────

create table if not exists public.verein (
  id          int primary key default 1 check (id = 1),
  name        text not null,
  mannschaft  text not null,
  saison      text not null
);

do $$ begin
  create type public.rolle as enum ('Spieler', 'Kassenwart', 'Trainer');
exception when duplicate_object then null;
end $$;

create table if not exists public.spieler (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  rolle       public.rolle not null default 'Spieler',
  position    text,
  nummer      int,
  seit        int,
  -- Geburtstag als "MM-TT"; das Jahr braucht die Kasse nicht.
  geburtstag  text check (geburtstag ~ '^\d{2}-\d{2}$'),
  aktiv       boolean not null default true,
  erstellt_am timestamptz not null default now(),
  -- Eindeutig, weil man sich auf dem Anmeldeschirm am Namen erkennt.
  -- Zwei Max Müller heißen hier "Max Müller" und "Max Müller jun.".
  constraint spieler_name_eindeutig unique (name)
);

-- Der Code liegt nur hier, nur als bcrypt-Hash, und nur SECURITY-DEFINER-
-- Funktionen kommen dran. Die Tabelle hat bewusst keine einzige Policy.
create table if not exists public.spieler_geheim (
  spieler_id   uuid primary key references public.spieler(id) on delete cascade,
  code_hash    text not null,
  fehlversuche int not null default 0,
  gesperrt_bis timestamptz
);

-- Ein Gerät (anonymes Auth-Konto) zeigt auf ein Profil. Mehrere Geräte je
-- Spieler sind erlaubt — sonst wirft das Handy das Tablet raus.
create table if not exists public.spieler_geraete (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  spieler_id   uuid not null references public.spieler(id) on delete cascade,
  seit         timestamptz not null default now()
);
create index if not exists spieler_geraete_spieler_idx on public.spieler_geraete(spieler_id);

-- ── Strafenkatalog ────────────────────────────────────────────────────────
-- Muss zu src/model/katalog.ts passen: dort stehen Beschriftung und Preistext,
-- hier Einheit und Satz — die braucht die Datenbank fürs Rechnen.

create table if not exists public.strafen_typen (
  id           text primary key,
  einheit      text not null check (einheit in ('eur', 'kiste')),
  satz         numeric(10,2),
  automatisch  boolean not null default false
);

insert into public.strafen_typen (id, einheit, satz, automatisch) values
  ('training',  'eur',   5,    false),
  ('spiel',     'eur',  10,    false),
  ('dress',     'eur',   5,    false),
  ('spaet',     'eur',  null,  false),
  ('ball',      'kiste', 0.5,  false),
  ('debut',     'kiste', 1,    false),
  ('erstestor', 'kiste', 1,    false),
  ('binde',     'kiste', 1,    false),
  ('gegentor',  'eur',   0.5,  true),
  ('tor',       'eur',   1,    true),
  ('gebu',      'kiste', 1,    true)
on conflict (id) do nothing;

-- ── Kasse ─────────────────────────────────────────────────────────────────

create table if not exists public.spiele (
  id         uuid primary key default gen_random_uuid(),
  datum      date not null,
  anstoss    time,
  gegner     text not null,
  heim       boolean not null default true,
  tore       int check (tore >= 0),
  gegentore  int check (gegentore >= 0),
  unique (datum, gegner)
);

create table if not exists public.strafen (
  id          uuid primary key default gen_random_uuid(),
  typ_id      text not null references public.strafen_typen(id),
  betrag      numeric(10,2) not null check (betrag > 0),
  einheit     text not null check (einheit in ('eur', 'kiste')),
  datum       date not null,
  status      text not null default 'antrag'
              check (status in ('antrag', 'offen', 'bezahlt', 'abgelehnt')),
  angelegt_von uuid references public.spieler(id) on delete set null,
  notiz       text,
  erstellt_am timestamptz not null default now()
);
create index if not exists strafen_status_idx on public.strafen(status);

-- Mehrere Spieler an einer Strafe heißen: geteilt, der Betrag gilt je Mann.
create table if not exists public.strafe_spieler (
  strafe_id  uuid not null references public.strafen(id) on delete cascade,
  spieler_id uuid not null references public.spieler(id) on delete cascade,
  primary key (strafe_id, spieler_id)
);

create table if not exists public.strafe_bestaetigungen (
  strafe_id  uuid not null references public.strafen(id) on delete cascade,
  spieler_id uuid not null references public.spieler(id) on delete cascade,
  am         timestamptz not null default now(),
  primary key (strafe_id, spieler_id)
);

-- ── Wer bin ich ───────────────────────────────────────────────────────────

create or replace function public.aktueller_spieler()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select g.spieler_id
  from public.spieler_geraete g
  join public.spieler s on s.id = g.spieler_id
  where g.auth_user_id = auth.uid()
    and s.aktiv
$$;

create or replace function public.aktuelle_rolle()
returns public.rolle
language sql
stable
security definer
set search_path = public
as $$
  select s.rolle
  from public.spieler_geraete g
  join public.spieler s on s.id = g.spieler_id
  where g.auth_user_id = auth.uid()
    and s.aktiv
$$;

-- ── Row Level Security ────────────────────────────────────────────────────
-- Lesen darf, wer angemeldet ist. Schreiben darf über die Tabellen niemand;
-- dafür gibt es die Funktionen weiter unten.

alter table public.verein               enable row level security;
alter table public.spieler              enable row level security;
alter table public.spieler_geheim       enable row level security;
alter table public.spieler_geraete      enable row level security;
alter table public.strafen_typen        enable row level security;
alter table public.spiele               enable row level security;
alter table public.strafen              enable row level security;
alter table public.strafe_spieler       enable row level security;
alter table public.strafe_bestaetigungen enable row level security;

drop policy if exists "angemeldet liest verein" on public.verein;
create policy "angemeldet liest verein"   on public.verein
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest spieler" on public.spieler;
create policy "angemeldet liest spieler"  on public.spieler
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest typen" on public.strafen_typen;
create policy "angemeldet liest typen"    on public.strafen_typen
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest spiele" on public.spiele;
create policy "angemeldet liest spiele"   on public.spiele
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest strafen" on public.strafen;
create policy "angemeldet liest strafen"  on public.strafen
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest beteiligte" on public.strafe_spieler;
create policy "angemeldet liest beteiligte" on public.strafe_spieler
  for select to authenticated using (public.aktueller_spieler() is not null);
drop policy if exists "angemeldet liest stimmen" on public.strafe_bestaetigungen;
create policy "angemeldet liest stimmen"  on public.strafe_bestaetigungen
  for select to authenticated using (public.aktueller_spieler() is not null);

-- Das eigene Gerät darf man sehen, mehr nicht.
drop policy if exists "eigenes geraet" on public.spieler_geraete;
create policy "eigenes geraet" on public.spieler_geraete
  for select to authenticated using (auth_user_id = auth.uid());

-- spieler_geheim bekommt bewusst keine Policy: damit ist die Tabelle für
-- anon und authenticated dicht, egal was jemand versucht.
revoke all on public.spieler_geheim from anon, authenticated;

grant select on public.verein, public.spieler, public.strafen_typen,
  public.spiele, public.strafen, public.strafe_spieler,
  public.strafe_bestaetigungen, public.spieler_geraete to authenticated;

-- ── Profilauswahl vor der Anmeldung ───────────────────────────────────────
-- Die View läuft mit den Rechten ihres Besitzers und umgeht damit die RLS
-- auf `spieler` — genau dafür ist sie da. Sie zeigt nur, was auf dem
-- Anmeldeschirm steht: Name, Nummer, Rolle.

create or replace view public.spieler_oeffentlich
with (security_invoker = false) as
  select id, name, nummer, rolle
  from public.spieler
  where aktiv;

-- Supabase vergibt per Default-Privileges ALL auf neue Objekte. Eine View
-- über eine einzelne Tabelle ist aber updatebar — und diese hier läuft mit
-- den Rechten ihres Besitzers. Ohne dieses REVOKE könnte sich jeder über
-- `update spieler_oeffentlich set rolle = 'Kassenwart'` befördern.
revoke all on public.spieler_oeffentlich from public, anon, authenticated;
grant select on public.spieler_oeffentlich to authenticated;

-- ── Anmelden ──────────────────────────────────────────────────────────────

create or replace function public.spieler_verifizieren(p_spieler_id uuid, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_geheim  public.spieler_geheim%rowtype;
  v_spieler public.spieler%rowtype;
  v_max_versuche constant int := 5;
  v_sperre       constant interval := interval '15 minutes';
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  select * into v_spieler from public.spieler where id = p_spieler_id and aktiv;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  select * into v_geheim from public.spieler_geheim
    where spieler_id = p_spieler_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'grund', 'unbekannt');
  end if;

  if v_geheim.gesperrt_bis is not null and v_geheim.gesperrt_bis > now() then
    return jsonb_build_object('ok', false, 'grund', 'gesperrt', 'frei_ab', v_geheim.gesperrt_bis);
  end if;

  if v_geheim.code_hash <> crypt(p_code, v_geheim.code_hash) then
    update public.spieler_geheim
      set fehlversuche = fehlversuche + 1,
          gesperrt_bis = case when fehlversuche + 1 >= v_max_versuche
                              then now() + v_sperre else null end
      where spieler_id = p_spieler_id;
    return jsonb_build_object(
      'ok', false, 'grund', 'falscher-code',
      'versuche_uebrig', greatest(0, v_max_versuche - (v_geheim.fehlversuche + 1)));
  end if;

  update public.spieler_geheim
    set fehlversuche = 0, gesperrt_bis = null
    where spieler_id = p_spieler_id;

  -- Dieses Gerät zeigt ab jetzt auf dieses Profil.
  insert into public.spieler_geraete (auth_user_id, spieler_id)
    values (auth.uid(), p_spieler_id)
    on conflict (auth_user_id) do update set spieler_id = excluded.spieler_id, seit = now();

  return jsonb_build_object('ok', true, 'spieler', jsonb_build_object(
    'id', v_spieler.id, 'name', v_spieler.name,
    'nummer', v_spieler.nummer, 'rolle', v_spieler.rolle));
end;
$$;

create or replace function public.meine_sitzung()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', s.id, 'name', s.name, 'nummer', s.nummer, 'rolle', s.rolle)
  from public.spieler_geraete g
  join public.spieler s on s.id = g.spieler_id
  where g.auth_user_id = auth.uid() and s.aktiv
$$;

create or replace function public.spieler_abmelden()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.spieler_geraete where auth_user_id = auth.uid();
$$;

-- ── Schreiben ─────────────────────────────────────────────────────────────

-- Erwartet ein Array aus {spieler_ids, typ_id, betrag, einheit, datum, notiz}.
create or replace function public.strafen_anlegen(p_eintraege jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich       uuid := public.aktueller_spieler();
  v_rolle     public.rolle := public.aktuelle_rolle();
  v_direkt    boolean;
  v_eintrag   jsonb;
  v_typ       public.strafen_typen%rowtype;
  v_betrag    numeric;
  v_strafe_id uuid;
  v_spieler   uuid;
begin
  if v_ich is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;
  -- Der Kassenwart bucht direkt, alle anderen stellen einen Antrag.
  v_direkt := v_rolle = 'Kassenwart';

  for v_eintrag in select * from jsonb_array_elements(p_eintraege) loop
    if jsonb_array_length(v_eintrag -> 'spieler_ids') = 0 then
      raise exception 'Ohne Spieler keine Strafe.' using errcode = '22023';
    end if;

    select * into v_typ from public.strafen_typen where id = v_eintrag ->> 'typ_id';
    if not found then
      raise exception 'Diesen Grund gibt es nicht.' using errcode = '22023';
    end if;
    -- Gegentore, Tore und Geburtstage bucht die Kasse selbst.
    if v_typ.automatisch then
      raise exception 'Diesen Grund trägt die Kasse selbst ein.' using errcode = '42501';
    end if;

    v_betrag := (v_eintrag ->> 'betrag')::numeric;
    if v_typ.satz is not null then
      -- Feste Sätze legt der Katalog fest, nicht der Client.
      v_betrag := v_typ.satz;
    elsif v_betrag is null or v_betrag <= 0 then
      raise exception 'Betrag fehlt.' using errcode = '22023';
    end if;

    insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz)
    values (
      v_typ.id,
      v_betrag,
      -- Die Einheit gehört zum Grund, nicht zur Eingabe.
      v_typ.einheit,
      (v_eintrag ->> 'datum')::date,
      case when v_direkt then 'offen' else 'antrag' end,
      v_ich,
      nullif(v_eintrag ->> 'notiz', '')
    )
    returning id into v_strafe_id;

    for v_spieler in
      select (value #>> '{}')::uuid from jsonb_array_elements(v_eintrag -> 'spieler_ids')
    loop
      insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_spieler);
    end loop;

    if v_direkt then
      insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
    end if;
  end loop;
end;
$$;

create or replace function public.strafe_entscheiden(p_strafe_id uuid, p_bestaetigen boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich     uuid := public.aktueller_spieler();
  v_rolle   public.rolle := public.aktuelle_rolle();
  v_status  text;
  v_stimmen int;
begin
  if v_ich is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

  select status into v_status from public.strafen where id = p_strafe_id for update;
  if not found then
    raise exception 'Diese Strafe gibt es nicht mehr.' using errcode = 'P0002';
  end if;
  if v_status <> 'antrag' then
    raise exception 'Darüber ist längst entschieden.' using errcode = '22023';
  end if;

  if not p_bestaetigen then
    if v_rolle = 'Spieler' then
      raise exception 'Ablehnen darf nur der Kassenwart oder der Trainer.' using errcode = '42501';
    end if;
    update public.strafen set status = 'abgelehnt' where id = p_strafe_id;
    return;
  end if;

  if v_rolle = 'Kassenwart' then
    -- Eine Stimme vom Kassenwart reicht.
    insert into public.strafe_bestaetigungen (strafe_id, spieler_id)
      values (p_strafe_id, v_ich) on conflict do nothing;
    update public.strafen set status = 'offen' where id = p_strafe_id;
    return;
  end if;

  insert into public.strafe_bestaetigungen (strafe_id, spieler_id)
    values (p_strafe_id, v_ich) on conflict do nothing;
  select count(*) into v_stimmen from public.strafe_bestaetigungen where strafe_id = p_strafe_id;
  if v_stimmen >= 2 then
    update public.strafen set status = 'offen' where id = p_strafe_id;
  end if;
end;
$$;

create or replace function public.strafen_abhaken(p_spieler_id uuid, p_einheit text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.aktuelle_rolle() is distinct from 'Kassenwart' then
    raise exception 'Abhaken darf nur der Kassenwart.' using errcode = '42501';
  end if;

  update public.strafen s
    set status = 'bezahlt'
    where s.einheit = p_einheit
      and s.status = 'offen'
      and exists (
        select 1 from public.strafe_spieler v
        where v.strafe_id = s.id and v.spieler_id = p_spieler_id);
end;
$$;

create or replace function public.spieltag_abrechnen(
  p_gegner text, p_datum date, p_tore int, p_gegentore int, p_kader uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich       uuid := public.aktueller_spieler();
  v_satz_geg  numeric;
  v_satz_tor  numeric;
  v_strafe_id uuid;
  v_spieler   uuid;
begin
  if public.aktuelle_rolle() is distinct from 'Trainer' then
    raise exception 'Den Spieltag rechnet der Trainer ab.' using errcode = '42501';
  end if;
  if array_length(p_kader, 1) is null then
    raise exception 'Ohne Kader keine Abrechnung.' using errcode = '22023';
  end if;

  select satz into v_satz_geg from public.strafen_typen where id = 'gegentor';
  select satz into v_satz_tor from public.strafen_typen where id = 'tor';

  -- Gegentore treffen jeden im Kader einzeln.
  if p_gegentore > 0 then
    foreach v_spieler in array p_kader loop
      insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz)
        values ('gegentor', p_gegentore * v_satz_geg, 'eur', p_datum, 'offen', v_ich,
                p_gegentore || case when p_gegentore = 1 then ' Gegentor gg. ' else ' Gegentore gg. ' end || p_gegner)
        returning id into v_strafe_id;
      insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_spieler);
      insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
    end loop;
  end if;

  -- Die eigenen Tore zahlt der Trainer.
  if p_tore > 0 then
    insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz)
      values ('tor', p_tore * v_satz_tor, 'eur', p_datum, 'offen', v_ich,
              p_tore || case when p_tore = 1 then ' Tor gg. ' else ' Tore gg. ' end || p_gegner)
      returning id into v_strafe_id;
    insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_ich);
    insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
  end if;

  insert into public.spiele (datum, gegner, heim, tore, gegentore)
    values (p_datum, p_gegner, true, p_tore, p_gegentore)
    on conflict (datum, gegner) do update
      set tore = excluded.tore, gegentore = excluded.gegentore;
end;
$$;

-- ── Codes vergeben ────────────────────────────────────────────────────────
-- Nur mit dem service_role key aufrufen (SQL-Editor im Dashboard zählt dazu):
--   select public.code_setzen('<spieler-uuid>', '1234');

create or replace function public.code_setzen(p_spieler_id uuid, p_code text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_code !~ '^\d{4}$' then
    raise exception 'Der Code muss aus genau vier Ziffern bestehen.';
  end if;
  insert into public.spieler_geheim (spieler_id, code_hash, fehlversuche, gesperrt_bis)
    values (p_spieler_id, crypt(p_code, gen_salt('bf', 10)), 0, null)
    on conflict (spieler_id) do update
      set code_hash = excluded.code_hash, fehlversuche = 0, gesperrt_bis = null;
end;
$$;

-- ── Rechte ────────────────────────────────────────────────────────────────
-- SECURITY-DEFINER-Funktionen gehören nicht PUBLIC. Und nicht `anon`: dem
-- geben Supabases Default-Privileges sie direkt, nicht über PUBLIC.

revoke execute on function public.spieler_verifizieren(uuid, text) from public, anon;
revoke execute on function public.meine_sitzung() from public, anon;
revoke execute on function public.spieler_abmelden() from public, anon;
revoke execute on function public.strafen_anlegen(jsonb) from public, anon;
revoke execute on function public.strafe_entscheiden(uuid, boolean) from public, anon;
revoke execute on function public.strafen_abhaken(uuid, text) from public, anon;
revoke execute on function public.spieltag_abrechnen(text, date, int, int, uuid[]) from public, anon;
revoke execute on function public.aktueller_spieler() from public, anon;
revoke execute on function public.aktuelle_rolle() from public, anon;
grant execute on function public.aktueller_spieler() to authenticated;
grant execute on function public.aktuelle_rolle() to authenticated;
revoke execute on function public.code_setzen(uuid, text) from public, anon, authenticated;
grant execute on function public.code_setzen(uuid, text) to service_role;

grant execute on function public.spieler_verifizieren(uuid, text) to authenticated;
grant execute on function public.meine_sitzung() to authenticated;
grant execute on function public.spieler_abmelden() to authenticated;
grant execute on function public.strafen_anlegen(jsonb) to authenticated;
grant execute on function public.strafe_entscheiden(uuid, boolean) to authenticated;
grant execute on function public.strafen_abhaken(uuid, text) to authenticated;
grant execute on function public.spieltag_abrechnen(text, date, int, int, uuid[]) to authenticated;
