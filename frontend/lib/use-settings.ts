"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSettings, updateSettings } from "@/lib/api";
import { createDefaultSettings } from "@/lib/settings";
import type { Settings } from "@/lib/types";

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() =>
    createDefaultSettings()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let mounted = true;

    void fetchSettings()
      .then((loaded) => {
        if (mounted) {
          setSettings(loaded);
        }
      })
      .catch(() => {
        // Keep default settings if request fails.
      })
      .finally(() => {
        if (mounted) {
          setIsLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const save = useCallback(async (next: Settings) => {
    setIsSaving(true);
    try {
      const saved = await updateSettings(next);
      setSettings(saved);
      return saved;
    } finally {
      setIsSaving(false);
    }
  }, []);

  return { settings, setSettings, isLoading, isSaving, save };
}
