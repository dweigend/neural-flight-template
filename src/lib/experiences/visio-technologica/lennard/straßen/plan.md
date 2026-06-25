# Plan: Straßennetz + Autos

## ✅ Erledigt

### Phase 1 — Grundstruktur

- [x] Unterordner `lennard/straßen/` angelegt
- [x] `road-config.ts` — Konstanten (CAR_COUNT, ROAD_WIDTH, etc.)
- [x] `road-network-types.ts` — TypeScript-Typen (Node, Edge, Graph)
- [x] `road-graph.ts` — Graph-Aufbau aus Tile-Koordinaten (Nachbarschaft in X/Y)
- [x] `road-renderer.ts` — Asphalt-Meshes + Mittelmarkierungen
- [x] `car.ts` — Auto-Entity (Mesh, spawn, update, Bewegung entlang Edges)
- [x] `car-fleet.ts` — Flotten-Manager (erstellen, updaten, disposen)

### Phase 2 — Testseite

- [x] `src/routes/lab/strassen/+page.svelte` erstellt
  - Lädt `VISIO_TECHNOLOGICA_TILE_METADATA` als Demo-Daten
  - Baut Road-Graph auf logischem Grid (STEP = 80)
  - Rendert Straßen + 6 Autos
  - OrbitControls zum Navigieren (Maus)
  - Läuft auf `https://localhost:5173/lab/strassen`

## ⏭️ Nächste Schritte

### Phase 3 — Integration in `scene.ts`

- [ ] `buildRoadGraph()` mit echtem `tilePlacement`-Context füttern
  - `tileWorldStep`, `starterGridAnchor`, `starterWorldAnchor`, `nativeOrigin` aus `setup()` verwenden
  - Dadurch liegen Straßen exakt auf den GLB-Tiles
- [ ] `createCarFleet()` in `setup()` aufrufen, Graph + Gruppen im State speichern
- [ ] `fleet.update()` in `tick()` aufrufen
- [ ] `fleet.dispose()` + `disposeRoadNetwork()` in `dispose()` aufrufen
- [ ] Eventuell: `RuntimeConfig` erweitern (CAR_COUNT, CAR_SPEED als steuerbare Parameter)

### Phase 4 — Eigene 3D-Car-Modelle

- [ ] GLB-Dateien nach `static/models/cars/` kopieren
- [ ] `loadCarModel()` in `car.ts` mit `loadGLTF`
- [ ] Modelle in `setup()` laden und an `createCarFleet()` übergeben

### Phase 5 — Eigene Tile-Daten ("my passport")

- [ ] Tile-Metadaten (center-Koordinaten + Dateinamen) analog `tile-metadata.ts` definieren
- [ ] `road-graph.ts` und Testseite verwenden diese Daten statt Visio-Technologica
- [ ] GLB-Tiles in `static/` ablegen

### Phase 6 — Performance (Quest 72fps)

- [ ] Cars auf `InstancedMesh` umstellen (alle gleichen Autos)
- [ ] Road-Segmente zu langen Bändern zusammenfassen
- [ ] LOD: entfernte Straßen nur als Linie rendern
- [ ] Car-Pooling (max 10 gleichzeitig)

## Bekannte Probleme

- `three-mesh-bvh` fehlt als Dependency → Fehler in `visio-technologica-city-test` (pre-existing)
- `svelte-check` findet 5 Fehler, alle in `city-test/scene.ts` (nicht von uns)
- Dev-Server benötigt HTTPS: `mkcert localhost` im Projekt-Root ausführen
