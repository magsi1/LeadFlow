import { create } from "zustand";
import type { AnalyticsDashboard, FollowUpItem, LeadDto } from "../types/models";

type AppState = {
  leads: LeadDto[];
  followUps: FollowUpItem[];
  analytics: AnalyticsDashboard | null;
  /** Increment after lead mutations so pipeline/dashboard can refetch counts. */
  leadsDataRevision: number;
  setLeads: (leads: LeadDto[]) => void;
  setFollowUps: (followUps: FollowUpItem[]) => void;
  setAnalytics: (analytics: AnalyticsDashboard | null) => void;
  bumpLeadsDataRevision: () => void;
};

export const useAppStore = create<AppState>((set) => ({
  leads: [],
  followUps: [],
  analytics: null,
  leadsDataRevision: 0,
  setLeads: (leads) => set({ leads }),
  setFollowUps: (followUps) => set({ followUps }),
  setAnalytics: (analytics) => set({ analytics }),
  bumpLeadsDataRevision: () => set((s) => ({ leadsDataRevision: s.leadsDataRevision + 1 })),
}));
