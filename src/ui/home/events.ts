/**
 * Événement émis quand une image valide a été choisie par l'utilisateur. L'étape
 * suivante (moteur IA) s'y abonnera ; l'accueil ne connaît rien du traitement.
 */
export const IMAGE_SELECTED_EVENT = "image:selected";

export type ImageSource = "picker" | "drop" | "paste" | "example";

export interface ImageSelectedDetail {
  file: File;
  source: ImageSource;
}

export function emitImageSelected(detail: ImageSelectedDetail): void {
  window.dispatchEvent(new CustomEvent<ImageSelectedDetail>(IMAGE_SELECTED_EVENT, { detail }));
}
