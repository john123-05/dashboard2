import { useCallback, useEffect, useRef, useState } from 'react';

export function useCopyToClipboard(resetAfterMs = 2000) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (id: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
      setCopiedId(id);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopiedId(null), resetAfterMs);
    },
    [resetAfterMs],
  );

  return { copiedId, copy };
}
