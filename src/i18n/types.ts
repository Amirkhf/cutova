export type Locale = "en" | "fr" | "pt-br" | "es" | "id";

export interface Dictionary {
  header: {
    brand: string;
    toolsMenu: string;
    toolsComingSoon: string;
    languageSelectorLabel: string;
  };
  hero: {
    title: string;
    reassurance: string;
    subtitle: string;
  };
  demo: {
    sectionTitle: string;
    beforeLabel: string;
    afterLabel: string;
    sliderLabel: string;
  };
  upload: {
    cardTitle: string;
    chooseButton: string;
    dropHint: string;
    dropActiveHint: string;
    pasteHint: string;
    examplesTitle: string;
    exampleAlt: (index: number) => string;
    selectedFile: (name: string) => string;
    chooseAnother: string;
  };
  errors: {
    unsupportedFormat: (format: string) => string;
    fileTooLarge: (maxMb: number) => string;
    dimensionsTooLarge: (maxPx: number) => string;
    generic: string;
  };
  common: {
    skipToContent: string;
  };
}
