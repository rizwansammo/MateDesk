'use client';

import { useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import { useLogoSizeStore, BrandingConfig } from '@/store/useLogoSizeStore';
import { apiFetch } from '@/lib/api';

export function BrandingSync() {
  const accessToken      = useAuthStore((s) => s.accessToken);
  const initFromBranding = useLogoSizeStore((s) => s.initFromBranding);

  useEffect(() => {
    if (!accessToken) return;
    apiFetch<BrandingConfig>('/api/tenant/branding/', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((cfg) => initFromBranding(cfg))
      .catch(() => { /* keep localStorage defaults on error */ });
  }, [accessToken, initFromBranding]);

  return null;
}
