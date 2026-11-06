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
