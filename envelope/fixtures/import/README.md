# Import test models

| File | What it is | Expected (hand-checked) |
|---|---|---|
| `synthetic-block.ifc` | Hand-written IFC4, lengths in millimetres. Basement at −3.0 m; ground, first and second floors at 0, 3.5 and 7.0 m; a "Roof" level at 10.5 m; one 20 m × 10 m × 200 mm slab per storey below the roof; three 1,500 × 1,200 mm windows (two on the south face, one on the north); NetVolume 40 m³ per slab; site 18° 31′ 12″ N, 73° 51′ 36″ E (Pune); TrueNorth (−0.5, 0.866). | 3 floors at 3.5 m, 1 basement 3.0 m, footprint 200 m², windows 3.6 m² south and 1.8 m² north, concrete 160 m³, site 18.52, 73.86, true north 30° |

Used by `apps/web/src/import/ifc.test.ts` (unit) and `e2e/import.spec.ts`. A real export from your own Revit or
Archicad model is the best second sample, since it is what judges will see; KIT's FZK-Haus is a widely used open
alternative.
