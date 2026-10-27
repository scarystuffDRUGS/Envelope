import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { loadImportedModel } from './persist';

/** After a reload, shows the imported building's mesh again (the spec comes back from localStorage). */
export function useRestoreImport(): void {
  useEffect(() => {
    if (useAppStore.getState().buildingSource.kind === 'demo') return;
    let cancelled = false;
    void loadImportedModel().then((blob) => {
      if (cancelled || !blob || useAppStore.getState().buildingSource.kind === 'demo') return;
      useAppStore.getState().setModelUrl(URL.createObjectURL(blob));
    });
    return () => {
      cancelled = true;
    };
  }, []);
}
