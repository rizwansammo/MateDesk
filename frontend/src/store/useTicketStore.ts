import { create } from 'zustand';
type TicketStatus   = 'open' | 'pending' | 'in_progress' | 'solved' | 'closed';
type TicketPriority = 'low' | 'normal' | 'high' | 'critical';

interface TicketFilters {
  status: TicketStatus | 'all';
  priority: TicketPriority | 'all';
  assigneeId: string | null;
  search: string;
}

interface TicketState {
  activeTicketId: string | null;
  filters: TicketFilters;
  setActiveTicket: (id: string | null) => void;
  setFilter: <K extends keyof TicketFilters>(key: K, value: TicketFilters[K]) => void;
  resetFilters: () => void;
}

const defaultFilters: TicketFilters = {
  status: 'all',
  priority: 'all',
  assigneeId: null,
  search: '',
};

export const useTicketStore = create<TicketState>((set) => ({
  activeTicketId: null,
  filters: defaultFilters,
  setActiveTicket: (id) => set({ activeTicketId: id }),
  setFilter: (key, value) =>
    set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters: () => set({ filters: defaultFilters }),
}));
