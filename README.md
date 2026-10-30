# Dorfkrieg

Dorfkrieg ist ein kleines Strategiespiel für den Browser. Du baust ein Dorf auf einem Raster, sammelst **Gold** und **Harz**, rüstest Gebäude über das Rathaus auf, bildest in der Kaserne zwei Truppentypen aus und greifst ein generiertes Feinddorf an. Der Fortschritt liegt nur auf deinem Gerät. Sammler, Bauzeiten und die Ausbildung laufen anhand der verstrichenen Zeit auch weiter, während das Spiel zu ist.

Grafik, Namen und Gebäude sind eigene Platzhalter. Es werden keine fremden Spielfiguren oder Marken verwendet.

## Voraussetzungen

- Node.js 20 oder neuer
- npm

## Lokal starten

```bash
npm install
npm run dev
```

Vite gibt die lokale Adresse aus, normalerweise `http://localhost:5173/`.

## Produktionsbuild

```bash
npm run build
```

Die statische Seite liegt danach im Ordner `dist/`. So siehst du den Build lokal an:

```bash
npm run preview
```

Die Vite-Basis ist `/`, weil die Seite an der Wurzel der Domain ausgeliefert wird.

## Deploy auf GitHub Pages

Der Workflow [`.github/workflows/pages.yml`](.github/workflows/pages.yml) baut bei jedem Push auf `main` das Projekt und veröffentlicht `dist/` auf GitHub Pages. Zusätzlich lässt er sich unter Actions manuell starten.

### Pages aktivieren

1. Im Repository **Settings** → **Pages** öffnen.
2. Unter **Build and deployment** als **Source** die Option **GitHub Actions** wählen.
3. Den Workflow auf `main` laufen lassen (Push oder manuell).

### Eigene Domain dorfkrieg.micana.de

Die Datei `public/CNAME` enthält `dorfkrieg.micana.de` und liegt nach dem Build im Stamm der Seite.

Beim DNS-Anbieter einen einzigen Eintrag anlegen:

| Typ   | Name       | Ziel                         |
| ----- | ---------- | ---------------------------- |
| CNAME | `dorfkrieg` | `michael-linuxdev.github.io` |

Danach:

1. **Settings** → **Pages** öffnen. Die Quelle bleibt **GitHub Actions**.
2. Unter **Custom domain** `dorfkrieg.micana.de` eintragen und speichern.
3. Sobald das Zertifikat ausgestellt ist, **Enforce HTTPS** aktivieren.

DNS-Änderungen können eine Weile brauchen, bis sie überall sichtbar sind.

## Steuerung

- Gebäude in der Liste wählen und auf eine freie Fläche tippen. Palisaden lassen sich nacheinander setzen, bis der Bauarbeiter belegt ist.
- Ziehen verschiebt die Karte. Mausrad oder die Tasten **+**, **−** und **⌖** zoomen und zentrieren. Auf dem Touchscreen zoomen zwei Finger.
- Ein Tipp auf Goldschacht oder Harzsiederei sammelt Rohstoffe ins Lager, bis die Kapazität voll ist.
- Ausbauen kostet Rohstoffe und dauert einen Moment. Die Rathaus-Stufe begrenzt die nächste Stufe.
- In der Kaserne **Schläger** (Nahkampf) und **Speerwerfer** (Fernkampf) ausbilden.
- **Angriff** öffnet ein Feinddorf. Trupp wählen und auf ein leuchtendes Randfeld tippen. Truppen laufen zu Gebäuden, Türme schießen zurück. Am Ende gibt es Sterne und Beute.
- **Überfall** schickt fremde Truppen auf dein eigenes Dorf. Deine Wachtürme und Palisaden kämpfen mit. Gebäude bleiben stehen, Rohstoffe können verloren gehen.
- **Rückzug** beendet den Kampf mit dem bisherigen Ergebnis.
- **Neues Dorf** löscht den lokalen Spielstand.

Sterne im Angriff: einer ab 50 % Zerstörung, einer bei 100 %, einer wenn das Rathaus fällt. Palisaden zählen nicht in die Prozentzahl.

Der Spielstand steckt unter dem Schlüssel `dorfkrieg-save-v1` in `localStorage`.

## Nächste Schritte

- Längere Bauzeiten und ein feinerer Wirtschaftsausgleich für längere Sitzungen
- Weitere Truppentypen, zum Beispiel ein langsamer Rammbock, und weitere Gebäude
- Mehrere Bauarbeiter
- Gezeichnete Grafik und Animationen statt der Platzhalterformen
- Ein geführtes Tutorial mit Aufgaben
- Speichern über ein Konto, damit dasselbe Dorf auf mehreren Geräten liegt
- Angriffe auf Dörfer anderer Spielerinnen und Spieler
- Wiederholung eines Überfalls mit wachsender Welle, wenn das Dorf gut verteidigt wurde
