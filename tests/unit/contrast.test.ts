import { describe, expect, it } from "vitest";

/** Ratio de contraste WCAG 2.2 entre deux couleurs hexadécimales. */
function contrastRatio(hexA: string, hexB: string): number {
  const luminanceOf = (hex: string): number => {
    const clean = hex.replace("#", "");
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(clean.slice(i, i + 2), 16) / 255);
    const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [rl, gl, bl] = [r, g, b].map(linearize);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  };
  const [l1, l2] = [luminanceOf(hexA), luminanceOf(hexB)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const light = {
  bg: "#FAFAF7",
  surface: "#FFFFFF",
  text: "#14161A",
  textSecondary: "#5C6068",
  accent: "#5B4BFF",
  accentHover: "#4A3DE0",
  accentInk: "#FFFFFF",
  success: "#0F6E56",
  error: "#B3261E",
  border: "#8E8A82",
};

const dark = {
  bg: "#111214",
  surface: "#1A1B1E",
  text: "#F2F2F0",
  textSecondary: "#9A9C9F",
  accent: "#8A7DFF",
  accentHover: "#7567FF",
  accentInk: "#111214",
  success: "#2FBE9A",
  error: "#FF6B5E",
  border: "#6B6D73",
};

const TEXT_MIN = 4.5;
const UI_MIN = 3;

describe.each([
  { mode: "clair", tokens: light },
  { mode: "sombre", tokens: dark },
])("contraste WCAG 2.2 AA — mode $mode", ({ tokens }) => {
  it.each([
    ["texte / fond", tokens.text, tokens.bg, TEXT_MIN],
    ["texte / surface", tokens.text, tokens.surface, TEXT_MIN],
    ["texte secondaire / fond", tokens.textSecondary, tokens.bg, TEXT_MIN],
    ["texte secondaire / surface", tokens.textSecondary, tokens.surface, TEXT_MIN],
    ["succès / fond", tokens.success, tokens.bg, TEXT_MIN],
    ["succès / surface", tokens.success, tokens.surface, TEXT_MIN],
    ["erreur / fond", tokens.error, tokens.bg, TEXT_MIN],
    ["erreur / surface", tokens.error, tokens.surface, TEXT_MIN],
    ["texte sur accent / accent", tokens.accentInk, tokens.accent, TEXT_MIN],
  ])("texte : %s >= %s:1", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });

  it.each([
    ["accent (bouton) / fond", tokens.accent, tokens.bg, UI_MIN],
    ["accent (bouton) / surface", tokens.accent, tokens.surface, UI_MIN],
    ["accent survol / fond", tokens.accentHover, tokens.bg, UI_MIN],
    ["accent survol / surface", tokens.accentHover, tokens.surface, UI_MIN],
    ["bordure / fond", tokens.border, tokens.bg, UI_MIN],
    ["bordure / surface", tokens.border, tokens.surface, UI_MIN],
    ["anneau de focus (accent) / fond", tokens.accent, tokens.bg, UI_MIN],
    ["anneau de focus (accent) / surface", tokens.accent, tokens.surface, UI_MIN],
  ])("élément d'interface : %s >= %s:1", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
