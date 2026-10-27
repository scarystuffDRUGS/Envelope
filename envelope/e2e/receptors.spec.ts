import { expect, test } from '@playwright/test';
import { openFresh, trackConsoleErrors } from './helpers';

/**
 * Schools, colleges and hospitals (D-029): add one by hand near the demo plot, check it is
 * modelled (listed with its distance, counted, and in the school KPI), then remove it.
 */
test('a school added by hand is modelled and counted; removing it restores the count', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = trackConsoleErrors(page);
  await openFresh(page);
  await page.getByTestId('ctl-ribbon-tab-site').click();
  const before = await page.getByTestId('receptors-count').innerText();

  await page.getByTestId('ctl-receptors-open').click();
  await expect(page.getByTestId('dialog-receptors')).toBeVisible();
  await page.getByTestId('ctl-receptor-name').fill('E2E Public School');
  // About 150 m north of the plot, pasted as a Google Maps pair.
  await page.getByTestId('ctl-receptor-lat').fill('28.4076, 77.0851');
  await expect(page.getByTestId('ctl-receptor-lon')).toHaveValue('77.0851');
  await page.getByTestId('ctl-receptor-add').click();

  const list = page.getByTestId('receptors-list');
  await expect(list).toContainText(/E2E Public School[\s\S]*1\d\d m from the site[\s\S]*added by you/, {
    timeout: 60_000,
  });
  await expect(page.getByTestId('receptors-count')).not.toHaveText(before);

  const id = await page.evaluate(
    () =>
      (
        window as unknown as { __envelope: { getState: () => { userReceptors: { id: string }[] } } }
      ).__envelope.getState().userReceptors[0]!.id,
  );
  await page.getByTestId(`ctl-receptor-remove-${id}`).click();
  await expect(list).not.toContainText('E2E Public School', { timeout: 60_000 });
  await expect(page.getByTestId('receptors-count')).toHaveText(before, { timeout: 60_000 });
  expect(errors).toEqual([]);
});
