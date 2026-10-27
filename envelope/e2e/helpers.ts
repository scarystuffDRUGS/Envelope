import type { Page } from '@playwright/test';

/** Collects console errors and uncaught page errors for the "no console errors" gate. */
export function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/**
 * Loads the app with clean browser storage and waits until the building is placed and the
 * fly-in has finished. `?basemap=none` keeps e2e runs from spending Google root-tile sessions.
 */
export async function openFresh(page: Page): Promise<void> {
  // Each test starts with empty storage; clear what a previous load in the same test saved.
  if (page.url().startsWith('http')) await page.evaluate(() => window.localStorage.clear());
  await page.goto('/?basemap=none');
  await page.getByTestId('panel-ribbon').waitFor();
  await page.waitForFunction(() => {
    const s = (window as unknown as { __envelope?: { getState: () => { buildingPlaced: boolean } } })
      .__envelope;
    return s?.getState().buildingPlaced === true;
  });
  await page.getByTestId('viewport-loading').waitFor({ state: 'detached' });
  // Model results (programme, KPIs, day buttons) must be in before controls are tested.
  await page.waitForFunction(
    () =>
      (window as unknown as { __envelope?: { getState: () => { results: unknown } } }).__envelope?.getState()
        .results != null,
    null,
    { timeout: 60_000 },
  );
  // Fly-in lasts 2 s.
  await page.waitForTimeout(2500);
}

/** Store state without functions, as JSON. */
export function storeSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as unknown as { __envelope?: { getState: () => unknown } }).__envelope;
    if (!store) throw new Error('window.__envelope is not exposed (dev build required)');
    // Skip functions and typed arrays (model grids), which would make the signature huge.
    return JSON.stringify(store.getState(), (_k, v: unknown) =>
      typeof v === 'function' || ArrayBuffer.isView(v) ? undefined : v,
    );
  });
}

/**
 * What a user can see: visible text (tooltips excluded, since hovering always adds one),
 * input values and ARIA state.
 */
export function visibleSignature(page: Page): Promise<string> {
  return page.evaluate(() => {
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('[role="tooltip"]').forEach((el) => el.remove());
    const text = clone.textContent ?? '';
    // Switches and checkboxes show their state by position, not text: read `checked`.
    const inputs = Array.from(document.querySelectorAll('input')).map((i) =>
      i.type === 'checkbox' || i.type === 'radio' ? String(i.checked) : i.value,
    );
    const aria = Array.from(document.querySelectorAll('[aria-pressed],[aria-selected],[aria-expanded]')).map(
      (el) =>
        `${el.getAttribute('aria-pressed')}${el.getAttribute('aria-selected')}${el.getAttribute('aria-expanded')}`,
    );
    // Panel sizes: dragging or stepping a panel edge changes layout, not text (D-032).
    const panels = Array.from(document.querySelectorAll('[data-testid^="panel-"]')).map((el) => {
      const r = el.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    });
    return `${text}\n${inputs.join('|')}\n${aria.join('')}\n${panels.join(',')}`;
  });
}
