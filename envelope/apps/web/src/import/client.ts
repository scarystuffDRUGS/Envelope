import type { ImportDraft } from '@envelope/models';
import * as Comlink from 'comlink';
import type { ImportApi } from './worker';

/** File types the import accepts and what happens to each (import plan, phase 1). */
export const FULL_IMPORT = ['ifc'];
export const MESH_IMPORT = ['glb', 'gltf', 'obj'];
/** Closed formats: the dialog shows how to export IFC from the authoring tool instead of an error. */
export const EXPORT_GUIDES: Record<string, { tool: string; steps: string }> = {
  rvt: {
    tool: 'Autodesk Revit',
    steps: 'File → Export → IFC. Choose IFC4 Reference View, then import the .ifc here.',
  },
  pln: {
    tool: 'Graphisoft Archicad',
    steps: 'File → Save As → IFC (.ifc). Use the "General Translator", then import the .ifc here.',
  },
  skp: {
    tool: 'Trimble SketchUp',
    steps:
      'File → Export → 3D Model → IFC (SketchUp Pro). Tag storeys as IfcBuildingStorey, then import the .ifc here.',
  },
  dwg: {
    tool: 'AutoCAD',
    steps:
      'A .dwg is usually a 2D drawing without a 3D building. Export IFC from AutoCAD Architecture (Export → IFC), or from the BIM model the drawings came from.',
  },
};
export const ACCEPT = [...FULL_IMPORT, ...MESH_IMPORT, ...Object.keys(EXPORT_GUIDES)]
  .map((e) => `.${e}`)
  .join(',');

let worker: Worker | null = null;
let remote: Comlink.Remote<ImportApi> | null = null;

/** Parses a model file in the import worker. One file at a time; the worker is reused. */
export async function parseModelFile(file: File): Promise<{ draft: ImportDraft; glb: Uint8Array }> {
  if (!remote) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    remote = Comlink.wrap<ImportApi>(worker);
  }
  const data = await file.arrayBuffer();
  return remote.parse(Comlink.transfer(data, [data]), file.name);
}

/** Stops a parse in progress (closing the dialog); the next parse starts a fresh worker. */
export function cancelParse(): void {
  worker?.terminate();
  worker = null;
  remote = null;
}
