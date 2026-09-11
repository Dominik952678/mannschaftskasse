-- ═══════════════════════════════════════════════════════════════════════════
--  Mannschaftskasse — Daten einpflegen
--
--  Nach 0001_schema.sql und 0002_codes_automatisch.sql im SQL-Editor
--  von Supabase ausführen.
--
--  • Zeilen, die mit BEISPIEL anfangen, werden übersprungen. Lass sie als
--    Vorlage stehen und schreib deine Zeilen darunter.
--  • Die Anmeldecodes vergibt die Datenbank selbst. Ganz unten steht die
--    Liste zum Weiterleiten.
--  • Wiederholbar: wer schon drin ist (gleicher Name), wird nicht doppelt
--    angelegt, und sein Code bleibt, wie er ist. Du kannst die Datei also
--    später um Nachzügler ergänzen und einfach nochmal komplett ausführen.
--  • Spieler werden überall über ihren Namen gefunden. Schreib ihn in allen
--    Blöcken exakt gleich.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1 · Verein ────────────────────────────────────────────────────────────

insert into public.verein (id, name, mannschaft, saison)
values (1, 'TSG Irlich', 'Irlich I', '25/26')
on conflict (id) do update
  set name = excluded.name, mannschaft = excluded.mannschaft, saison = excluded.saison;


-- ── 2 · Kader ─────────────────────────────────────────────────────────────
--  rolle:      'Spieler', 'Kassenwart' oder 'Trainer' — genau so geschrieben
--  nr:         Trikotnummer; nr, position und geburtstag dürfen null sein
--  geburtstag: 'MM-TT', also '03-14' für den 14. März
--
--  Den Anmeldecode bekommt jeder automatisch — zufällig, eindeutig.

do $$
declare
  r    record;
  v_id uuid;
begin
  for r in
    select * from (values
    --  name                   rolle         nr    position              geburtstag
      ('BEISPIEL Kassenwart', 'Kassenwart',  1,    'Tor',                '02-02'),
      ('BEISPIEL Trainer',    'Trainer',     null, null,                 null),
      ('BEISPIEL Spieler',    'Spieler',     8,    'Linkes Mittelfeld',  '03-14')
    ) as t(name, rolle, nummer, position, geburtstag)
  loop
    continue when r.name like 'BEISPIEL%';

    if exists (select 1 from public.spieler where name = r.name) then
      raise notice 'schon da, übersprungen: %', r.name;
      continue;
    end if;

    -- Den Code legt der Trigger aus 0002 gleich mit an.
    insert into public.spieler (name, rolle, nummer, position, geburtstag)
    values (r.name, r.rolle::public.rolle, r.nummer::int, r.position, r.geburtstag)
    returning id into v_id;

    raise notice 'angelegt: % (%)', r.name, r.rolle;
  end loop;
end $$;


-- ── 3 · Spielplan ─────────────────────────────────────────────────────────
--  heim:  true = Heimspiel, false = auswärts
--  Ergebnis leer lassen (null, null), solange das Spiel nicht gespielt ist.
--  Bereits gespielte Spiele mit Ergebnis tauchen auf der Startseite als
--  "Letztes Spiel" auf — Strafen bucht das aber nicht. Die Gegentor-Strafen
--  entstehen erst, wenn der Trainer in der App den Spieltag abrechnet.

insert into public.spiele (datum, anstoss, gegner, heim, tore, gegentore)
select datum::date, anstoss::time, gegner, heim, tore::int, gegentore::int
from (values
--  datum         anstoss  gegner                      heim   tore  gegentore
  ('2026-09-06', '15:00', 'BEISPIEL SG Musterstadt',  true,  2,    0),
  ('2026-09-13', '14:30', 'BEISPIEL FC Beispiel',     false, null, null)
) as t(datum, anstoss, gegner, heim, tore, gegentore)
where gegner not like 'BEISPIEL%'
on conflict (datum, gegner) do nothing;


-- ── 4 · Altbestand aus der bisherigen Kasse (optional) ────────────────────
--  Für Posten, die schon vor der App offen waren oder die du als erledigt
--  mit übernehmen willst.
--
--  wer:    ein Name, oder mehrere mit " + " für geteilte Strafen
--          ('Anna A + Bert B' — der Betrag gilt dann je Person)
--  grund:  eine ID aus dem Strafenkatalog:
--          training · spiel · dress · spaet · ball · debut · erstestor ·
--          binde · gegentor · tor · gebu
--  status: 'offen' oder 'bezahlt'
--
--  Ein Posten mit gleichem Grund, Datum, Betrag, gleichen Personen und
--  gleicher Notiz wird nicht doppelt angelegt. Zwei echte gleiche Posten am
--  selben Tag? Dann die Notiz unterscheiden.

