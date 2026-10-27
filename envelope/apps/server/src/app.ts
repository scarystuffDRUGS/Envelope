import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { env } from './env';
import type { ReportImages, ReportPayload } from '@envelope/report';
import { geocode } from './geocode';
import { ragStatus } from './rag';
import { RateLimiter, clientIp } from './rateLimit';
import { buildReport } from './report';
import { getSiteData } from './siteData';

export const app = new Hono();

const reportLimiter = new RateLimiter(env.reportLimit, env.reportWindowMs);
const siteDataLimiter = new RateLimiter(env.siteDataLimit, env.reportWindowMs);
const geocodeLimiter = new RateLimiter(20, env.reportWindowMs);
const tooMany = (retryAfterS: number) =>
  new Response(JSON.stringify({ error: 'rate_limited', retryAfterS }), {
    status: 429,
    headers: { 'Content-Type': 'application/json', 'Retry-After': String(retryAfterS) },
  });

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'envelope-server',
    time: new Date().toISOString(),
    keys: {
      // Presence only. Never return key values except the ion token in /api/config.
      cesiumIon: Boolean(env.cesiumIonToken),
      googleMaps: Boolean(env.googleMapsApiKey),
      gemini: Boolean(env.geminiApiKey),
      groq: Boolean(env.groqApiKey),
      openAq: Boolean(env.openAqApiKey),
    },
    // Report reference corpus (D-036): 0 documents means reports carry no citations.
    rag: ragStatus(),
  }),
);

/**
 * Runtime client config. The Cesium ion token is the one credential the browser needs
 * (Cesium streams tiles directly). It is URL-restricted and asset-scoped on ion, and is
 * served here at runtime so it is never bundled or committed. See docs/DECISIONS.md D-011.
 */
app.get('/api/config', (c) =>
  c.json({
    cesiumIonToken: env.cesiumIonToken ?? null,
  }),
);

/** Site data for the models: weather (ERA5), air quality (CAMS) and OSM, with provenance per source. */
app.get('/api/site-data', async (c) => {
  const lat = Number(c.req.query('lat'));
  const lon = Number(c.req.query('lon'));
  const year = Number(c.req.query('year'));
  const thisYear = new Date().getUTCFullYear();
  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    !Number.isInteger(year) ||
    Math.abs(lat) > 90 ||
    Math.abs(lon) > 180 ||
    year < 2015 ||
    year >= thisYear
  ) {
    return c.json({ error: 'lat, lon and a past year (2015 or later) are required' }, 400);
  }
  const wait = env.rateLimits ? siteDataLimiter.take(clientIp(c.req.raw.headers)) : 0;
  if (wait) return tooMany(wait);
  const data = await getSiteData(lat, lon, year, {
    offline: c.req.query('offline') === '1',
    refresh: c.req.query('refresh') === '1',
  });
  return c.json(data);
});

/**
 * Builds the assessment report: narrative (LLM or template) → number validator → HTML → PDF.
 * The PDF is the response body and narrative details travel in headers, because serverless
 * instances keep no files between requests. Request bodies (payload and map snapshots) are
 * capped below Vercel's 4.5 MB function limit.
 */
app.post(
  '/api/report',
  bodyLimit({
    maxSize: 4 * 1024 * 1024,
    onError: (c) => c.json({ error: 'payload_too_large' }, 413),
  }),
  async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      payload?: ReportPayload;
      images?: ReportImages;
    };
    if (!body.payload?.meta || !Array.isArray(body.payload.tables))
      return c.json({ error: 'payload is required' }, 400);
    const wait = env.rateLimits ? reportLimiter.take(clientIp(c.req.raw.headers)) : 0;
    if (wait) return tooMany(wait);
    const r = await buildReport(body.payload, body.images ?? {});
    return new Response(new Uint8Array(r.pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="Envelope-assessment-report.pdf"',
        'Cache-Control': 'no-store',
        'X-Narrative-Source': encodeURIComponent(r.narrativeSource),
        'X-Narrative-Dropped': String(r.dropped),
        'X-Narrative-Retried': String(r.retried),
        'X-Narrative-References': String(r.references),
      },
    });
  },
);

/** Address search on the OpenStreetMap basemap (import dialog). Searches run on Enter only. */
app.get('/api/geocode', async (c) => {
  const q = c.req.query('q')?.trim() ?? '';
  if (q.length < 3) return c.json({ error: 'q must have at least 3 characters' }, 400);
  const wait = env.rateLimits ? geocodeLimiter.take(clientIp(c.req.raw.headers)) : 0;
  if (wait) return tooMany(wait);
  try {
    return c.json({ results: await geocode(q), attribution: '© OpenStreetMap contributors (Nominatim)' });
  } catch (err) {
    console.warn('[geocode]', (err as Error).message);
    return c.json({ error: 'geocoder_unavailable' }, 502);
  }
});

app.notFound((c) => c.json({ error: 'not_found' }, 404));
app.onError((err, c) => {
  console.error('[server]', err.message);
  return c.json({ error: 'internal_error' }, 500);
});
