"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

type NeuxusAuthState = {
  /** neuxus service token. */
  token: string | null;
  setToken: (token: string | null) => void;
  clear: () => void;
};

export const useNeuxusAuthStore = create<NeuxusAuthState>()(
  persist(
    (set) => ({
      token: null,
      setToken: (token) => set({ token }),
      clear: () => set({ token: null }),
    }),
    {
      name: "neuxus-auth",
      partialize: (state) => ({ token: state.token }),
    },
  ),
);