do $$
declare
  r      record;
  v_typ  public.strafen_typen%rowtype;
  v_ids  uuid[];
  v_id   uuid;
  v_n    int;
begin
  for r in
    select * from (values
    --  wer                                grund       betrag  datum         status     notiz
      ('BEISPIEL Spieler',                'training', 5,      '2026-08-28', 'offen',   null),
      ('BEISPIEL Spieler + BEISPIEL Zwei', 'ball',     0.5,    '2026-08-30', 'bezahlt', null)
    ) as t(wer, grund, betrag, datum, status, notiz)
  loop
    continue when r.wer like 'BEISPIEL%';

    select * into v_typ from public.strafen_typen where id = r.grund;
    if not found then
      raise exception 'Unbekannter Grund "%" bei %', r.grund, r.wer;
    end if;

    v_n := cardinality(string_to_array(r.wer, ' + '));
    v_ids := array(
      select s.id from public.spieler s
      where s.name = any (array(select trim(x) from unnest(string_to_array(r.wer, ' + ')) as x))
      order by s.id);
    if cardinality(v_ids) <> v_n then
      raise exception 'Nicht alle Namen gefunden in "%" — Schreibweise prüfen', r.wer;
    end if;

    if exists (
      select 1 from public.strafen s
      where s.typ_id = r.grund
        and s.datum = r.datum::date
        and s.betrag = r.betrag::numeric
        and s.notiz is not distinct from r.notiz
        and array(select v.spieler_id from public.strafe_spieler v
                  where v.strafe_id = s.id order by v.spieler_id) = v_ids
    ) then
      raise notice 'steht schon drin, übersprungen: % · %', r.wer, r.grund;
      continue;
    end if;

    insert into public.strafen (typ_id, betrag, einheit, datum, status, notiz)
    values (r.grund, r.betrag::numeric, v_typ.einheit, r.datum::date, r.status, r.notiz)
    returning id into v_id;

    insert into public.strafe_spieler (strafe_id, spieler_id)
    select v_id, unnest(v_ids);

    raise notice 'übernommen: % · % · %', r.wer, r.grund, r.status;
  end loop;
end $$;


-- ── 5 · Kontrolle ─────────────────────────────────────────────────────────
--  Das Ergebnis erscheint unten im SQL-Editor.

select
  (select count(*) from public.spieler)                         as spieler,
  (select count(*) from public.spieler where rolle = 'Kassenwart') as kassenwarte,
  (select count(*) from public.spieler where rolle = 'Trainer')    as trainer,
  (select count(*) from public.spieler s
     where not exists (select 1 from public.spieler_geheim g where g.spieler_id = s.id))
                                                                as ohne_code,
  (select count(*) from public.spiele)                          as spiele,
  (select count(*) from public.strafen)                         as strafen;

-- Die Codes zum Weiterleiten. Jeder bekommt nur seinen eigenen.
select s.name, s.nummer as nr, s.rolle, g.code
from public.spieler s
join public.spieler_geheim g on g.spieler_id = s.id
where s.aktiv
order by s.name;


-- ═══════════════════════════════════════════════════════════════════════════
--  Später — einzeln markieren und mit "Run selected" ausführen
-- ═══════════════════════════════════════════════════════════════════════════

-- Code eines Spielers nachschauen:
--   select g.code from public.spieler_geheim g
--   join public.spieler s on s.id = g.spieler_id where s.name = 'Anna A';

-- Neuen Code würfeln, z. B. wenn der alte die Runde gemacht hat
-- (hebt auch eine Sperre auf, der neue Code steht im Ergebnis):
--   select public.code_neu('Anna A');

-- Nur die Sperre aufheben, Code bleibt:
--   update public.spieler_geheim set fehlversuche = 0, gesperrt_bis = null
--   where spieler_id = (select id from public.spieler where name = 'Anna A');

-- Rolle wechseln (z. B. neuer Kassenwart — den alten dann zurück auf 'Spieler'):
--   update public.spieler set rolle = 'Kassenwart' where name = 'Anna A';

-- Jemand hat das Handy verloren — auf allen Geräten abmelden:
--   delete from public.spieler_geraete
--   where spieler_id = (select id from public.spieler where name = 'Anna A');

-- Spieler verlässt die Mannschaft (Posten bleiben, Anmeldung geht nicht mehr):
--   update public.spieler set aktiv = false where name = 'Anna A';

-- Wer ist gerade auf welchem Gerät angemeldet:
--   select s.name, s.rolle, g.seit
--   from public.spieler_geraete g join public.spieler s on s.id = g.spieler_id
--   order by g.seit desc;
