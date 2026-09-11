-- ═══════════════════════════════════════════════════════════════════════════
--  Codes automatisch, "seit" raus
--
--  • Den vierstelligen Anmeldecode vergibt ab jetzt die Datenbank: zufällig,
--    eindeutig, sobald ein Spieler angelegt wird. Nachschlagen und neu
--    vergeben geht im SQL-Editor, siehe unten und am Ende von seed.sql.
--  • `spieler.seit` (Eintrittsjahr) entfällt.
--  • Die Trikotnummer bleibt, wie sie ist: von Hand, optional.
--
--  Warum Klartext statt bcrypt: Eindeutigkeit lässt sich nur prüfen, wenn
--  gleiche Codes gleich aussehen — gesalzene Hashes tun das nie. Und bei
--  10 000 möglichen Codes ist ein Hash ohnehin in Sekunden durchprobiert;
--  geschützt wird der Code durch die gesperrte Tabelle und die Sperre nach
--  Fehlversuchen, nicht durch den Hash.
--
--  Reihenfolge: nach 0001. Läuft auf einer frischen wie auf einer schon
--  befüllten Datenbank und lässt sich wiederholen. Wird 0001 noch einmal
--  ausgeführt, danach auch diese Datei wieder.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Spieler ───────────────────────────────────────────────────────────────

alter table public.spieler drop column if exists seit;

-- Falls die erste Fassung dieser Datei (automatische Nummern) schon lief:
-- Trikotnummer wieder frei eintragbar, wie in 0001.
alter table public.spieler alter column nummer drop identity if exists;
alter table public.spieler alter column nummer drop not null;
alter table public.spieler drop constraint if exists spieler_nummer_eindeutig;

-- ── Codes ─────────────────────────────────────────────────────────────────

alter table public.spieler_geheim add column if not exists code text;

-- Würfelt einen Code, den noch niemand hat. Zufall aus pgcrypto, nicht aus
-- random(). Codes, die jeder als erstes probiert (1111, 1234, 9876 …),
-- werden gar nicht erst vergeben.
create or replace function public.code_generieren()
returns text
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_bytes bytea;
  v_code  text;
begin
  for i in 1..1000 loop
    v_bytes := gen_random_bytes(4);
    v_code := lpad((( (get_byte(v_bytes, 0)::bigint << 24)
                    | (get_byte(v_bytes, 1)::bigint << 16)
                    | (get_byte(v_bytes, 2)::bigint << 8)
                    |  get_byte(v_bytes, 3)::bigint) % 10000)::text, 4, '0');

    continue when v_code ~ '^(\d)\1{3}$'
               or strpos('0123456789', v_code) > 0
               or strpos('9876543210', v_code) > 0;

    if not exists (select 1 from public.spieler_geheim where code = v_code) then
      return v_code;
    end if;
  end loop;
  raise exception 'Keinen freien Code gefunden.';
end;
$$;

-- Wer noch keinen Klartext-Code hat, bekommt jetzt einen. Einzeln, damit
-- jeder Durchlauf die schon vergebenen sieht.
do $$
declare
  r record;
begin
  for r in select spieler_id from public.spieler_geheim where code is null loop
    update public.spieler_geheim
      set code = public.code_generieren(), fehlversuche = 0, gesperrt_bis = null
      where spieler_id = r.spieler_id;
  end loop;

  for r in
    select s.id from public.spieler s
    where not exists (select 1 from public.spieler_geheim g where g.spieler_id = s.id)
  loop
    insert into public.spieler_geheim (spieler_id, code)
      values (r.id, public.code_generieren());
  end loop;
end $$;

alter table public.spieler_geheim alter column code set not null;
alter table public.spieler_geheim drop column if exists code_hash;

do $$
begin
  -- Wie ein zweiter Primärschlüssel: jeder Code gehört genau einem Spieler.
  alter table public.spieler_geheim
    add constraint spieler_geheim_code_eindeutig unique (code);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$
begin
  alter table public.spieler_geheim
    add constraint spieler_geheim_code_format check (code ~ '^\d{4}$');
exception when duplicate_object then null;
end $$;

-- Jeder neue Spieler bekommt sofort einen Code — egal ob über seed.sql,
-- den Table Editor oder ein eigenes INSERT.
create or replace function public.spieler_code_anlegen()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  for i in 1..10 loop
    begin
      insert into public.spieler_geheim (spieler_id, code)
        values (new.id, public.code_generieren());
      return new;
    exception when unique_violation then
      -- Jemand anderes hat im selben Moment denselben Code bekommen: neu würfeln.
      null;
    end;
  end loop;
  raise exception 'Konnte keinen freien Code vergeben.';
end;
$$;

drop trigger if exists spieler_code on public.spieler;
create trigger spieler_code
  after insert on public.spieler
  for each row execute function public.spieler_code_anlegen();

-- Neuer Code für einen Spieler, z. B. wenn er seinen vergessen hat oder der
-- Code die Runde gemacht hat. Hebt auch eine Sperre auf. Gibt den neuen
-- Code zurück:  select code_neu('Anna A');
create or replace function public.code_neu(p_name text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id   uuid;
  v_code text;
begin
  select id into v_id from public.spieler where name = p_name;
  if not found then
    raise exception 'Kein Spieler mit dem Namen "%"', p_name;
  end if;

  for i in 1..10 loop
    v_code := public.code_generieren();
    begin
      update public.spieler_geheim
        set code = v_code, fehlversuche = 0, gesperrt_bis = null
        where spieler_id = v_id;
      if not found then
        insert into public.spieler_geheim (spieler_id, code) values (v_id, v_code);
      end if;
      return v_code;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'Konnte keinen freien Code vergeben.';
end;
$$;

-- Der Vorgänger aus 0001 setzte Codes von Hand und hashte sie.
drop function if exists public.code_setzen(uuid, text);

-- ── Anmelden: Vergleich gegen den Klartext ────────────────────────────────

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

  if p_code is distinct from v_geheim.code then
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

  insert into public.spieler_geraete (auth_user_id, spieler_id)
    values (auth.uid(), p_spieler_id)
    on conflict (auth_user_id) do update set spieler_id = excluded.spieler_id, seit = now();

  return jsonb_build_object('ok', true, 'spieler', jsonb_build_object(
    'id', v_spieler.id, 'name', v_spieler.name,
    'nummer', v_spieler.nummer, 'rolle', v_spieler.rolle));
end;
$$;

-- ── Rechte ────────────────────────────────────────────────────────────────
-- Codes würfeln, vergeben und nachschlagen gibt es nur im SQL-Editor.

revoke execute on function public.code_generieren() from public, anon, authenticated;
revoke execute on function public.code_neu(text) from public, anon, authenticated;
revoke execute on function public.spieler_code_anlegen() from public, anon, authenticated;
grant execute on function public.code_generieren() to service_role;
grant execute on function public.code_neu(text) to service_role;

revoke execute on function public.spieler_verifizieren(uuid, text) from public, anon;
grant execute on function public.spieler_verifizieren(uuid, text) to authenticated;
