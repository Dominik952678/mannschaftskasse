-- ═══════════════════════════════════════════════════════════════════════════
--  Verwaltung in der App
--
--  • Der Admin bleibt unter sich: Wer sonst den Kader liest, sieht einen
--    Admin als ganz normalen Spieler. Seine echte Rolle bekommt nur er selbst
--    (über `meine_sitzung`) und die Verwaltung.
--  • Admins pflegen den Kader in der App: Spieler anlegen und ändern, Rollen
--    setzen, Codes ansehen, neu würfeln und Sperren aufheben, Geräte abmelden.
--
--  Reihenfolge: nach 0001–0003, wiederholbar. Wird eine frühere Datei noch
--  einmal ausgeführt, danach auch die späteren wieder.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Neues Recht: verwalten ────────────────────────────────────────────────

create or replace function public.darf(p_recht text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rolle text := public.aktuelle_rolle()::text;
begin
  if v_rolle is null then
    return false;
  end if;
  return case p_recht
    when 'direkt_buchen'      then v_rolle in ('Kassenwart', 'Admin')
    when 'ablehnen'           then v_rolle in ('Kassenwart', 'Trainer', 'Admin')
    when 'abhaken'            then v_rolle in ('Kassenwart', 'Admin')
    when 'spieltag_abrechnen' then v_rolle in ('Trainer', 'Admin')
    when 'verwalten'          then v_rolle = 'Admin'
    else false
  end;
end;
$$;

revoke execute on function public.darf(text) from public, anon, authenticated;

-- ── Der Admin erscheint als Spieler ───────────────────────────────────────
-- Verglichen wird als Text: So läuft die Datei auch im selben Rutsch wie 0003,
-- in dem der Wert 'Admin' gerade erst entsteht.

create or replace view public.spieler_oeffentlich
with (security_invoker = false) as
  select id, name, nummer,
         case when rolle::text = 'Admin' then 'Spieler'::public.rolle else rolle end as rolle
  from public.spieler
  where aktiv;

revoke all on public.spieler_oeffentlich from public, anon, authenticated;
grant select on public.spieler_oeffentlich to authenticated;

-- Der Kader für angemeldete Mitglieder. Ersetzt das direkte Lesen der Tabelle:
-- Eine Spalte lässt sich per RLS nicht verstecken, eine View kann sie umschreiben.
create or replace view public.spieler_kader
with (security_invoker = false) as
  select id, name,
         case when rolle::text = 'Admin' then 'Spieler'::public.rolle else rolle end as rolle,
         nummer, position, geburtstag, aktiv
  from public.spieler
  where public.aktueller_spieler() is not null;

-- Wie bei spieler_oeffentlich: die View ist updatebar und läuft mit den
-- Rechten ihres Besitzers — also nur lesen.
revoke all on public.spieler_kader from public, anon, authenticated;
grant select on public.spieler_kader to authenticated;

-- Die Tabelle selbst liest die App nicht mehr, sonst stünde die echte Rolle
-- einen Klick entfernt in den Entwicklertools.
revoke all on public.spieler from anon, authenticated;

-- ── Verwaltung ────────────────────────────────────────────────────────────

create or replace function public.admin_pruefen()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.darf('verwalten') then
    raise exception 'Das dürfen nur Admins.' using errcode = '42501';
  end if;
end;
$$;

-- Prüft die Eingaben aus dem Formular und gibt sie bereinigt zurück.
create or replace function public.admin_eingabe_pruefen(p_daten jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_name       text := btrim(coalesce(p_daten ->> 'name', ''));
  v_rolle      text := coalesce(p_daten ->> 'rolle', 'Spieler');
  v_nummer     text := nullif(btrim(coalesce(p_daten ->> 'nummer', '')), '');
  v_position   text := nullif(btrim(coalesce(p_daten ->> 'position', '')), '');
  v_geburtstag text := nullif(btrim(coalesce(p_daten ->> 'geburtstag', '')), '');
begin
  if v_name = '' then
    raise exception 'Der Name fehlt.' using errcode = '22023';
  end if;
  if v_rolle not in ('Spieler', 'Kassenwart', 'Trainer', 'Admin') then
    raise exception 'Unbekannte Rolle "%".', v_rolle using errcode = '22023';
  end if;
  if v_nummer is not null and (v_nummer !~ '^\d{1,2}$') then
    raise exception 'Die Trikotnummer muss zwischen 0 und 99 liegen.' using errcode = '22023';
  end if;
  if v_geburtstag is not null and (
       v_geburtstag !~ '^\d{2}-\d{2}$'
       or substr(v_geburtstag, 1, 2)::int not between 1 and 12
       or substr(v_geburtstag, 4, 2)::int not between 1 and 31) then
    raise exception 'Geburtstag bitte als Tag und Monat.' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'name', v_name, 'rolle', v_rolle, 'nummer', v_nummer::int,
    'position', v_position, 'geburtstag', v_geburtstag,
    'aktiv', coalesce((p_daten ->> 'aktiv')::boolean, true));
end;
$$;

-- Alles über den Kader — mit echten Rollen, Codes, Sperren und Geräten.
create or replace function public.admin_kader()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform public.admin_pruefen();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name, 'rolle', s.rolle, 'nummer', s.nummer,
      'position', s.position, 'geburtstag', s.geburtstag, 'aktiv', s.aktiv,
      'code', g.code,
      'fehlversuche', coalesce(g.fehlversuche, 0),
      'gesperrt_bis', case when g.gesperrt_bis > now() then g.gesperrt_bis end,
      'geraete', (select count(*) from public.spieler_geraete d where d.spieler_id = s.id)
    ) order by s.aktiv desc, s.name)
    from public.spieler s
    left join public.spieler_geheim g on g.spieler_id = s.id
  ), '[]'::jsonb);
