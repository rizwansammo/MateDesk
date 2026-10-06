'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type PublicSignupMode = 'public_trial' | 'private_beta';

interface PublicSignupContextValue {
  signupMode: PublicSignupMode;
  publicRegistrationEnabled: boolean;
  ready: boolean;
}

const PublicSignupContext = createContext<PublicSignupContextValue>({
  signupMode: 'public_trial',
  publicRegistrationEnabled: true,
  ready: false,
});

export function PublicSignupModeProvider({ children }: { children: React.ReactNode }) {
  const [signupMode, setSignupMode] = useState<PublicSignupMode>('public_trial');
  const [publicRegistrationEnabled, setPublicRegistrationEnabled] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;

    fetch('/api/instance/public/', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error('Failed to load public instance configuration.');
        return response.json() as Promise<{
          signup_mode?: PublicSignupMode;
          public_registration_enabled?: boolean;
        }>;
      })
      .then(data => {
        if (!active) return;
        if (data.signup_mode === 'private_beta' || data.signup_mode === 'public_trial') {
          setSignupMode(data.signup_mode);
        }
        if (typeof data.public_registration_enabled === 'boolean') {
          setPublicRegistrationEnabled(data.public_registration_enabled);
        }
      })
      .catch(() => {
        // Safe fallback: keep the existing public-trial presentation. The backend
        // remains authoritative and still blocks registration when Private Beta is active.
      })
      .finally(() => {
        if (active) setReady(true);
      });

    return () => { active = false; };
  }, []);

  const value = useMemo(
    () => ({ signupMode, publicRegistrationEnabled, ready }),
    [signupMode, publicRegistrationEnabled, ready],
  );

  return (
    <PublicSignupContext.Provider value={value}>
      {children}
    </PublicSignupContext.Provider>
  );
}

export function usePublicSignupMode(): PublicSignupContextValue {
  return useContext(PublicSignupContext);
}
