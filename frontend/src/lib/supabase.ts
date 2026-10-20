import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Sin .env la app funciona igual, en modo local (localStorage).
export const cloudConfigured = Boolean(url && key)
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
