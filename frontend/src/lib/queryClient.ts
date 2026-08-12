import { QueryClient } from '@tanstack/react-query';

/**
 * Single app-wide React Query client.
 *
 * Exported as a module singleton so non-React code (e.g. the auth store's
 * clearAuthState) can call queryClient.clear() on logout. Clearing on logout
 * prevents one user's cached server data (tickets, notifications, …) from
 * briefly showing to the next user who signs in on the same browser.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
    },
  },
});
