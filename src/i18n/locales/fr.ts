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
    imageDownscaled: (width, height) =>
      `Cette image a été réduite à ${width}×${height} pour tenir dans la mémoire de cet appareil.`,
  },
  errors: {
    unsupportedFormat: (format) =>
      format === "heic"
        ? "Les photos HEIC ne sont pas encore prises en charge. Convertissez-la d'abord en JPEG ou PNG."
        : "Ce type de fichier n'est pas pris en charge. Essayez une image PNG, JPEG, WebP, AVIF ou GIF.",
    fileTooLarge: (maxMb) => `Cette image est trop lourde. Utilisez un fichier de moins de ${maxMb} Mo.`,
    dimensionsTooLarge: (maxMegapixels) =>
      `Cette image est trop grande pour être traitée en toute sécurité. Utilisez-en une de moins de ${maxMegapixels} mégapixels.`,
    generic: "Une erreur est survenue à la lecture de ce fichier. Essayez-en un autre.",
  },
  result: {
    title: "Votre résultat",
    preparingModel: "Préparation du modèle IA…",
    loadingModel: (percent) => `Téléchargement du modèle IA… ${percent}%`,
    running: "Détourage en cours…",
    processingTime: (ms) => `Traité en ${(ms / 1000).toFixed(1)} s`,
    error: "Le détourage a échoué. Essayez une autre image.",
    compareLabel: "Comparer l'original et le résultat",
    beforeLabel: "Avant",
    afterLabel: "Après",
    backgroundLegend: "Fond",
    backgroundTransparent: "Transparent",
    backgroundWhite: "Blanc",
    backgroundColor: "Couleur",
    backgroundColorPicker: "Couleur du fond",
    formatLegend: "Format",
    formatJpgNote: "Le JPG ne gère pas la transparence : un fond blanc est utilisé.",
    download: "Télécharger",
    downloadSize: (width, height) => `Pleine résolution : ${width} × ${height} px`,
    newImage: "Nouvelle image",
    finishing: "Affinage des bords en pleine résolution…",
    touchUpLegend: "Retouche",
    toolCompare: "Comparer",
    toolErase: "Gomme",
    toolRestore: "Restaurer",
    brushSize: "Taille du pinceau",
    undo: "Annuler",
    resetEdits: "Réinitialiser",
    sizeLegend: "Taille",
    cropOriginal: "Cadrage d'origine",
    cropSubject: "Recadrer sur le sujet",
    cropMargin: "Marge",
    outputWidth: "Largeur (px)",
    outputSize: (width, height) => `Sortie : ${width} × ${height} px`,
  },
  common: {
    skipToContent: "Aller au contenu",
  },
};
