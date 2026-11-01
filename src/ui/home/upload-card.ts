import type { Dictionary } from "../../i18n/index.ts";
import { MAX_FILE_SIZE_BYTES, validateImage, type ValidationError } from "../../core/validate-image/validate-image.ts";
import { ABSOLUTE_MAX_DECODE_PIXELS } from "../../core/limits/device-limits.ts";
import { emitImageSelected, type ImageSource } from "./events.ts";
import { inferenceEngine } from "../../core/inference/engine-client.ts";
import { uploadArrowIconMarkup } from "./visuals.ts";

const ACCEPTED_MIME =
  "image/png,image/jpeg,image/webp,image/avif,image/gif,image/heic,image/heif";

/** Vraies photos libres (Pexels), optimisées dans public/examples/ — sources : public/examples/SOURCES.md. */
const EXAMPLES = ["person", "product", "animal", "car"] as const;
type ExampleId = (typeof EXAMPLES)[number];

function messageForError(error: ValidationError, dict: Dictionary): string {
  switch (error.code) {
    case "unsupported-format":
      return dict.errors.unsupportedFormat(error.format);
    case "file-too-large":
      return dict.errors.fileTooLarge(Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024)));
    case "dimensions-too-large":
      return dict.errors.dimensionsTooLarge(Math.round(ABSOLUTE_MAX_DECODE_PIXELS / 1_000_000));
    case "unreadable":
      return dict.errors.generic;
  }
}

/** Télécharge la photo d'exemple (même origine) et la transforme en File, comme un envoi normal. */
async function exampleToFile(id: ExampleId): Promise<File> {
  const response = await fetch(`/examples/${id}.webp`);
  if (!response.ok) throw new Error(`Exemple introuvable (${response.status})`);
  const blob = await response.blob();
  return new File([blob], `example-${id}.webp`, { type: "image/webp" });
}

/** Vignette en AVIF (plus léger) avec repli WebP. */
function exampleThumbnail(id: ExampleId): HTMLPictureElement {
  const picture = document.createElement("picture");
  const avif = document.createElement("source");
  avif.type = "image/avif";
  avif.srcset = `/examples/${id}-thumb.avif`;
  const img = document.createElement("img");
  img.src = `/examples/${id}-thumb.webp`;
  img.alt = "";
  img.width = 120;
  img.height = 120;
  img.loading = "lazy";
  img.decoding = "async";
  picture.append(avif, img);
  return picture;
}

export interface UploadCardOptions {
  dict: Dictionary;
  initialFile: File | null;
  onFileAccepted: (file: File) => void;
}

export interface UploadCardHandle {
  element: HTMLElement;
  destroy: () => void;
}

