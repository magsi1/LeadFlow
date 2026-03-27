/**
 * LeadFlow backend entry (JavaScript).
 *
 * Run `npm run build` first so `dist/` exists.
 * Railway / Node: `node server.js` or `npm start`
 *
 * Routes (after deploy):
 *   GET  /leads?user_id=<uuid>       — list (normalized fields)
 *   GET  /api/leads?user_id=<uuid>   — same handler
 */
import './dist/index.js';
