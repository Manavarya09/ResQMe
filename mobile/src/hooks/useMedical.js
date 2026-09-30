import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { getJSON, setJSON } from '../lib/storage';

const KEY = 'resqme.medical';
let shared = null; // in-memory copy so every screen sees the latest after an edit
const subs = new Set();

function publish(m) {
  shared = m;
  subs.forEach((fn) => fn(m));
}

// Medical ID with an encrypted-at-rest server copy and an on-device cache (readable offline).
export function useMedical() {
  const [medical, setMedical] = useState(shared);
  const [loading, setLoading] = useState(!shared);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const m = await api.getMedical();
      publish(m);
      setJSON(KEY, m);
      setError(null);
    } catch (e) {
      setError(e.message);
      if (!shared) publish(await getJSON(KEY));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    subs.add(setMedical);
    refresh();
    return () => subs.delete(setMedical);
  }, [refresh]);

  const save = useCallback(async (data) => {
    const saved = await api.saveMedical(data);
    publish(saved);
    await setJSON(KEY, saved);
    return saved;
  }, []);

  return { medical, loading, error, refresh, save };
}
