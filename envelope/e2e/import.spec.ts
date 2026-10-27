import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';
import { openFresh, trackConsoleErrors } from './helpers';

/**
 * Import flow (D-027): upload the hand-built IFC, check the values read from it, place it at the
 * demo site (so the committed snapshot serves the data offline), and check the models rerun from
 * the imported building. Reset returns to the demo building. No report export here: it would call
 * the LLM on every run.
 */
const SAMPLE = fileURLToPath(new URL('../fixtures/import/synthetic-block.ifc', import.meta.url));

const state = <T>(page: Page, pick: string) =>
  page.evaluate((p) => {
    const s = (
      window as unknown as { __envelope: { getState: () => Record<string, unknown> } }
    ).__envelope.getState();
    return p.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown> | null)?.[k], s);
  }, pick) as Promise<T>;

test('imports an IFC, places it and the models follow; reset restores the demo', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = trackConsoleErrors(page);
  await openFresh(page);
  await page.getByTestId('ctl-ribbon-tab-project').click();
  await page.getByTestId('ctl-import-open').click();
  await expect(page.getByTestId('dialog-import')).toBeVisible();

  await page.getByTestId('ctl-import-file').setInputFiles(SAMPLE);
  await expect(page.getByTestId('import-file-summary')).toContainText('concrete 160 m³');
  await expect(page.getByTestId('ctl-import-floors')).toHaveValue('3');
  await expect(page.getByTestId('ctl-import-height')).toHaveValue('3.50');
  await expect(page.getByTestId('ctl-import-lat')).toHaveValue('18.520000');

  // Place at the demo plot instead (pasted Google Maps pair), so the run stays offline.
  await page.getByTestId('ctl-import-lat').fill('28.4060, 77.0850');
  await expect(page.getByTestId('ctl-import-lon')).toHaveValue('77.085');
  await page.getByTestId('ctl-import-label').fill('E2E plot');
  await expect(page.getByTestId('import-facts')).toContainText('Footprint 200 m²');
  await page.getByTestId('ctl-import-place').click();
  await expect(page.getByTestId('dialog-import')).toBeHidden();

  await page.waitForFunction(
    () => {
      const s = (
        window as unknown as { __envelope: { getState: () => { results: unknown; buildingPlaced: boolean } } }
      ).__envelope.getState();
      return s.results != null && s.buildingPlaced;
    },
    null,
    { timeout: 60_000 },
  );
  expect(await state<string>(page, 'building.name')).toBe('Synthetic office block');
  expect(await state<number>(page, 'results.baseline.quantities.concreteM3')).toBe(160);
  expect(await state<number>(page, 'assumptions.basements')).toBe(1);
  await expect(page.getByTestId('kpi-table')).toContainText('PM10');
  await expect(page.getByText('synthetic-block.ifc').first()).toBeVisible();

  // Reset to the demo building from the dialog.
  await page.getByTestId('ctl-import-open').click();
  await page.getByTestId('ctl-import-reset').click();
  await page.waitForFunction(
    () =>
      (
        window as unknown as { __envelope: { getState: () => { building: { name: string } } } }
      ).__envelope.getState().building.name === 'Office tower (demo)',
  );
  expect(await state<number | undefined>(page, 'assumptions.basements')).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a Revit file shows the export-to-IFC guide instead of an error', async ({ page }) => {
  await openFresh(page);
  await page.getByTestId('ctl-ribbon-tab-project').click();
  await page.getByTestId('ctl-import-open').click();
  await page
    .getByTestId('ctl-import-file')
    .setInputFiles({ name: 'tower.rvt', mimeType: 'application/octet-stream', buffer: Buffer.from('RVT') });
  await expect(page.getByTestId('import-guide')).toContainText('Autodesk Revit');
  await expect(page.getByTestId('ctl-import-place')).toBeDisabled();
});

test('a mesh fills the floor height from the model and flags a typed height that differs', async ({
  page,
}) => {
  await openFresh(page);
  await page.getByTestId('ctl-ribbon-tab-project').click();
  await page.getByTestId('ctl-import-open').click();
  // 10 m × 8 m block, 7.3 m tall, on a paving slab that sits below y = 0.
  const v = (x: number, y: number, z: number) => `v ${x} ${y} ${z}`;
  const box = (a: number[], b: number[], o: number) =>
    [
      v(a[0]!, a[1]!, a[2]!),
      v(b[0]!, a[1]!, a[2]!),
      v(b[0]!, a[1]!, b[2]!),
      v(a[0]!, a[1]!, b[2]!),
      v(a[0]!, b[1]!, a[2]!),
      v(b[0]!, b[1]!, a[2]!),
      v(b[0]!, b[1]!, b[2]!),
      v(a[0]!, b[1]!, b[2]!),
      ...[
        [1, 2, 3, 4],
        [5, 6, 7, 8],
        [1, 2, 6, 5],
        [2, 3, 7, 6],
        [3, 4, 8, 7],
        [4, 1, 5, 8],
      ].map((f) => `f ${f.map((i) => i + o).join(' ')}`),
    ].join('\n');
  const obj = `${box([-5, 0, -4], [5, 7.3, 4], 0)}\n${box([-6.7, -1.3, -5.7], [6.7, -0.05, 5.7], 8)}`;
  await page
    .getByTestId('ctl-import-file')
    .setInputFiles({ name: 'shop.obj', mimeType: 'text/plain', buffer: Buffer.from(obj) });
  await expect(page.getByTestId('import-model-height')).toContainText('7.3 m');
  await page.getByTestId('ctl-import-floors').fill('2');
  await expect(page.getByTestId('ctl-import-height')).toHaveValue('3.65');
  await expect(page.getByTestId('import-facts')).toContainText('Footprint 80 m²');
  await page.getByTestId('ctl-import-height').fill('5');
  await expect(page.getByTestId('import-height-mismatch')).toContainText('10.0 m, but the model is 7.3 m');
  await page.getByTestId('ctl-import-use-model-height').click();
  await expect(page.getByTestId('ctl-import-height')).toHaveValue('3.65');
  await expect(page.getByTestId('import-height-mismatch')).toHaveCount(0);

  // Fields that cannot be negative drop a typed minus sign.
  await page.getByTestId('ctl-import-buffer').fill('-20');
  await expect(page.getByTestId('ctl-import-buffer')).toHaveValue('20');

  // Rotation: typed degrees wrap to 0–359; quarter turns step by 90.
  await page.getByTestId('ctl-import-rotation-deg').fill('450');
  await expect(page.getByText('Rotation: 90° clockwise')).toBeVisible();
  await page.getByTestId('ctl-import-rotate-ccw').click();
  await page.getByTestId('ctl-import-rotate-ccw').click();
  await expect(page.getByText('Rotation: 270° clockwise')).toBeVisible();

  // Full screen fills the window; the form and preview start at half each and resize by keyboard.
  await page.getByTestId('ctl-import-fullscreen').click();
  const vp = page.viewportSize()!;
  await expect(page.getByTestId('dialog-import')).toHaveCSS('width', `${vp.width}px`);
  const split = page.getByTestId('ctl-import-split');
  await expect(split).toHaveAttribute('aria-valuenow', '50');
  await split.focus();
  await page.keyboard.press('Home');
  await expect(split).toHaveAttribute('aria-valuenow', '30');
});
