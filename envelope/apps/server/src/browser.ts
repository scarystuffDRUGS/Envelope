import type { Browser } from 'playwright-core';
import { onVercel } from './env';

/**
 * Headless Chromium for PDF rendering. Locally: Playwright's own browser (`npx playwright install
 * chromium`). On Vercel: @sparticuz/chromium 153, a Lambda-sized build of the Chromium version
 * Playwright 1.63 drives (playwright-core/browsers.json), unpacked into the temp dir on first use.
 * Both are imported lazily so routes that do not render PDFs never load them.
 */
export async function launchBrowser(): Promise<Browser> {
  if (!onVercel) {
    const { chromium } = await import('playwright');
    return chromium.launch();
  }
  const [{ default: sparticuz }, { chromium }] = await Promise.all([
    import('@sparticuz/chromium'),
    import('playwright-core'),
  ]);
  sparticuz.setGraphicsMode = false; // no WebGL in reports; skips unpacking SwiftShader
  return chromium.launch({
    executablePath: await sparticuz.executablePath(),
    args: sparticuz.args,
    headless: true,
  });
}
