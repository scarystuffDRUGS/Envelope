import { expect, test } from '@playwright/test';
import { openFresh } from './helpers';

/**
 * Responsive layout (D-028): below 1,760 px the Inspector becomes the Indicators dropdown, below
 * 1,440 px Layers does too, and the map takes the width they leave.
 */
test.describe('compact layout (125% zoom on a 1920 px screen)', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('Indicators dropdown opens over the map, scrolls, and closes with Escape', async ({ page }) => {
    await openFresh(page);
    await expect(page.getByTestId('panel-inspector')).toBeHidden();
    await expect(page.getByTestId('panel-left')).toBeVisible();
    const map = await page.getByTestId('panel-viewport').boundingBox();
    expect(map!.width).toBeGreaterThan(1050);
    // The workspace bar spans the full width above the panels and wraps rather than scrolls (D-032).
    const bar = await page.getByTestId('ribbon-body').evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(bar).toBe(0);
    const barBox = await page.getByTestId('ribbon-body').boundingBox();
    const left = await page.getByTestId('panel-left').boundingBox();
    expect(barBox!.x).toBeLessThanOrEqual(left!.x);
    expect(left!.y).toBeCloseTo(map!.y, 0);

    await page.getByTestId('ctl-inspector-toggle').click();
    // Hovering the toggle shows its tooltip; Escape must still close the dropdown.
    await page.getByTestId('ctl-inspector-toggle').hover();
    await page.waitForTimeout(800);
    await expect(page.getByTestId('sheet-inspector')).toBeVisible();
    await expect(page.getByTestId('ctl-show-baseline')).toBeVisible();
    const scroll = await page
      .getByTestId('panel-inspector')
      .evaluate((el) => [el.scrollHeight, el.clientHeight] as const);
    expect(scroll[0]).toBeGreaterThan(scroll[1]);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('sheet-inspector')).toBeHidden();
  });
});

test.describe('narrow layout (small laptop)', () => {
  test.use({ viewport: { width: 1366, height: 700 } });

  test('Layers dropdown toggles with L', async ({ page }) => {
    await openFresh(page);
    await expect(page.getByTestId('panel-left')).toBeHidden();
    await page.keyboard.press('l');
    await expect(page.getByTestId('sheet-layers')).toBeVisible();
    await expect(page.getByTestId('ctl-layer-dust')).toBeVisible();
    await page.getByTestId('ctl-layers-toggle').click();
    await expect(page.getByTestId('sheet-layers')).toBeHidden();
  });
});

test.describe('wide layout', () => {
  test.use({ viewport: { width: 1920, height: 1000 } });

  test('dragging the Layers edge widens the panel, narrows the map; double-click resets', async ({
    page,
  }) => {
    await openFresh(page);
    const handle = page.getByTestId('ctl-resize-layers');
    const before = (await page.getByTestId('panel-viewport').boundingBox())!.width;
    const h = (await handle.boundingBox())!;
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    await page.mouse.move(h.x + h.width / 2 + 120, h.y + h.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByTestId('panel-left')).toHaveCSS('width', '432px');
    expect((await page.getByTestId('panel-viewport').boundingBox())!.width).toBeCloseTo(before - 120, 0);
    expect(await page.evaluate(() => localStorage.getItem('envelope.panelWidths'))).toContain('"layers":432');
    await handle.dblclick();
    await expect(page.getByTestId('panel-left')).toHaveCSS('width', '312px');
    // Keyboard: the Inspector edge steps 16 px per arrow, leftwards widens it.
    await page.getByTestId('ctl-resize-inspector').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('panel-inspector')).toHaveCSS('width', '384px');
  });
});
