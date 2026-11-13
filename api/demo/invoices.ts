// Keep the public Demo registration endpoint explicit so Vercel routes
// POST /api/demo/invoices directly, while sharing the same API handler.
// This adds one function (still well below the Hobby 12-function limit).
export { default } from '../_lib/adapter.js'
