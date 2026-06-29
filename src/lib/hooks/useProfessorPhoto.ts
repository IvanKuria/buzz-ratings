import { useEffect, useState } from 'react';
import { resolveProfessorPhoto } from '@/lib/photo';

/**
 * Resolves a professor headshot URL (best-effort, cached). Returns null while
 * loading or when no photo is found, so the caller can fall back to initials.
 */
export function useProfessorPhoto(
  name: string | null,
  email: string | null,
  department: string | null
): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (!name) return;

    resolveProfessorPhoto({ name, email, department })
      .then((resolved) => {
        if (!cancelled) setUrl(resolved);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [name, email, department]);

  return url;
}
