"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type ActiveUserState = {
  activeUserId: string | null;
  /** Current chat session for the signed-in user (ask mode). */
  activeSessionId: string | null;
  setActiveUserId: (id: string | null) => void;
  setActiveSessionId: (id: string | null) => void;
};

export const useActiveUserStore = create<ActiveUserState>()(
  persist(
    (set) => ({
      activeUserId: null,
      activeSessionId: null,
      setActiveUserId: (id) => set({ activeUserId: id, activeSessionId: null }),
      setActiveSessionId: (id) => set({ activeSessionId: id }),
    }),
    {
      name: "neuxus-active-user",
      partialize: (state) => ({
        activeUserId: state.activeUserId,
        activeSessionId: state.activeSessionId,
      }),
    },
  ),
);
