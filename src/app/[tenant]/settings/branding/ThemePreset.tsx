"use client";

export type ThemePresetDef = {
  name: string;
  primary: string;
  secondary: string;
};

export const THEME_PRESETS: ThemePresetDef[] = [
  { name: "Slate", primary: "#0F172A", secondary: "#3B82F6" },
  { name: "Ocean", primary: "#0E3A8A", secondary: "#06B6D4" },
  { name: "Indigo Wave", primary: "#3730A3", secondary: "#A855F7" },
  { name: "Sunset", primary: "#9A3412", secondary: "#F59E0B" },
  { name: "Forest", primary: "#064E3B", secondary: "#10B981" },
  { name: "Berry", primary: "#831843", secondary: "#EC4899" },
];

export function ThemePreset({ preset }: { preset: ThemePresetDef }) {
  function apply() {
    const p = document.getElementById("primaryColor") as HTMLInputElement | null;
    const s = document.getElementById("secondaryColor") as HTMLInputElement | null;
    if (p) p.value = preset.primary;
    if (s) s.value = preset.secondary;
  }

  return (
    <button
      type="button"
      onClick={apply}
      className="group flex items-center gap-2 rounded-md border border-slate-200 p-2 text-left transition hover:border-slate-300 hover:shadow-sm"
    >
      <span
        className="h-6 w-6 shrink-0 rounded-md"
        style={{
          background: `linear-gradient(135deg, ${preset.primary} 0%, ${preset.secondary} 100%)`,
        }}
      />
      <span className="truncate text-xs font-medium text-slate-700 group-hover:text-slate-900">
        {preset.name}
      </span>
    </button>
  );
}
