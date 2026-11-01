/**
 * Per-client rate limit for the notes and comments routes
 *
 * This runs before authentication, so a flood of bad credentials (including junk that would
 * otherwise reach the Firebase Admin SDK) is cut off per client address. It is a ceiling above
 * the per-key and per-user limit of 100 requests per minute in middleware/auth.js, which stays the
 * limit that normal callers meet. The default store is in memory, so the limit applies per
 * function instance, like the one on the /keys routes.
 */

import rateLimit from 'express-rate-limit';

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});
