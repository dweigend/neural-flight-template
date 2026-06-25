# Icaros Host Integration Für Eine Bestehende Experience

Diese Anleitung erklärt Schritt für Schritt, wie eine bestehende WebXR- oder
Browser-VR-Experience an `Icaros Host` angebunden wird.

Die Anleitung ist so geschrieben, dass auch andere Projekte sie übernehmen
können.

## Ziel

Am Ende soll die Experience:

1. ihre eigene HTTPS-Seite weiter normal rendern
2. Steuerdaten vom Host über `wss://<host>/ws/control/main` lesen
3. sich optional beim Host über `wss://<host>/ws/runtime` registrieren
4. über `https://<host>:5183/launch` als Launch-Ziel auswählbar sein

## Was sich ändert und was nicht

Was bleibt in der Experience:

- Three.js- oder WebXR-Rendering
- Spiel- oder Fluglogik
- Szenen, Assets, Shader, UI
- vorhandene Experience-Architektur

Was neu dazukommt:

- ein Host-Control-Client für `control.orientation`
- optional ein Runtime-Registration-Client für `client.hello` und Heartbeats
- eine Konfiguration für die Host-Origin

Was die Experience nicht mehr selbst tun soll:

- nicht direkt mit dem M5 reden
- nicht `/ws/device` öffnen
- keine rohen M5-Daten parsen
- `/launch` nicht selbst bauen

## Voraussetzungen

Bevor du anfängst:

1. Die Experience muss über HTTPS laufen.
2. Die Experience braucht eine stabile LAN-URL, zum Beispiel:

   ```txt
   https://<client-lan-ip-or-name>:5174/vr
   ```

3. Der Host muss separat laufen, zum Beispiel:

   ```txt
   https://<host-lan-ip-or-name>:5183
   ```

4. Host und Client müssen sich im Netzwerk erreichen können.

## Schritt 1: Host-Origin als Browser-Konfiguration anlegen

Lege im Client-Projekt eine `.env` an oder ergänze sie:

```env
PUBLIC_ICAROS_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183
PUBLIC_ICAROS_EXPERIENCE_ID=neural-flight-vr
```

Bedeutung:

- `PUBLIC_ICAROS_HOST_ORIGIN` ist die HTTPS-Adresse des Hosts
- `PUBLIC_ICAROS_EXPERIENCE_ID` ist der stabile technische Name der Experience

Wichtig:

- `PUBLIC_` ist nötig, damit die Werte im Browser verfügbar sind
- die Host-Origin muss mit `https://` beginnen

## Schritt 2: Einen Host-Control-Client hinzufügen

Lege eine Datei wie diese an:

```txt
src/lib/ws/icaros-host-control-client.ts
```

Aufgabe dieser Datei:

- `PUBLIC_ICAROS_HOST_ORIGIN` lesen
- daraus `wss://<host>/ws/control/main` bauen
- den WebSocket öffnen
- nur `control.orientation` akzeptieren
- `pitch`, `roll`, `quality` an die Experience weitergeben

Beispiel aus diesem Repo:

- [src/lib/ws/icaros-host-control-client.ts](../src/lib/ws/icaros-host-control-client.ts)

## Schritt 3: Optional einen Runtime-Registration-Client hinzufügen

Wenn die Experience im Host auswählbar sein soll, lege zusätzlich an:

```txt
src/lib/ws/icaros-host-runtime-client.ts
```

Aufgabe dieser Datei:

- `wss://<host>/ws/runtime` öffnen
- beim Verbindungsaufbau `client.hello` senden
- danach regelmäßig `client.heartbeat` senden
- die aktuelle Browser-URL als Launch-Ziel registrieren

Beispiel aus diesem Repo:

- [src/lib/ws/icaros-host-runtime-client.ts](../src/lib/ws/icaros-host-runtime-client.ts)

## Schritt 4: Den Host-Control-Client in die VR-Route einbauen

Die VR-Seite der Experience ist meist der richtige Ort für die Integration.

In diesem Repo ist das:

- [src/routes/vr/+page.svelte](../src/routes/vr/+page.svelte)

Du musst dort:

1. den Host-Control-Client importieren
2. optional den Host-Runtime-Client importieren
3. die Host-Origin aus `import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN` lesen
4. beim Mounten den Control-Client starten
5. `pitch` und `roll` auf die vorhandene Eingabelogik mappen
6. beim Unmounten alle Verbindungen sauber schließen

## Schritt 5: `control.orientation` auf die vorhandene Logik mappen

Der Host sendet normierte Daten im Format:

```ts
type ControlOrientation = {
  pitch: number;
  roll: number;
  quality: number;
  controllerType: "m5";
};
```

Bedeutung:

- `pitch` ist bereits auf `-1..1` normiert
- `roll` ist bereits auf `-1..1` normiert
- `quality` ist `0..1`

In der Experience sollst du:

1. bei `quality > 0` die Werte direkt übernehmen
2. bei `quality === 0` neutralisieren, zum Beispiel:

   ```ts
   { pitch: 0, roll: 0 }
   ```

