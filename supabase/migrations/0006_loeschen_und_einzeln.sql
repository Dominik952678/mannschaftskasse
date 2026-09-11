-- ═══════════════════════════════════════════════════════════════════════════
--  Einzelne Posten: rauslöschen und abbezahlen
--
--  • Kassenwart und Admin löschen eine Strafe wieder raus — auch eine, die
--    längst bestätigt ist. Für Anträge bleibt Ablehnen der übliche Weg
--    ('abgelehnt' hinterlässt eine Spur, gelöscht ist gelöscht); verboten
--    ist es trotzdem nicht, wer sich vertippt hat, soll aufräumen können.
--  • Bezahlt wird jetzt auch Posten für Posten, nicht nur alles auf einmal —
--    und wieder zurück, denn Vertipper passieren.
--
--  Eine geteilte Strafe hat einen Status für alle Beteiligten. Wer sie
--  abhakt, hakt sie für beide ab. Das war beim Abhaken ganzer Stände schon
--  so und bleibt hier genauso.
--
--  Reihenfolge: nach 0001–0005, wiederholbar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Wer darf was ──────────────────────────────────────────────────────────
-- Wie in 0003, nur um 'loeschen' ergänzt. Dieselbe Liste steht in
-- src/model/berechtigungen.ts.

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
    -- Wer das Geld verwaltet, räumt auch wieder auf.
    when 'loeschen'           then v_rolle in ('Kassenwart', 'Admin')
    when 'spieltag_abrechnen' then v_rolle in ('Trainer', 'Admin')
    else false
  end;
end;
$$;

-- ── Eine Strafe rauslöschen ───────────────────────────────────────────────
-- Beteiligte und Stimmen hängen per `on delete cascade` dran und gehen mit.

create or replace function public.strafe_loeschen(p_strafe_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.darf('loeschen') then
    raise exception 'Rausnehmen darf nur der Kassenwart.' using errcode = '42501';
  end if;

  delete from public.strafen where id = p_strafe_id;
  if not found then
    raise exception 'Diese Strafe gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;

-- ── Einen einzelnen Posten abhaken — oder das Häkchen zurücknehmen ────────

create or replace function public.strafe_bezahlen(p_strafe_id uuid, p_bezahlt boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
begin
  if not public.darf('abhaken') then
    raise exception 'Abhaken darf nur der Kassenwart.' using errcode = '42501';
  end if;

  select status into v_status from public.strafen where id = p_strafe_id for update;
  if not found then
    raise exception 'Diese Strafe gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  if p_bezahlt then
    if v_status <> 'offen' then
      raise exception 'Nur offene Posten lassen sich abhaken.' using errcode = '22023';
    end if;
    update public.strafen set status = 'bezahlt' where id = p_strafe_id;
  else
    if v_status <> 'bezahlt' then
      raise exception 'Dieser Posten steht nicht als bezahlt.' using errcode = '22023';
    end if;
    update public.strafen set status = 'offen' where id = p_strafe_id;
  end if;
end;
$$;

-- ── Rechte ────────────────────────────────────────────────────────────────
-- darf() bleibt, wie 0005 es hinterlassen hat: die Storage-Policies für die
-- Gegner-Logos rufen es als der angemeldete Nutzer auf und brauchen das Recht.

revoke execute on function public.strafe_loeschen(uuid) from public, anon;
revoke execute on function public.strafe_bezahlen(uuid, boolean) from public, anon;
grant execute on function public.strafe_loeschen(uuid) to authenticated;
grant execute on function public.strafe_bezahlen(uuid, boolean) to authenticated;
