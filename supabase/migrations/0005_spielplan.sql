-- ═══════════════════════════════════════════════════════════════════════════
--  Spielplan und Gegner-Logos
--
--  • Admins legen Spiele in der App an, ändern und löschen sie.
--  • Pro Gegner gibt es ein Logo. Es gehört zum Verein, nicht zum Spiel —
--    einmal hochgeladen, steht es bei jedem Spiel gegen diesen Gegner.
--  • Die Logos liegen im Storage-Bucket `gegner-logos`. Der ist öffentlich
--    lesbar (Vereinslogos sind kein Geheimnis, und so lädt jedes <img> sie
--    direkt); hochladen und löschen dürfen nur Admins.
--
--  Reihenfolge: nach 0001–0004, wiederholbar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Gegner ────────────────────────────────────────────────────────────────
-- Verknüpft über den Namen, so wie er im Spielplan steht. Ein Spiel ohne
-- passenden Eintrag bekommt einfach kein Logo, sondern sein Kürzel.

create table if not exists public.gegner (
  name         text primary key check (btrim(name) <> ''),
  logo_pfad    text check (logo_pfad is null or logo_pfad ~ '^[a-z0-9-]+\.png$'),
  geaendert_am timestamptz not null default now()
);

alter table public.gegner enable row level security;
drop policy if exists "angemeldet liest gegner" on public.gegner;
create policy "angemeldet liest gegner" on public.gegner
  for select to authenticated using (public.aktueller_spieler() is not null);

revoke all on public.gegner from anon, authenticated;
grant select on public.gegner to authenticated;

-- Wer schon im Spielplan steht, wird Gegner.
insert into public.gegner (name)
  select distinct btrim(gegner) from public.spiele where btrim(gegner) <> ''
  on conflict (name) do nothing;

-- ── Logos im Storage ──────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gegner-logos', 'gegner-logos', true, 512000, array['image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Die Storage-Policies fragen `darf()` — dafür muss die Rolle sie aufrufen
-- dürfen. Verrät nichts: `darf()` beantwortet nur, was der Aufrufer selbst darf.
grant execute on function public.darf(text) to authenticated;

drop policy if exists "admins laden gegner-logos hoch" on storage.objects;
create policy "admins laden gegner-logos hoch" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gegner-logos' and public.darf('verwalten'));

drop policy if exists "admins loeschen gegner-logos" on storage.objects;
create policy "admins loeschen gegner-logos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'gegner-logos' and public.darf('verwalten'));

-- Zum Löschen muss der Storage die Datei auch sehen können.
drop policy if exists "mitglieder sehen gegner-logos" on storage.objects;
create policy "mitglieder sehen gegner-logos" on storage.objects
  for select to authenticated
  using (bucket_id = 'gegner-logos' and public.aktueller_spieler() is not null);

-- ── Spielplan pflegen ─────────────────────────────────────────────────────

-- Legt ein Spiel an (p_id null) oder ändert es. Das Ergebnis bleibt dabei,
-- wie es ist — das trägt der Spieltag ein, zusammen mit den Strafen.
create or replace function public.admin_spiel_speichern(p_id uuid, p_daten jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_datum   date;
  v_anstoss time;
  v_gegner  text := btrim(coalesce(p_daten ->> 'gegner', ''));
  v_heim    boolean := coalesce((p_daten ->> 'heim')::boolean, true);
  v_id      uuid;
begin
  perform public.admin_pruefen();

  begin
    v_datum := (p_daten ->> 'datum')::date;
  exception when others then
    v_datum := null;
  end;
  if v_datum is null then
    raise exception 'Das Datum fehlt.' using errcode = '22023';
  end if;

  if nullif(p_daten ->> 'anstoss', '') is not null then
    if (p_daten ->> 'anstoss') !~ '^\d{1,2}:\d{2}$' then
      raise exception 'Anstoß bitte als Uhrzeit, z. B. 15:00.' using errcode = '22023';
    end if;
    v_anstoss := (p_daten ->> 'anstoss')::time;
  end if;

  if v_gegner = '' then
    raise exception 'Der Gegner fehlt.' using errcode = '22023';
  end if;
  if length(v_gegner) > 60 then
    raise exception 'Der Gegnername ist zu lang.' using errcode = '22023';
  end if;

  begin
    if p_id is null then
      insert into public.spiele (datum, anstoss, gegner, heim)
        values (v_datum, v_anstoss, v_gegner, v_heim)
        returning id into v_id;
    else
      update public.spiele
        set datum = v_datum, anstoss = v_anstoss, gegner = v_gegner, heim = v_heim
        where id = p_id
        returning id into v_id;
      if v_id is null then
        raise exception 'Dieses Spiel gibt es nicht mehr.' using errcode = 'P0002';
      end if;
    end if;
  exception when unique_violation then
    raise exception 'Gegen % gibt es an dem Tag schon ein Spiel.', v_gegner using errcode = '23505';
  end;

  insert into public.gegner (name) values (v_gegner) on conflict (name) do nothing;
  return v_id;
end;
$$;

-- Bereits abgerechnete Strafen bleiben stehen; sie hängen nicht am Spiel.
create or replace function public.admin_spiel_loeschen(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_pruefen();
  delete from public.spiele where id = p_id;
end;
$$;

-- Setzt (oder entfernt, mit null) das Logo eines Gegners. Gibt den bisherigen
-- Pfad zurück, damit die App die alte Datei aufräumen kann.
create or replace function public.admin_gegner_logo(p_name text, p_pfad text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
  v_alt  text;
begin
  perform public.admin_pruefen();
  if v_name = '' then
    raise exception 'Der Gegner fehlt.' using errcode = '22023';
  end if;
  if p_pfad is not null and p_pfad !~ '^[a-z0-9-]+\.png$' then
    raise exception 'Ungültiger Dateiname.' using errcode = '22023';
  end if;

  select logo_pfad into v_alt from public.gegner where name = v_name;
  insert into public.gegner (name, logo_pfad, geaendert_am)
    values (v_name, p_pfad, now())
    on conflict (name) do update set logo_pfad = excluded.logo_pfad, geaendert_am = now();
  return v_alt;
end;
$$;

revoke execute on function public.admin_spiel_speichern(uuid, jsonb) from public, anon;
revoke execute on function public.admin_spiel_loeschen(uuid) from public, anon;
revoke execute on function public.admin_gegner_logo(text, text) from public, anon;
grant execute on function public.admin_spiel_speichern(uuid, jsonb) to authenticated;
grant execute on function public.admin_spiel_loeschen(uuid) to authenticated;
grant execute on function public.admin_gegner_logo(text, text) to authenticated;
