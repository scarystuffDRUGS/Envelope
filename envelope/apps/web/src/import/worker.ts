/**
 * Import worker: parses an uploaded model in the browser (D-027: no upload, no size limit on
 * Vercel, the model never leaves the user's machine) and returns the draft and a .glb.
 */
import type { ImportDraft } from '@envelope/models';
import * as Comlink from 'comlink';
import wasmUrl from 'web-ifc/web-ifc.wasm?url';
import { writeGlb } from './mesh';

const api = {
  async parse(data: ArrayBuffer, fileName: string): Promise<{ draft: ImportDraft; glb: Uint8Array }> {
    const ext = fileName.toLowerCase().split('.').pop() ?? '';
    const bytes = new Uint8Array(data);
    let parsed;
    if (ext === 'ifc') {
      const head = new TextDecoder().decode(bytes.slice(0, 64));
      if (!head.startsWith('ISO-10303-21;'))
        throw new Error('This is not an IFC file (it does not start with ISO-10303-21;).');
      const [{ IfcAPI }, { parseIfc }] = await Promise.all([import('web-ifc'), import('./ifc')]);
      const ifc = new IfcAPI();
      // Single-threaded build: the multi-threaded one needs cross-origin isolation headers.
      await ifc.Init(() => wasmUrl, true);
      parsed = await parseIfc(ifc, bytes, fileName);
      ifc.Dispose();
    } else {
      const { parseMeshFile } = await import('./meshFile');
      parsed = await parseMeshFile(bytes, fileName);
    }
    const glb = await writeGlb(parsed.parts);
    return Comlink.transfer({ draft: parsed.draft, glb }, [glb.buffer as ArrayBuffer]);
  },
};

export type ImportApi = typeof api;
Comlink.expose(api);
