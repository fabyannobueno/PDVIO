import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
export const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

const PROJECT_REF = (() => {
  try {
    return new URL(SUPABASE_URL).hostname.split('.')[0];
  } catch {
    return 'default';
  }
})();

const PROJECT_KEY = '__supabase_project_ref';
if (typeof window !== 'undefined') {
  try {
    const stored = localStorage.getItem(PROJECT_KEY);
    if (stored && stored !== PROJECT_REF) {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith('sb-') || k.includes('supabase')) {
          localStorage.removeItem(k);
        }
      });
    }
    localStorage.setItem(PROJECT_KEY, PROJECT_REF);
  } catch {
  }
}

const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_KEY = 'placeholder-anon-key';

export const supabase = createClient<Database>(
  SUPABASE_URL || FALLBACK_URL,
  SUPABASE_PUBLISHABLE_KEY || FALLBACK_KEY,
  {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      storageKey: `sb-${PROJECT_REF}-auth-token`,
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);
