-- ═══════════════════════════════════════════════════════════════════════════
--  Spieltag aus dem Spielplan wählen — und nachträglich ändern
--
--  Bisher tippte der Trainer Gegner und Datum frei ein, und die Abrechnung
--  hinterließ nur Strafen mit einer Notiz ("2 Gegentore gg. …"). Wer im
--  Kader stand, stand nirgends — bei einem Spiel ohne Gegentor gar nicht.
--  Ändern ließ sich deshalb nichts, und zweimal abrechnen buchte doppelt.
--
--  Jetzt:
--    • Abgerechnet wird ein Spiel aus dem Spielplan (p_spiel_id).
--    • Der Kader wird gespeichert (spiel_kader), die Posten zeigen auf ihr
--      Spiel (strafen.spiel_id).
--    • `spieltag_abrechnen` gleicht die Kasse an das an, was eingetragen ist:
--      Wer neu im Kader steht, bekommt seinen Posten, wer raus ist, verliert
--      ihn, ein geändertes Ergebnis ändert die Beträge. Wer unverändert dabei
--      ist, behält seinen Posten samt Status.
--    • Ein bezahlter Posten bleibt bezahlt, auch wenn sich sein Betrag
--      ändert. Das Geld klärt der Kassenwart; die App sagt vorher, wen es
--      betrifft.
--
--  Alte Spieltage werden nachgetragen, so gut es geht: Posten finden ihr
--  Spiel über Datum und Notiz, der Kader ergibt sich aus den Gegentor-
--  Posten. Spiele ohne Gegentor bleiben ohne Kader — den markiert man beim
--  nächsten Ändern neu.
--
--  Reihenfolge: nach 0001–0007, wiederholbar. Die App braucht diese
--  Migration, bevor sie deployed wird: Sie liest spiel_kader beim Laden.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Posten und Kader am Spiel ─────────────────────────────────────────────
-- Wird ein Spiel gelöscht, bleiben seine Posten stehen (wie bisher, siehe
-- admin_spiel_loeschen in 0005) — sie hängen dann an keinem Spiel mehr.

alter table public.strafen
  add column if not exists spiel_id uuid references public.spiele(id) on delete set null;
create index if not exists strafen_spiel_idx on public.strafen(spiel_id);

create table if not exists public.spiel_kader (
  spiel_id   uuid not null references public.spiele(id) on delete cascade,
  spieler_id uuid not null references public.spieler(id) on delete cascade,
  primary key (spiel_id, spieler_id)
);

alter table public.spiel_kader enable row level security;
drop policy if exists "angemeldet liest spielkader" on public.spiel_kader;
create policy "angemeldet liest spielkader" on public.spiel_kader
  for select to authenticated using (public.aktueller_spieler() is not null);
revoke all on public.spiel_kader from anon, authenticated;
grant select on public.spiel_kader to authenticated;

-- ── Alte Spieltage nachtragen ─────────────────────────────────────────────
-- Die alte Abrechnung schrieb "… gg. <Gegner>" in die Notiz und legte das
-- Spiel mit demselben Datum im Spielplan an. Darüber finden sich beide.

update public.strafen s
   set spiel_id = sp.id
  from public.spiele sp
 where s.spiel_id is null
   and s.typ_id in ('gegentor', 'tor')
   and s.datum = sp.datum
   and right(s.notiz, length(sp.gegner) + 5) = ' gg. ' || sp.gegner;

insert into public.spiel_kader (spiel_id, spieler_id)
  select distinct s.spiel_id, v.spieler_id
    from public.strafen s
    join public.strafe_spieler v on v.strafe_id = s.id
   where s.typ_id = 'gegentor'
     and s.spiel_id is not null
on conflict do nothing;

-- ── Abrechnen und Ändern ──────────────────────────────────────────────────
-- Neue Signatur: Gegner und Datum kommen aus dem Spielplan, nicht mehr vom
-- Client. Die alte Fassung legte Spiele nebenbei an — das geht nicht mehr.

drop function if exists public.spieltag_abrechnen(text, date, int, int, uuid[]);

