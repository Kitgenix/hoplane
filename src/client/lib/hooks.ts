import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { InstanceInfo, Role, Scope } from '../../shared/types';

export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    fnRef
      .current(ctrl.signal)
      .then((d) => {
        if (!ctrl.signal.aborted) {
          setData(d);
          setError(null);
        }
      })
      .catch((e) => !ctrl.signal.aborted && setError(e))
      .finally(() => !ctrl.signal.aborted && setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

export function useInterval(fn: () => void, ms: number | null) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (ms === null) return;
    const id = setInterval(() => document.visibilityState === 'visible' && ref.current(), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function useDebounced<T>(value: T, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export function useLocalStorage<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    },
    [key],
  );
  return [v, set] as const;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  scopes: Scope[];
}

export interface Session {
  me: Me;
  instance: InstanceInfo;
  refresh: () => void;
  can: (scope: Scope) => boolean;
  isAdmin: boolean;
}

export const SessionCtx = createContext<Session | null>(null);
export function useSession() {
  const s = useContext(SessionCtx);
  if (!s) throw new Error('No session');
  return s;
}
