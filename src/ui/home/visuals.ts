/**
 * Icônes et illustrations SVG maison. Les formes restent volontairement abstraites et
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

export function globeIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3c2.8 2.6 4.2 5.7 4.2 9s-1.4 6.4-4.2 9c-2.8-2.6-4.2-5.7-4.2-9s1.4-6.4 4.2-9Z" />
  </svg>`;
}

export function chevronDownIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M6 9.5 12 15 18 9.5" />
  </svg>`;
}

export function uploadArrowIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 16V4" />
    <path d="M6.5 9.5 12 4l5.5 5.5" />
    <path d="M4.5 16v2.5A2 2 0 0 0 6.5 20.5h11a2 2 0 0 0 2-2V16" />
  </svg>`;
}

export function lockIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
  </svg>`;
}

export function dragHandleIconMarkup(): string {
  return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
    <path d="M8 8 4 12l4 4" />
    <path d="M16 8l4 4-4 4" />
    <path d="M4 12h16" />
  </svg>`;
}

/** Fond "détaillé" (texture) utilisé côté "avant" pour contraster avec le damier côté "après". */
function detailedBackgroundMarkup(bg: string, fg: string): string {
  return `<rect width="200" height="200" fill="${bg}" />
    <g stroke="${fg}" stroke-width="3" stroke-linecap="round" opacity="0.3">
      <path d="M-10 26 210 10" />
      <path d="M-10 62 210 48" />
      <path d="M-10 108 210 122" />
      <path d="M-10 150 210 138" />
      <path d="M-10 186 210 198" />
    </g>
    <g fill="${fg}" opacity="0.2">
      <circle cx="28" cy="156" r="16" />
      <circle cx="174" cy="42" r="11" />
      <circle cx="156" cy="178" r="7" />
    </g>`;
}

/** Silhouette tête/épaules avec de fines mèches de cheveux qui dépassent du contour. */
function personSilhouetteMarkup(fg: string): string {
  return `<g fill="${fg}">
      <circle cx="100" cy="80" r="34" />
      <path d="M46 178c0-36 24-58 54-58s54 22 54 58a6 6 0 0 1-6 6H52a6 6 0 0 1-6-6Z" />
    </g>
    <g fill="none" stroke="${fg}" stroke-width="3" stroke-linecap="round">
      <path d="M70 50c-10-10-16-21-14-31" />
      <path d="M82 41c-6-13-8-23-4-34" />
      <path d="M96 37c-2-13 0-23 6-32" />
      <path d="M112 39c2-13 8-21 16-28" />
      <path d="M126 47c6-11 14-17 25-19" />
      <path d="M137 57c8-7 18-9 29-7" />
    </g>`;
}

/** Démo avant/après : sujet posé sur un fond détaillé (texture), avant détourage. */
export function demoBeforeMarkup(bg: string, fg: string): string {
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
    ${detailedBackgroundMarkup(bg, fg)}
    ${personSilhouetteMarkup(fg)}
  </svg>`;
}

/** Démo avant/après : sujet seul, détouré avec les mèches de cheveux préservées. */
export function demoAfterMarkup(fg: string): string {
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
    ${personSilhouetteMarkup(fg)}
  </svg>`;
}

export type ExampleSubject = "person" | "sneaker" | "cat" | "car";

const EXAMPLE_PATHS: Record<ExampleSubject, string> = {
  person:
    "M100 40a28 28 0 1 0 0.01 0Z M60 172c0-33 18-54 40-54s40 21 40 54a4 4 0 0 1-4 4H64a4 4 0 0 1-4-4Z",
  sneaker:
    "M22 150c0-11 8-19 19-23l68-25c15-5 30-4 43 4l27 17c7 4 11 10 11 17v8c0 8-6 14-14 14H36c-8 0-14-6-14-14Z M74 106l16-24 26 9-7 21Z",
  cat: "M100 58a46 46 0 1 0 0.01 0Z M62 40l12 28-28-8Z M138 40l-12 28 28-8Z M58 152c0-31 19-50 42-50s42 19 42 50v6H58Z",
  car: "M28 142c0-18 13-30 30-34l17-27c6-10 17-16 29-16h18c15 0 28 9 34 22l9 19c14 2 23 12 23 24v12H28Z M68 164a17 17 0 1 0 0.01 0Z M152 164a17 17 0 1 0 0.01 0Z",
};

/** Chemin SVG brut (utilisable dans un `<path d="">` ou un `Path2D` canvas). */
export function subjectPathData(shape: ExampleSubject): string {
  return EXAMPLE_PATHS[shape];
}

/** Sujet sur fond plein coloré — utilisé pour les boutons d'exemple. */
export function subjectOnBackgroundMarkup(shape: ExampleSubject, bg: string, fg: string): string {
  return `<svg viewBox="0 0 200 200" role="img" aria-hidden="true" focusable="false">
    <rect width="200" height="200" fill="${bg}" />
    <path fill="${fg}" d="${subjectPathData(shape)}" />
  </svg>`;
}