3. die Werte nicht noch einmal gegen rohe Sensorlogik umbauen

## Schritt 6: Optional die lokale Alt-Steuerung als Fallback behalten

Wenn das Projekt schon eine lokale Controller-Strecke hat, kannst du sie als
Fallback behalten.

In diesem Repo ist das bereits berücksichtigt:

- wenn `PUBLIC_ICAROS_HOST_ORIGIN` gesetzt ist, nutzt `/vr` den Host
- wenn `PUBLIC_ICAROS_HOST_ORIGIN` leer ist, nutzt `/vr` weiter das alte lokale
  WebSocket-System

Das ist hilfreich für:

- lokale Entwicklung
- Debugging ohne Host
- schrittweise Migration

## Schritt 7: Die Experience beim Host registrieren

Wenn `PUBLIC_ICAROS_HOST_ORIGIN` gesetzt ist und der Runtime-Client läuft,
registriert sich die Experience automatisch.

Der Runtime-Client sendet:

1. `client.hello` direkt nach dem Verbindungsaufbau
2. `client.heartbeat` alle 4 Sekunden

Dabei wird die aktuelle Browser-URL als Launch-Ziel gemeldet:

```txt
window.location.href
```

Das heißt praktisch:

- wenn du `https://client-lan:5174/vr` öffnest
- dann registriert sich genau diese URL beim Host

## Schritt 8: Die Client-URL wirklich LAN-tauglich machen

Das ist wichtig.

Die Experience darf nicht nur unter `localhost` laufen, wenn sie vom Host oder
von einer Quest gestartet werden soll.

Stattdessen muss die URL etwa so aussehen:

```txt
https://<client-lan-ip-or-name>:5174/vr
```

Das Zertifikat des Client-Projekts muss genau zu dieser Adresse passen.

## Schritt 9: Die Experience im Host auswählen

Wenn alles läuft:

1. Host starten
2. Experience starten
3. im Browser die Experience unter ihrer echten HTTPS-LAN-URL öffnen
4. Host-Konsole öffnen:

   ```txt
   https://<host-lan-ip-or-name>:5183/
   ```

5. prüfen, ob der Client online erscheint
6. diesen Client im Host auswählen

## Schritt 10: Die Launch-Kette testen

Danach:

1. im Browser oder auf der Quest öffnen:

   ```txt
   https://<host-lan-ip-or-name>:5183/launch
   ```

2. der Host sollte `307 Temporary Redirect` auf die Client-URL liefern
3. die Experience sollte laden und ihre Steuerdaten über `control.orientation`
   beziehen

## Dateien, die in diesem Repo konkret hinzugefügt oder geändert wurden

Hinzugefügt:

- [src/lib/ws/icaros-host-control-client.ts](../src/lib/ws/icaros-host-control-client.ts)
- [src/lib/ws/icaros-host-runtime-client.ts](../src/lib/ws/icaros-host-runtime-client.ts)

Geändert:

- [src/routes/vr/+page.svelte](../src/routes/vr/+page.svelte)
- [src/lib/index.ts](../src/lib/index.ts)

## Minimaler Integrationsplan für andere Projekte

Wenn du die kürzeste funktionierende Variante willst, sind das die nötigen
Schritte:

1. `PUBLIC_ICAROS_HOST_ORIGIN` in `.env` anlegen
2. einen Control-Client für `/ws/control/main` hinzufügen
3. die VR-Seite auf diesen Control-Client umstellen
4. `quality === 0` neutral behandeln
5. optional einen Runtime-Client für `/ws/runtime` ergänzen

## Typische Fehler

### Die Experience taucht im Host nicht auf

Prüfe:

- läuft der Runtime-Client überhaupt
- ist `PUBLIC_ICAROS_HOST_ORIGIN` gesetzt
- ist die Experience-URL wirklich `https://...`
- ist die URL vom Host aus erreichbar

### `/launch` öffnet nichts Sinnvolles

Prüfe:

- wurde der konkrete Client im Host ausgewählt
- ist die Experience noch online
- ist die registrierte URL die echte LAN-URL

### Die Experience lädt, bekommt aber keine Steuerdaten

Prüfe:

- ist der Control-Client aktiv
- verbindet er sich mit `wss://<host>/ws/control/main`
- sendet der Host gerade gültige Control-Daten

### Auf der Quest funktioniert es nicht

Prüfe:

- Host und Client laufen beide über HTTPS
- die Zertifikate passen zur echten LAN-Adresse
- die Root-CA wurde auf der Quest vertraut

## Wasserdichter Prompt Für Andere Repos

Diesen Prompt kannst du in ein Coding-Modell geben. Er ist absichtlich konkret
und kleinteilig geschrieben, damit auch schwächere Modelle die Änderungen
sauber ausführen.

```md
Du arbeitest in einem bestehenden SvelteKit- oder Browser-VR-Projekt.

Ziel:
Diese Experience soll an einen externen Icaros Host angebunden werden.
Der Host läuft separat und stellt zwei Browser-Schnittstellen bereit:

- `wss://<host>/ws/control/main` für normierte Steuerdaten
- `wss://<host>/ws/runtime` für optionale Client-Registrierung