export function renderUploadCard({ dict, initialFile, onFileAccepted }: UploadCardOptions): UploadCardHandle {
  const section = document.createElement("section");
  section.className = "home-upload-section";
  section.setAttribute("aria-labelledby", "home-upload-title");

  const card = document.createElement("div");
  card.className = "upload-card";

  const title = document.createElement("h2");
  title.id = "home-upload-title";
  title.className = "sr-only";
  title.textContent = dict.upload.cardTitle;

  const status = document.createElement("p");
  status.className = "upload-status";
  status.setAttribute("role", "alert");

  const dropzone = document.createElement("div");
  dropzone.className = "upload-dropzone";

  const idleState = document.createElement("div");
  idleState.className = "upload-idle";

  const uploadIcon = document.createElement("span");
  uploadIcon.className = "upload-icon";
  uploadIcon.setAttribute("aria-hidden", "true");
  uploadIcon.innerHTML = uploadArrowIconMarkup();

  const chooseButton = document.createElement("button");
  chooseButton.type = "button";
  chooseButton.className = "btn btn-primary upload-choose-btn";
  chooseButton.textContent = dict.upload.chooseButton;

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.className = "sr-only";
  fileInput.accept = ACCEPTED_MIME;
  fileInput.multiple = true;
  fileInput.tabIndex = -1;
  fileInput.setAttribute("aria-hidden", "true");

  const dropHint = document.createElement("p");
  dropHint.className = "upload-hint";
  dropHint.textContent = dict.upload.dropHint;

  const pasteHint = document.createElement("p");
  pasteHint.className = "upload-hint";
  pasteHint.textContent = dict.upload.pasteHint;

  idleState.append(uploadIcon, chooseButton, fileInput, dropHint, pasteHint);

  const examplesBlock = document.createElement("div");
  examplesBlock.className = "upload-examples";
  const examplesTitle = document.createElement("p");
  examplesTitle.className = "upload-examples-title";
  examplesTitle.textContent = dict.upload.examplesTitle;
  const examplesList = document.createElement("div");
  examplesList.className = "upload-examples-list";

  const selectedState = document.createElement("div");
  selectedState.className = "upload-selected";
  selectedState.hidden = true;

  const selectedName = document.createElement("p");
  selectedName.className = "upload-selected-name";

  const chooseAnotherButton = document.createElement("button");
  chooseAnotherButton.type = "button";
  chooseAnotherButton.className = "btn btn-secondary";
  chooseAnotherButton.textContent = dict.upload.chooseAnother;

  selectedState.append(selectedName, chooseAnotherButton);

  dropzone.append(idleState, selectedState);
  card.append(status, dropzone, examplesBlock);
  section.append(title, card);
  examplesBlock.append(examplesTitle, examplesList);

  function showIdle(): void {
    idleState.hidden = false;
    selectedState.hidden = true;
    examplesBlock.hidden = false;
  }

  function showSelected(file: File): void {
    idleState.hidden = true;
    selectedState.hidden = false;
    examplesBlock.hidden = true;
    selectedName.textContent = dict.upload.selectedFile(file.name || "image");
  }

  if (initialFile) {
    showSelected(initialFile);
  } else {
    showIdle();
  }

  async function handleCandidate(file: File, source: ImageSource): Promise<void> {
    status.textContent = "";
    status.classList.remove("upload-status-info");
    const result = await validateImage(file);
    if (!result.ok) {
      status.textContent = messageForError(result.error, dict);
      return;
    }
    if (result.resizeTo) {
      // Non bloquant : l'image est acceptée, seule la décodage pour le traitement sera réduit.
      status.classList.add("upload-status-info");
      status.textContent = dict.upload.imageDownscaled(result.resizeTo.width, result.resizeTo.height);
    }
    showSelected(file);
    emitImageSelected({ file, source, resizeTo: result.resizeTo });
    onFileAccepted(file);
  }

  chooseButton.addEventListener("click", () => fileInput.click());
  // Préchargement du modèle IA au premier survol/focus du bouton principal (idempotent).
  chooseButton.addEventListener("mouseenter", () => inferenceEngine.preload(), { once: true });
  chooseButton.addEventListener("focus", () => inferenceEngine.preload(), { once: true });
  chooseAnotherButton.addEventListener("click", () => {
    status.textContent = "";
    fileInput.value = "";
    showIdle();
  });
  // Plusieurs fichiers possibles : chacun devient une image du lot (éditeur, bande de miniatures).
  const handleAll = async (files: File[], source: ImageSource) => {
    for (const file of files) await handleCandidate(file, source);
  };
  fileInput.addEventListener("change", () => {
    const files = Array.from(fileInput.files ?? []);
    fileInput.value = "";
    void handleAll(files, "picker");
  });

  for (const [index, id] of EXAMPLES.entries()) {
    const exampleButton = document.createElement("button");
    exampleButton.type = "button";
    exampleButton.className = "upload-example";
    exampleButton.setAttribute("aria-label", dict.upload.exampleAlt(index + 1));
    exampleButton.append(exampleThumbnail(id));
    exampleButton.addEventListener("click", () => {
      void exampleToFile(id)
        .then((file) => handleCandidate(file, "example"))
        .catch(() => (status.textContent = dict.errors.generic));
    });
    examplesList.append(exampleButton);
  }

  // Glisser-déposer sur toute la page.
  let dragDepth = 0;
  const hasFilePayload = (event: DragEvent) =>
    Array.from(event.dataTransfer?.types ?? []).includes("Files");

  const onDragEnter = (event: DragEvent) => {
    if (!hasFilePayload(event)) return;
    dragDepth++;
    document.body.classList.add("is-drag-active");
    dropHint.textContent = dict.upload.dropActiveHint;
  };
  const onDragOver = (event: DragEvent) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
  };
  const onDragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      document.body.classList.remove("is-drag-active");
      dropHint.textContent = dict.upload.dropHint;
    }
  };
  const onDrop = (event: DragEvent) => {
    if (!hasFilePayload(event)) return;
    event.preventDefault();
    dragDepth = 0;
    document.body.classList.remove("is-drag-active");
    dropHint.textContent = dict.upload.dropHint;
    void handleAll(Array.from(event.dataTransfer?.files ?? []), "drop");
  };
  const onPaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
    void handleAll(files, "paste");
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("drop", onDrop);
  window.addEventListener("paste", onPaste);

  function destroy(): void {
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("drop", onDrop);
    window.removeEventListener("paste", onPaste);
    document.body.classList.remove("is-drag-active");
  }

  return { element: section, destroy };
}
