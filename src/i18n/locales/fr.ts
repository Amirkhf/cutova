import type { Dictionary } from "../types.ts";

export const fr: Dictionary = {
  header: {
    brand: "cutova",
    toolsMenu: "Outils",
    toolsComingSoon: "D'autres outils arrivent bientôt.",
    languageSelectorLabel: "Langue",
  },
  hero: {
    title: "Détourez vos images en quelques secondes",
    reassurance: "Votre image ne quitte jamais votre navigateur.",
    subtitle:
      "Déposez une photo, récupérez un détourage propre. Sans compte, sans envoi, sans piège.",
  },
  demo: {
    sectionTitle: "Voir le résultat",
    beforeLabel: "Avant",
    afterLabel: "Après",
    sliderLabel: "Comparer avant et après",
  },
  upload: {
    cardTitle: "Ajoutez votre image",
    chooseButton: "Choisir une image",
    dropHint: "ou glissez-la n'importe où sur cette page",
    dropActiveHint: "Déposez-la ici",
    pasteHint: "Vous pouvez aussi la coller avec Ctrl+V (Cmd+V sur Mac)",
    examplesTitle: "Pas d'image sous la main ? Essayez-en une",
    exampleAlt: (index) => `Image d'exemple ${index}`,
    selectedFile: (name) => `Sélectionnée : ${name}`,
    chooseAnother: "Choisir une autre image",
  },
  errors: {
    unsupportedFormat: (format) =>
      format === "heic"
        ? "Les photos HEIC ne sont pas encore prises en charge. Convertissez-la d'abord en JPEG ou PNG."
        : "Ce type de fichier n'est pas pris en charge. Essayez une image PNG, JPEG, WebP, AVIF ou GIF.",
    fileTooLarge: (maxMb) => `Cette image est trop lourde. Utilisez un fichier de moins de ${maxMb} Mo.`,
    dimensionsTooLarge: (maxPx) =>
      `Cette image est trop grande. Utilisez-en une de moins de ${maxPx}×${maxPx} pixels.`,
    generic: "Une erreur est survenue à la lecture de ce fichier. Essayez-en un autre.",
  },
  common: {
    skipToContent: "Aller au contenu",
  },
};