create or replace function public.spieltag_abrechnen(
  p_spiel_id uuid, p_tore int, p_gegentore int, p_kader uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ich       uuid := public.aktueller_spieler();
  v_spiel     public.spiele%rowtype;
  v_kader     uuid[];
  v_trainer   uuid;
  v_satz_geg  numeric;
  v_satz_tor  numeric;
  v_notiz_geg text;
  v_notiz_tor text;
  v_strafe_id uuid;
  v_spieler   uuid;
begin
  if not public.darf('spieltag_abrechnen') then
    raise exception 'Den Spieltag rechnet der Trainer ab.' using errcode = '42501';
  end if;
  if p_tore is null or p_gegentore is null or p_tore < 0 or p_gegentore < 0 then
    raise exception 'Das Ergebnis stimmt so nicht.' using errcode = '22023';
  end if;

  select array_agg(distinct k) into v_kader from unnest(p_kader) k where k is not null;
  if v_kader is null then
    raise exception 'Ohne Kader keine Abrechnung.' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_kader) k
              where not exists (select 1 from public.spieler p where p.id = k)) then
    raise exception 'Einen aus dem Kader gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  select * into v_spiel from public.spiele where id = p_spiel_id for update;
  if not found then
    raise exception 'Dieses Spiel gibt es nicht mehr.' using errcode = 'P0002';
  end if;

  select satz into v_satz_geg from public.strafen_typen where id = 'gegentor';
  select satz into v_satz_tor from public.strafen_typen where id = 'tor';
  v_notiz_geg := p_gegentore
    || case when p_gegentore = 1 then ' Gegentor gg. ' else ' Gegentore gg. ' end || v_spiel.gegner;
  v_notiz_tor := p_tore
    || case when p_tore = 1 then ' Tor gg. ' else ' Tore gg. ' end || v_spiel.gegner;

  -- ── Gegentore: ein Posten je Mann im Kader ──

  -- Raus, wer nicht mehr im Kader steht — und alle, wenn hinten die Null stand.
  delete from public.strafen s
   where s.spiel_id = v_spiel.id and s.typ_id = 'gegentor'
     and (p_gegentore = 0 or not exists (
           select 1 from public.strafe_spieler v
            where v.strafe_id = s.id and v.spieler_id = any (v_kader)));

  -- Die alte Abrechnung buchte doppelt, wenn man zweimal abrechnete. Einer
  -- je Mann bleibt — ein bezahlter zuerst.
  delete from public.strafen s
   using (
     select s2.id, row_number() over (
              partition by v.spieler_id
              order by (s2.status = 'bezahlt') desc, s2.erstellt_am, s2.id) as nr
       from public.strafen s2
       join public.strafe_spieler v on v.strafe_id = s2.id
      where s2.spiel_id = v_spiel.id and s2.typ_id = 'gegentor'
   ) d
   where s.id = d.id and d.nr > 1;

  -- Wer dabei bleibt, behält seinen Posten; nur Betrag und Text gehen mit.
  update public.strafen
     set betrag = p_gegentore * v_satz_geg, notiz = v_notiz_geg, datum = v_spiel.datum
   where spiel_id = v_spiel.id and typ_id = 'gegentor';

  if p_gegentore > 0 then
    foreach v_spieler in array v_kader loop
      if not exists (
        select 1 from public.strafen s
          join public.strafe_spieler v on v.strafe_id = s.id
         where s.spiel_id = v_spiel.id and s.typ_id = 'gegentor' and v.spieler_id = v_spieler
      ) then
        insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz, spiel_id)
          values ('gegentor', p_gegentore * v_satz_geg, 'eur', v_spiel.datum, 'offen', v_ich,
                  v_notiz_geg, v_spiel.id)
          returning id into v_strafe_id;
        insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_spieler);
        insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
      end if;
    end loop;
  end if;

  -- ── Tore: ein Posten für den Trainer ──

  if p_tore = 0 then
    delete from public.strafen where spiel_id = v_spiel.id and typ_id = 'tor';
  else
    delete from public.strafen s
     where s.spiel_id = v_spiel.id and s.typ_id = 'tor'
       and s.id <> (select s2.id from public.strafen s2
                     where s2.spiel_id = v_spiel.id and s2.typ_id = 'tor'
                     order by (s2.status = 'bezahlt') desc, s2.erstellt_am, s2.id
                     limit 1);

    -- Ein schon gebuchter Posten bleibt bei dem Trainer, der ihn hat.
    update public.strafen
       set betrag = p_tore * v_satz_tor, notiz = v_notiz_tor, datum = v_spiel.datum
     where spiel_id = v_spiel.id and typ_id = 'tor';

    if not found then
      -- Die Tore zahlt der Trainer — auch wenn ein Admin abrechnet.
      select id into v_trainer from public.spieler
        where rolle::text = 'Trainer' and aktiv
        order by name
        limit 1;
      if v_trainer is null then
        raise exception 'Für die Tore fehlt ein Trainer im Kader.' using errcode = '22023';
      end if;

      insert into public.strafen (typ_id, betrag, einheit, datum, status, angelegt_von, notiz, spiel_id)
        values ('tor', p_tore * v_satz_tor, 'eur', v_spiel.datum, 'offen', v_ich, v_notiz_tor, v_spiel.id)
        returning id into v_strafe_id;
      insert into public.strafe_spieler (strafe_id, spieler_id) values (v_strafe_id, v_trainer);
      insert into public.strafe_bestaetigungen (strafe_id, spieler_id) values (v_strafe_id, v_ich);
    end if;
  end if;

  -- ── Kader und Ergebnis ──

  delete from public.spiel_kader where spiel_id = v_spiel.id and spieler_id <> all (v_kader);
  insert into public.spiel_kader (spiel_id, spieler_id)
    select v_spiel.id, k from unnest(v_kader) k
  on conflict do nothing;

  update public.spiele set tore = p_tore, gegentore = p_gegentore where id = v_spiel.id;
end;
$$;

revoke execute on function public.spieltag_abrechnen(uuid, int, int, uuid[]) from public, anon;
grant execute on function public.spieltag_abrechnen(uuid, int, int, uuid[]) to authenticated;

-- ── Einen Posten rauslöschen ──────────────────────────────────────────────
-- Fassung aus 0006, dazu eins: Ein Gegentor-Posten gehört zu einem Mann im
-- Spieltagskader. Wer ihn rausnimmt, nimmt den Mann aus dem Kader — sonst
-- brächte das nächste Ändern des Spieltags den Posten zurück.

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

  delete from public.spiel_kader k
   using public.strafen s, public.strafe_spieler v
   where s.id = p_strafe_id
     and s.typ_id = 'gegentor'
     and k.spiel_id = s.spiel_id
     and v.strafe_id = s.id
     and k.spieler_id = v.spieler_id;

  delete from public.strafen where id = p_strafe_id;
  if not found then
    raise exception 'Diese Strafe gibt es nicht mehr.' using errcode = 'P0002';
  end if;
end;
$$;
