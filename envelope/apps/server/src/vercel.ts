/**
 * Vercel function entry (Build Output API, scripts/build-vercel.mjs). Vercel's Node launcher
 * calls the default export with Node's (req, res); the rewrite to /api/index keeps the original
 * request path, so the Hono routes match as they do locally.
 */
import { getRequestListener } from '@hono/node-server';
import { app } from './app';

export default getRequestListener(app.fetch);
