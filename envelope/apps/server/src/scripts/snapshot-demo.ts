// Refreshes fixtures/demo/{weather,airQuality,osm}.json from the live APIs for the demo site.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { repoRoot } from '../env';
import { getSiteData } from '../siteData';

const spec = JSON.parse(readFileSync(resolve(repoRoot, 'fixtures/demo/building.json'), 'utf8')) as {
  site: { lat: number; lon: number };
};
const year = new Date().getUTCFullYear() - 1;
const data = await getSiteData(spec.site.lat, spec.site.lon, year, { refresh: true });
for (const [k, p] of Object.entries(data.provenance)) console.log(`${k}: ${p.status} ${p.fetchedAt ?? ''}`);
const failed = Object.values(data.provenance).filter((p) => p.status !== 'live');
process.exit(failed.length ? 1 : 0);
