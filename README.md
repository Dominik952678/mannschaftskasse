# Mannschaftskasse

Strafenkasse der TSG Irlich I als mobile Web-App. Umgesetzt nach dem
Claude-Design-Entwurf `Mannschaftskasse.dc.html`.

```bash
npm run dev      # Entwicklungsserver
npm run build    # Produktionsbuild
npm run lint
```

## Zwei Betriebsarten

Die App läuft gegen eine von zwei Ablagen — welche, entscheidet allein die
Konfiguration:

| | ohne `.env.local` | mit Supabase-Zugangsdaten |
| --- | --- | --- |
| Daten | `src/data/anfang.ts`, im Speicher | Supabase-Datenbank |
| Anmeldung | Code aus `ENTWICKLUNGS_CODE` | eigener Code je Spieler, von der Datenbank vergeben |
| Reload | alles wieder auf Anfang | bleibt |

Umgeschaltet wird nirgends im Code: `src/supabase/client.ts` prüft, ob
`VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY` gesetzt sind, und
`auth/adapter.ts` bzw. `data/repositoryFabrik.ts` wählen danach aus.

## Anmeldung

Man wählt sein Profil aus dem Kader und tippt einen vierstelligen Code, der
genau dieses Profil bestätigt. Die Rolle des Profils — Spieler, Kassenwart
oder Trainer — steuert danach, was die App zeigt und zulässt.

Mit Supabase läuft das in zwei Schritten:

1. Die App meldet sich **anonym** an. Damit gibt es ein echtes JWT und eine
   `auth.uid()`, an der die RLS-Policies hängen können.
2. Der Code geht an die Datenbankfunktion `spieler_verifizieren`. Die prüft
   ihn gegen `spieler_geheim` und verknüpft das anonyme Konto mit dem Profil.
   Erst ab da ist die Kasse überhaupt lesbar.

Die Codes würfelt die Datenbank, sobald ein Spieler angelegt wird —
zufällig, eindeutig, ohne Allerweltscodes wie 1111 oder 1234. Sie liegen im
Klartext in `spieler_geheim`, einer Tabelle, die der App komplett verschlossen
ist; nachschlagen kann sie nur, wer im Supabase-Dashboard sitzt. Gehasht wird
bewusst nicht: Eindeutigkeit ließe sich mit gesalzenen Hashes nicht prüfen,
und bei 10 000 Möglichkeiten wäre ein Hash ohnehin in Sekunden durchprobiert.

> **Zur Codelänge:** vier Ziffern sind 10 000 Möglichkeiten. Die Datenbank
> sperrt deshalb nach fünf Fehlversuchen für 15 Minuten. Für eine
> Mannschaftskasse reicht das; für etwas, an dem echtes Geld hängt, wären
> mehr Stellen oder ein zweiter Faktor angebracht.

## Supabase einrichten

1. Projekt anlegen (Region: Frankfurt), dann **Authentication → Sign In /
   Providers → Allow anonymous sign-ins** einschalten.
2. Im SQL-Editor nacheinander ausführen:
   - `supabase/migrations/0001_schema.sql` — Tabellen, Policies, Funktionen
   - `supabase/migrations/0002_codes_automatisch.sql` — Codes vergibt
     die Datenbank
   - `supabase/seed.sql` — vorher Kader und Spielplan eintragen; Zeilen mit
     `BEISPIEL` werden übersprungen. Am Ende steht die Liste der Codes zum
     Weiterleiten.
3. URL und Publishable/anon Key (Button **Connect** oben im Dashboard) in
   `.env.local` eintragen, siehe `.env.example`. Dev-Server neu starten.

Alle SQL-Dateien sind wiederholbar — die Migrationen immer zusammen und in
dieser Reihenfolge. Nachzügler trägt man in `seed.sql` nach und führt sie
nochmal aus; Codes nachschlagen oder neu würfeln, Rollen wechseln und Geräte
abmelden steht als Schnipsel am Ende der Datei.

Der `anon key` darf öffentlich sein: er kommt nur durch die Policies.

## Berechtigungen

Dieselben Regeln stehen zweimal — einmal fürs Auge, einmal als Türsteher:

| | Spieler | Kassenwart | Trainer |
| --- | --- | --- | --- |
| Antrag stellen | ✓ | ✓ | ✓ |
| gilt sofort, ohne Antrag | | ✓ | |
| Antrag bestätigen | eine Stimme von zwei | allein | eine Stimme von zwei |
| Antrag ablehnen | | ✓ | ✓ |
| Zahlung abhaken | | ✓ | |
| Spieltag abrechnen | | | ✓ |

`src/model/berechtigungen.ts` blendet aus, was nicht geht.
Durchgesetzt wird es in `supabase/migrations/0001_schema.sql`: gelesen wird
direkt aus den Tabellen, geschrieben ausschließlich über Datenbank­funktionen,
die die Rolle des Aufrufers prüfen. Auch Einheit und Satz einer Strafe kommen
aus der Tabelle `strafen_typen`, nicht aus dem Browser.

Die Beschriftungen dazu stehen in `src/model/katalog.ts`. Wer den Katalog
ändert, muss beide Stellen anfassen — `strafen_typen` in der Migration und
`KATALOG` im Client.

## Daten

Im lokalen Modus kommen die Startdaten aus `src/data/anfang.ts`; dort steht
auch ein Beispiel für jede Liste. Der Vertrag für beide Ablagen sind die
Typen in `src/model/types.ts`:

| Feld | Bedeutung |
| --- | --- |
| `spieler` | Kader inkl. Trainer, Rolle, Trikotnummer, Geburtstag als `"MM-TT"` |
| `strafen` | Posten der Kasse; mehrere `spielerIds` heißen "geteilt, Betrag je Mann" |
| `spiele` | Spielplan; mit `tore`/`gegentore` gilt ein Spiel als gespielt |

## Aufbau

```
src/
  model/       Typen, Strafenkatalog, Berechtigungen, Formatierung, Ableitungen
  auth/        Anmeldung: Vertrag, lokaler Adapter, Supabase-Adapter, Provider
  data/        Repository-Vertrag, lokale Ablage, Supabase-Ablage, Startdaten
  supabase/    Client (null ohne Konfiguration)
  store/       Kasse im Zustand + Aktionen
  screens/     Anmelden · TSG · Kasse · Eintragen · Spieltag · Profil
  components/  Hülle und wiederkehrende Bausteine
  styles/      Design-System, Vereinsfarben, App-Layout
supabase/
  migrations/  Schema, Policies, Anmelde- und Schreibfunktionen
```

## Was noch fehlt

- Kader, Spielplan und Codes pflegt man bisher im SQL-Editor — eine
  Verwaltungsansicht für den Kassenwart fehlt
- echte Erinnerungen (Push oder Mail) und der PayPal-Link, beide in
  `src/store/KasseProvider.tsx` als `TODO` markiert
- nach jeder Änderung lädt die App alles neu; für Live-Updates zwischen
  mehreren Handys wäre Supabase Realtime der nächste Schritt
- Migration und `seed.sql` sind gegen Postgres 16 mit nachgebauten
  Supabase-Rollen getestet, nicht gegen ein echtes Supabase-Projekt —
  die verschachtelten Abfragen in `supabaseRepository.ts` laufen über
  PostgREST und sind damit noch ungeprüft