end;
$$;

-- Legt einen Spieler an; den Code würfelt der Trigger aus 0002.
-- Gibt id und Code zurück, damit man ihn gleich weiterleiten kann.
create or replace function public.admin_spieler_anlegen(p_daten jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e  jsonb;
  v_id uuid;
begin
  perform public.admin_pruefen();
  v_e := public.admin_eingabe_pruefen(p_daten);

  begin
    insert into public.spieler (name, rolle, nummer, position, geburtstag)
    values (v_e ->> 'name', (v_e ->> 'rolle')::public.rolle, (v_e ->> 'nummer')::int,
            v_e ->> 'position', v_e ->> 'geburtstag')
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Den Namen "%" gibt es schon.', v_e ->> 'name' using errcode = '23505';
  end;

  return jsonb_build_object('id', v_id,
    'code', (select code from public.spieler_geheim where spieler_id = v_id));
end;
$$;

create or replace function public.admin_spieler_aendern(p_id uuid, p_daten jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_e jsonb;
begin
  perform public.admin_pruefen();
  v_e := public.admin_eingabe_pruefen(p_daten);

  -- Wer sich selbst herabstuft oder austrägt, sperrt sich aus der Verwaltung aus.
  if p_id = public.aktueller_spieler()
     and (v_e ->> 'rolle' <> 'Admin' or not (v_e ->> 'aktiv')::boolean) then
    raise exception 'Dich selbst kannst du nicht herabstufen oder austragen.' using errcode = '42501';
  end if;

  begin
    update public.spieler
      set name       = v_e ->> 'name',
          rolle      = (v_e ->> 'rolle')::public.rolle,
          nummer     = (v_e ->> 'nummer')::int,
          position   = v_e ->> 'position',
          geburtstag = v_e ->> 'geburtstag',
          aktiv      = (v_e ->> 'aktiv')::boolean
      where id = p_id;
  exception when unique_violation then
    raise exception 'Den Namen "%" gibt es schon.', v_e ->> 'name' using errcode = '23505';
  end;
  if not found then
    raise exception 'Diesen Spieler gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;

-- Neuer Code, z. B. wenn der alte die Runde gemacht hat. Hebt die Sperre auf.
create or replace function public.admin_code_neu(p_id uuid)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_code text;
begin
  perform public.admin_pruefen();
  if not exists (select 1 from public.spieler where id = p_id) then
    raise exception 'Diesen Spieler gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  for i in 1..10 loop
    v_code := public.code_generieren();
    begin
      insert into public.spieler_geheim (spieler_id, code) values (p_id, v_code)
        on conflict (spieler_id) do update
          set code = excluded.code, fehlversuche = 0, gesperrt_bis = null;
      return v_code;
    exception when unique_violation then
      null; -- im selben Moment an jemand anderen vergeben: neu würfeln
    end;
  end loop;
  raise exception 'Konnte keinen freien Code vergeben.';
end;
$$;

create or replace function public.admin_sperre_aufheben(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_pruefen();
  update public.spieler_geheim set fehlversuche = 0, gesperrt_bis = null where spieler_id = p_id;
end;
$$;

-- Meldet den Spieler auf allen Geräten ab — etwa wenn ein Handy weg ist.
-- Mit seinem Code kann er sich danach neu anmelden.
create or replace function public.admin_geraete_abmelden(p_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_anzahl int;
begin
  perform public.admin_pruefen();
  if p_id = public.aktueller_spieler() then
    raise exception 'Dich selbst meldest du im Profil ab.' using errcode = '42501';
  end if;
  delete from public.spieler_geraete where spieler_id = p_id;
  get diagnostics v_anzahl = row_count;
  return v_anzahl;
end;
$$;

-- ── Rechte ────────────────────────────────────────────────────────────────
-- Aufrufen darf jeder Angemeldete; ob er Admin ist, prüft jede Funktion selbst.

revoke execute on function public.admin_pruefen() from public, anon, authenticated;
revoke execute on function public.admin_eingabe_pruefen(jsonb) from public, anon, authenticated;

revoke execute on function public.admin_kader() from public, anon;
revoke execute on function public.admin_spieler_anlegen(jsonb) from public, anon;
revoke execute on function public.admin_spieler_aendern(uuid, jsonb) from public, anon;
revoke execute on function public.admin_code_neu(uuid) from public, anon;
revoke execute on function public.admin_sperre_aufheben(uuid) from public, anon;
revoke execute on function public.admin_geraete_abmelden(uuid) from public, anon;

grant execute on function public.admin_kader() to authenticated;
grant execute on function public.admin_spieler_anlegen(jsonb) to authenticated;
grant execute on function public.admin_spieler_aendern(uuid, jsonb) to authenticated;
grant execute on function public.admin_code_neu(uuid) to authenticated;
grant execute on function public.admin_sperre_aufheben(uuid) to authenticated;
grant execute on function public.admin_geraete_abmelden(uuid) to authenticated;
