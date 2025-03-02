import { create } from "zustand";

interface ThemeState {
  primary: string;
  variant: "professional" | "tint" | "vibrant";
  appearance: "light" | "dark" | "system";
  radius: number;
}

const useTheme = create<ThemeState>(() => ({
  primary: "212, 100%, 47%", // A nice blue as default
  variant: "professional",
  appearance: "system",
  radius: 0.5
}));

export { useTheme };
