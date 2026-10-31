/**
 * Icônes et illustrations SVG maison. Les formes sont volontairement abstraites et
 * simples ; voir context.md > Décisions pour la note "à remplacer" par de vraies
 * photos libres de droits.
 */

export function scissorsIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <circle cx="6" cy="6" r="2.3" />
    <circle cx="6" cy="18" r="2.3" />
    <path d="M8 7.5 19 17" />
    <path d="M8 16.5 19 7" />
  </svg>`;
}

export type SubjectShape = "circle" | "square" | "triangle" | "hexagon";

/** Un sujet très simple (forme géométrique), rempli en `currentColor`. */
function subjectPath(shape: SubjectShape): string {
  switch (shape) {
    case "circle":
      return `<circle cx="100" cy="100" r="58" />`;
    case "square":
      return `<rect x="46" y="46" width="108" height="108" rx="18" />`;
    case "triangle":
      return `<path d="M100 36 164 158 36 158Z" stroke-linejoin="round" />`;
    case "hexagon":
      return `<path d="M100 34 160 68 160 132 100 166 40 132 40 68Z" stroke-linejoin="round" />`;
  }
}

/** Sujet sur fond plein coloré — état "avant". */
export function subjectOnBackgroundMarkup(shape: SubjectShape, bg: string, fg: string): string {
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
    <rect width="200" height="200" fill="${bg}" />
    <g fill="${fg}" stroke="${fg}" stroke-width="2">${subjectPath(shape)}</g>
  </svg>`;
}

/** Sujet seul, sans fond — état "après" (posé sur le damier via CSS). */
export function subjectCutoutMarkup(shape: SubjectShape, fg: string): string {
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
    <g fill="${fg}" stroke="${fg}" stroke-width="2">${subjectPath(shape)}</g>
  </svg>`;
}
