-- ═══════════════════════════════════════════════════════════════════════════
--  Spieler aus dem Kader löschen
--
--  Bisher gab es nur "ausgetreten" (aktiv = false): der Mann verschwindet aus
--  allen Auswahllisten, seine Einträge bleiben in der Kasse stehen. Das ist
--  weiterhin der richtige Weg für jemanden, der wirklich mal dabei war.
--
--  Zum Löschen gibt es zwei Fälle:
--    • Keine Einträge in der Kasse — ein Tippfehler, ein Testeintrag, jemand
--      der nie gespielt hat: raus damit, ohne Rückfrage an die Datenbank.
--    • Mit Einträgen: nur auf ausdrücklichen Wunsch (p_mit_eintraegen), denn
--      Summen und Schandmauer ändern sich damit rückwirkend. Strafen, die nur
--      ihn betrafen, fliegen ganz raus; an geteilten bleibt der Rest stehen.
--
--  Wichtig ist der Unterschied zwischen beidem: Ein Spieler, der einfach per
--  `delete` verschwände, ließe seine Strafen als Geisterposten zurück — die
--  Gesamtsumme oben in der Kasse zählt sie weiter, nur gehören sie niemandem
--  mehr. Deshalb räumt diese Funktion ausdrücklich auf.
--
--  Sich selbst löschen geht nicht. Damit bleibt immer mindestens ein Admin
--  übrig, und niemand sperrt den Verein aus der Verwaltung aus.
--
--  Reihenfolge: nach 0001–0006, wiederholbar.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.admin_spieler_loeschen(
  p_id uuid, p_mit_eintraegen boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name      text;
  v_eintraege int;
begin
  perform public.admin_pruefen();

  if p_id = public.aktueller_spieler() then
    raise exception 'Dich selbst kannst du nicht löschen.' using errcode = '42501';
  end if;

  select name into v_name from public.spieler where id = p_id for update;
  if not found then
    raise exception 'Diesen Spieler gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  select count(*) into v_eintraege
    from public.strafe_spieler where spieler_id = p_id;

  if v_eintraege > 0 and not p_mit_eintraegen then
    raise exception
      '% hat % Einträge in der Kasse. Entweder auf ausgetreten setzen — dann '
      'bleibt alles stehen — oder ausdrücklich samt Einträgen löschen.',
      v_name, v_eintraege
      using errcode = '23503';
  end if;

  -- Strafen, an denen sonst niemand hängt, gehen ganz raus. Bei geteilten
  -- räumt gleich das `on delete cascade` auf strafe_spieler seine Zeile weg;
  -- die Strafe bleibt für die anderen Beteiligten bestehen.
  delete from public.strafen s
   where exists (
           select 1 from public.strafe_spieler v
            where v.strafe_id = s.id and v.spieler_id = p_id)
     and (select count(*) from public.strafe_spieler v2 where v2.strafe_id = s.id) = 1;

  -- Code, Geräte, restliche Beteiligungen und Stimmen hängen per cascade dran.
  -- `strafen.angelegt_von` steht auf `set null`: wer eine Strafe eingetragen
  -- hat, verschwindet daraus, die Strafe selbst bleibt.
  delete from public.spieler where id = p_id;

  return jsonb_build_object('name', v_name, 'eintraege', v_eintraege);
end;
$$;

revoke execute on function public.admin_spieler_loeschen(uuid, boolean) from public, anon;
grant execute on function public.admin_spieler_loeschen(uuid, boolean) to authenticated;
