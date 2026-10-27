import { expect, test } from '@playwright/test';
import { openFresh, trackConsoleErrors } from './helpers';

test.describe('app shell', () => {
  test('loads every shell region with no console errors', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openFresh(page);
    for (const id of [
      'panel-titlebar',
      'panel-ribbon',
      'panel-left',
      'panel-viewport',
      'panel-inspector',
      'panel-datasheet',
      'panel-statusbar',
    ]) {
      await expect(page.getByTestId(id), id).toBeVisible();
    }
    await expect(page.getByLabel('Envelope', { exact: true })).toHaveText('Envelope');
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });

  test('arrow keys step the hour and the status bar follows', async ({ page }) => {
    await openFresh(page);
    await expect(page.getByTestId('status-hour')).toContainText('14:00 IST');
    await page.locator('body').press('ArrowRight');
    await expect(page.getByTestId('status-hour')).toContainText('15:00 IST');
    await page.locator('body').press('ArrowLeft');
    await page.locator('body').press('ArrowLeft');
    await expect(page.getByTestId('status-hour')).toContainText('13:00 IST');
  });

  test('project name is editable and survives a reload', async ({ page }) => {
    await openFresh(page);
    const name = page.getByTestId('ctl-project-name');
    await name.fill('Sector 65 tower');
    await name.press('Enter');
    await expect(name).toHaveValue('Sector 65 tower');
    // The browser tab always reads "Envelope", whatever the project is called.
    await expect(page).toHaveTitle('Envelope');
    await page.reload();
    await expect(page.getByTestId('ctl-project-name')).toHaveValue('Sector 65 tower');
  });

  test('help dialog opens and closes', async ({ page }) => {
    await openFresh(page);
    await page.getByTestId('ctl-help').click();
    await expect(page.getByTestId('dialog-help')).toBeVisible();
    await page.getByTestId('ctl-help-close').click();
    await expect(page.getByTestId('dialog-help')).toBeHidden();
  });

  test('visual snapshot of the shell', async ({ page }) => {
    await openFresh(page);
    await page.mouse.move(0, 0);
    // The WebGL viewport and the dates derived from today vary between runs.
    await expect(page).toHaveScreenshot('shell.png', {
      mask: [
        page.getByTestId('cesium-container'),
        page.getByTestId('status-hour'),
        page.getByTestId('scale-bar'),
      ],
    });
  });

  test('3D site: building placed, F fits to site, compass resets north', async ({ page }) => {
    await openFresh(page);
    await expect(page.getByTestId('status-basemap')).toHaveText('No basemap');
    await expect(page.getByTestId('status-camera')).toContainText('· 30°');
    await page.getByTestId('ctl-compass').click();
    await expect(page.getByTestId('status-camera')).toContainText('· 0°');
    await page.getByTestId('ctl-zoom-out').click();
    const zoomed = await page.getByTestId('status-camera').textContent();
    await page.locator('body').press('f');
    await expect(page.getByTestId('status-camera')).not.toHaveText(zoomed ?? '');
    await expect(page.getByTestId('status-camera')).toContainText('· 30°');
  });

  test('hover probe shows coordinates near the site', async ({ page }) => {
    await openFresh(page);
    const box = (await page.getByTestId('cesium-container').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByTestId('probe')).toBeVisible();
    await expect(page.getByTestId('status-cursor')).toContainText('28.40');
    await expect(page.getByTestId('status-cursor')).toContainText('77.08');
  });
});
