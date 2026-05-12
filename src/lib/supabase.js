import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function getUserRole(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role, name')
    .eq('user_id', userId)
    .single()
  if (error) return null
  return data
}