Wichtige Regeln:

1. Ändere die bestehende Experience-Architektur so wenig wie möglich.
2. Lösche keine bestehende Rendering-, Szene- oder Experience-Logik.
3. Baue nur die Host-Anbindung ein.
4. Verwende keine direkte M5-Verbindung im Client.
5. Öffne im Client niemals `/ws/device`.
6. Lies im Client nur `control.orientation`.
7. Behandle `quality === 0` als neutralen Zustand.
8. Wenn im Projekt schon ein lokales WebSocket-System existiert, behalte es als Fallback, falls keine Host-Origin gesetzt ist.

Arbeite diese Schritte exakt ab:

Schritt A:
Lege eine neue Datei `src/lib/ws/icaros-host-control-client.ts` an.

Anforderungen an diese Datei:
- Browser-only
- liest `import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN`
- erlaubt optional `hostOrigin` als Parameter
- baut daraus `wss://<host>/ws/control/main`
- verbindet sich per WebSocket
- hat Reconnect mit Backoff
- validiert eingehende Nachrichten
- akzeptiert nur Nachrichten vom Typ `control.orientation`
- gibt ein kleines API zurück:
  - `status`
  - `lastOrientation`
  - `start()`
  - `disconnect()`
  - `onOrientation(listener)`

Die Nutzdaten sollen als Objekt mit diesen Feldern geliefert werden:
- `pitch`
- `roll`
- `quality`
- `controllerType`
- `timestamp`

Schritt B:
Lege eine neue Datei `src/lib/ws/icaros-host-runtime-client.ts` an.

Anforderungen an diese Datei:
- Browser-only
- liest `import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN`
- erlaubt optional `hostOrigin` als Parameter
- verbindet sich mit `wss://<host>/ws/runtime`
- sendet nach dem Öffnen ein `client.hello`
- sendet danach alle 4 Sekunden `client.heartbeat`
- verwendet eine stabile `clientId` aus `localStorage`, mit Fallback `crypto.randomUUID()`
- registriert `window.location.href` als `url`
- stellt ein kleines API bereit:
  - `status`
  - `start()`
  - `disconnect()`
  - `onStationState(listener)`

Schritt C:
Exportiere beide neuen Clients aus dem zentralen `$lib`-Export, falls das Projekt so eine Datei hat.

Schritt D:
Finde die VR-Hauptroute oder die Haupt-Experience-Seite.
Baue dort die Integration ein:

- lies `import.meta.env.PUBLIC_ICAROS_HOST_ORIGIN`
- wenn die Variable gesetzt ist:
  - starte den Host-Control-Client
  - starte den Host-Runtime-Client
  - mappe `control.orientation` auf die bestehende Player-/Input-Logik
  - bei `quality > 0`: übernimm `pitch` und `roll`
  - bei `quality === 0`: setze neutrale Werte
- wenn die Variable nicht gesetzt ist:
  - lasse das bestehende lokale WebSocket- oder Controller-System unverändert weiterlaufen

Schritt E:
Füge keine neuen Routen hinzu.
Ändere keine Experience-IDs oder Manifeste, außer wenn eine stabile `PUBLIC_ICAROS_EXPERIENCE_ID` gebraucht wird.

Schritt F:
Nutze diese Browser-Umgebungsvariablen:

```env
PUBLIC_ICAROS_HOST_ORIGIN=https://<host-lan-ip-or-name>:5183
PUBLIC_ICAROS_EXPERIENCE_ID=neural-flight-vr
```

Schritt G:
Wenn es im Projekt eine VR-Route wie `/vr` gibt, sorge dafür, dass sich genau diese URL beim Host registriert.
Verwende dafür `window.location.href`.

Schritt H:
Achte beim Code auf:
- frühe Returns
- kleine Hilfsfunktionen
- keine `any`
- sauberes Cleanup von WebSockets, Timern und Listenern

Schritt I:
Erzeuge am Ende eine kurze Zusammenfassung:
- welche Dateien neu sind
- welche Dateien geändert wurden
- welche `.env`-Variablen gesetzt werden müssen
- wie man testet, ob der Host den Client sieht

Wichtig:
Arbeite direkt im Code und liefere keine bloße Theorie.
Wenn es im Projekt bereits ein lokales Controller-System gibt, entferne es nicht vollständig, sondern verwende es nur dann weiter, wenn `PUBLIC_ICAROS_HOST_ORIGIN` nicht gesetzt ist.
```

## Empfohlener Testablauf

1. Host starten
2. Client mit gesetzter `PUBLIC_ICAROS_HOST_ORIGIN` starten
3. Client über seine echte HTTPS-LAN-URL öffnen
4. im Host prüfen, ob der Runtime-Client erscheint
5. den Client im Host auswählen
6. `https://<host>:5183/launch` öffnen
7. prüfen, ob die Experience lädt und auf Host-Control reagiert
