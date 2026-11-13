// Keep invoice-link reads explicit so Vercel routes /api/invoices/:id directly.
// The shared handler still validates the ID and loads the invoice metadata.
export { default } from '../_lib/adapter.js'
