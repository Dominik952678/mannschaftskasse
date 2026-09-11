-- ═══════════════════════════════════════════════════════════════════════════
--  Admin-Rolle
--
--  Admin darf alles, was Kassenwart und Trainer dürfen: direkt buchen,
--  allein abnicken, ablehnen, abhaken, Spieltag abrechnen. Wer Admin ist,
--  gehört weiter zum Kader — Strafen treffen ihn wie jeden anderen.
--
--  Die Regeln stehen jetzt an einer Stelle, in `darf()`, und sind dieselben
--  wie in src/model/berechtigungen.ts.
--
--  Nebenbei: Die Tore beim Spieltag-Abrechnen gingen bisher auf den, der
--  abrechnet. Seit auch ein Admin abrechnen darf, gehen sie ausdrücklich auf
--  den Trainer.
--
--  Reihenfolge: nach 0001 und 0002, wiederholbar.
--  Dich selbst zum Admin machen: in einem eigenen Lauf danach, siehe seed.sql.
-- ═══════════════════════════════════════════════════════════════════════════

-- Neue Enum-Werte darf man erst nach dem Commit benutzen. Deshalb vergleicht
-- alles unten die Rolle als Text — dann läuft die Datei in einem Rutsch.
alter type public.rolle add value if not exists 'Admin';

-- ── Wer darf was ──────────────────────────────────────────────────────────

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
    -- Der Eintrag gilt sofort, ohne Antrag; eine Stimme reicht zum Abnicken.
    when 'direkt_buchen'      then v_rolle in ('Kassenwart', 'Admin')
    when 'ablehnen'           then v_rolle in ('Kassenwart', 'Trainer', 'Admin')
    when 'abhaken'            then v_rolle in ('Kassenwart', 'Admin')
    when 'spieltag_abrechnen' then v_rolle in ('Trainer', 'Admin')
    else false
  end;
end;
$$;

-- ── Schreibfunktionen auf darf() umstellen ────────────────────────────────

create or replace function public.strafen_anlegen(p_eintraege jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich       uuid := public.aktueller_spieler();
  v_direkt    boolean := public.darf('direkt_buchen');
  v_eintrag   jsonb;
  v_typ       public.strafen_typen%rowtype;
  v_betrag    numeric;
  v_strafe_id uuid;
  v_spieler   uuid;
begin
  if v_ich is null then
    raise exception 'Nicht angemeldet.' using errcode = '28000';
  end if;

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
    if not public.darf('ablehnen') then
      raise exception 'Ablehnen darf nur der Kassenwart oder der Trainer.' using errcode = '42501';
    end if;
    update public.strafen set status = 'abgelehnt' where id = p_strafe_id;
    return;
  end if;

  insert into public.strafe_bestaetigungen (strafe_id, spieler_id)
    values (p_strafe_id, v_ich) on conflict do nothing;

  -- Kassenwart und Admin nicken allein ab, alle anderen sind eine von zwei Stimmen.
  if public.darf('direkt_buchen') then
    update public.strafen set status = 'offen' where id = p_strafe_id;
    return;
  end if;

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
  if not public.darf('abhaken') then
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
  v_trainer   uuid;
  v_satz_geg  numeric;
  v_satz_tor  numeric;
  v_strafe_id uuid;
  v_spieler   uuid;
begin
  if not public.darf('spieltag_abrechnen') then
    raise exception 'Den Spieltag rechnet der Trainer ab.' using errcode = '42501';
  end if;
  if array_length(p_kader, 1) is null then
    raise exception 'Ohne Kader keine Abrechnung.' using errcode = '22023';
  end if;

  -- Die Tore zahlt der Trainer — auch wenn ein Admin abrechnet.
  select id into v_trainer from public.spieler
    where rolle::text = 'Trainer' and aktiv
    order by name
    limit 1;
  if p_tore > 0 and v_trainer is null then
    raise exception 'Für die Tore fehlt ein Trainer im Kader.' using errcode = '22023';
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

  if p_tore > 0 then
    insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz)
      values ('tor', p_tore * v_satz_tor, 'eur', p_datum, 'offen', v_ich,
              p_tore || case when p_tore = 1 then ' Tor gg. ' else ' Tore gg. ' end || p_gegner)
      returning id into v_strafe_id;
    insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_trainer);
    insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
  end if;

  insert into public.spiele (datum, gegner, heim, tore, gegentore)
    values (p_datum, p_gegner, true, p_tore, p_gegentore)
    on conflict (datum, gegner) do update
      set tore = excluded.tore, gegentore = excluded.gegentore;
end;
$$;

-- ── Rechte ────────────────────────────────────────────────────────────────
-- darf() rufen nur die Schreibfunktionen auf; von außen braucht sie keiner.

revoke execute on function public.darf(text) from public, anon, authenticated;
