import { create } from 'zustand';

interface AppUser {
  id: string;
  name: string;
  email: string;
  role: 'owner' | 'manager' | 'agent';
  avatarInitials: string;
}

interface AppTenant {
  id: string;
  slug: string;
  name: string;
  plan: 'starter' | 'professional' | 'enterprise';
}

interface AppState {
  tenant: AppTenant;
  user: AppUser;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  tenant: {
    id: 'tenant-001',
    slug: 'acmemsp',
    name: 'Acme Managed Services',
    plan: 'professional',
  },
  user: {
    id: 'user-001',
    name: 'Alex Martinez',
    email: 'alex@acmemsp.com',
    role: 'owner',
    avatarInitials: 'AM',
  },
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
