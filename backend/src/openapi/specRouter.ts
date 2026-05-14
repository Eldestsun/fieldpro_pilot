import { Router, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

export const specRouter = Router();

// Committed spec is at backend/openapi/openapi.json.
// Regenerate with: pnpm run openapi:generate
const SPEC_PATH = path.join(__dirname, '../../openapi/openapi.json');

/**
 * GET /api/openapi.json
 * Serves the committed OpenAPI 3.0 spec. Public — the spec describes the
 * surface, not the data.
 */
specRouter.get('/openapi.json', (_req: Request, res: Response) => {
  if (!fs.existsSync(SPEC_PATH)) {
    return res.status(404).json({
      error: 'OpenAPI spec not yet generated. Run: pnpm run openapi:generate',
    });
  }
  try {
    const spec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json(spec);
  } catch {
    return res.status(500).json({ error: 'Failed to read OpenAPI spec' });
  }
});
