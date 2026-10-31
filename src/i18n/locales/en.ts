import type { Dictionary } from "../types.ts";

export const en: Dictionary = {
  header: {
    brand: "cutova",
    toolsMenu: "Tools",
    toolsComingSoon: "More tools are coming soon.",
    languageSelectorLabel: "Language",
  },
  hero: {
    title: "Remove any background in seconds",
    reassurance: "Your image never leaves your browser.",
    subtitle: "Drop a photo, get a clean cutout. No account, no upload, no catch.",
  },
  demo: {
    sectionTitle: "See it in action",
    beforeLabel: "Before",
    afterLabel: "After",
    sliderLabel: "Compare before and after",
  },
  upload: {
    cardTitle: "Add your image",
    chooseButton: "Choose an image",
    dropHint: "or drag and drop it anywhere on this page",
    dropActiveHint: "Drop it here",
    pasteHint: "You can also paste it with Ctrl+V (Cmd+V on Mac)",
    examplesTitle: "No image handy? Try one of these",
    exampleAlt: (index) => `Example image ${index}`,
    selectedFile: (name) => `Selected: ${name}`,
    chooseAnother: "Choose another image",
    imageDownscaled: (width, height) =>
      `This image was reduced to ${width}×${height} to fit this device's memory.`,
  },
  errors: {
    unsupportedFormat: (format) =>
      format === "heic"
        ? "HEIC photos aren't supported yet. Please convert it to JPEG or PNG first."
        : "This file type isn't supported. Try a PNG, JPEG, WebP, AVIF or GIF image.",
    fileTooLarge: (maxMb) => `This image is too large. Please use a file under ${maxMb} MB.`,
    dimensionsTooLarge: (maxMegapixels) =>
      `This image is too large to process safely. Please use one under ${maxMegapixels} megapixels.`,
    generic: "Something went wrong reading this file. Please try another one.",
  },
  result: {
    provisionalBadge: "Preview — provisional",
    preparingModel: "Preparing the AI model…",
    loadingModel: (percent) => `Downloading the AI model… ${percent}%`,
    running: "Removing the background…",
    processingTime: (ms) => `Processed in ${(ms / 1000).toFixed(1)}s`,
    error: "Background removal failed. Please try another image.",
  },
  common: {
    skipToContent: "Skip to content",
  },
};
