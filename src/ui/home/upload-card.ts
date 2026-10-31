import type { Dictionary } from "../../i18n/index.ts";
import {
  MAX_FILE_SIZE_BYTES,
  MAX_IMAGE_DIMENSION,
  validateImage,
  type ValidationError,
} from "../../core/validate-image/validate-image.ts";
import { emitImageSelected, type ImageSource } from "./events.ts";
import { subjectOnBackgroundMarkup, subjectPathData, uploadArrowIconMarkup, type ExampleSubject } from "./visuals.ts";

const ACCEPTED_MIME =
  "image/png,image/jpeg,image/webp,image/avif,image/gif,image/heic,image/heif";

interface ExampleSpec {
  shape: ExampleSubject;
  bg: string;
  fg: string;
}

const EXAMPLES: ExampleSpec[] = [
  { shape: "person", bg: "#ffb27a", fg: "#5c3a1e" },
  { shape: "sneaker", bg: "#9ad1c8", fg: "#17433c" },
  { shape: "cat", bg: "#f2c744", fg: "#4a3a06" },
  { shape: "car", bg: "#c6b7f2", fg: "#372a5c" },
];

function messageForError(error: ValidationError, dict: Dictionary): string {
  switch (error.code) {
    case "unsupported-format":
      return dict.errors.unsupportedFormat(error.format);
    case "file-too-large":
      return dict.errors.fileTooLarge(Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024)));
    case "dimensions-too-large":
      return dict.errors.dimensionsTooLarge(MAX_IMAGE_DIMENSION);
    case "unreadable":
      return dict.errors.generic;
  }
}

/** Dessine un exemple directement en canvas (évite un aller-retour SVG → image → blob). */
async function exampleToFile(spec: ExampleSpec, index: number): Promise<File> {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.fillStyle = spec.bg;
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = spec.fg;

  // Les chemins sont définis en viewBox 200x200 (voir visuals.ts) ; on les mappose
  // au centre du canvas 512x512 via une mise à l'échelle.
  ctx.save();
  ctx.translate(56, 56);
  ctx.scale(2, 2);
  ctx.fill(new Path2D(subjectPathData(spec.shape)));
  ctx.restore();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("canvas.toBlob returned null");
  return new File([blob], `example-${index + 1}.png`, { type: "image/png" });
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
    const result = await validateImage(file);
    if (!result.ok) {
      status.textContent = messageForError(result.error, dict);
      return;
    }
    showSelected(file);
    emitImageSelected({ file, source });
    onFileAccepted(file);
  }

  chooseButton.addEventListener("click", () => fileInput.click());
  chooseAnotherButton.addEventListener("click", () => {
    status.textContent = "";
    fileInput.value = "";
    showIdle();
  });
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (file) void handleCandidate(file, "picker");
  });

  for (const [index, spec] of EXAMPLES.entries()) {
    const exampleButton = document.createElement("button");
    exampleButton.type = "button";
    exampleButton.className = "upload-example";
    exampleButton.setAttribute("aria-label", dict.upload.exampleAlt(index + 1));
    exampleButton.innerHTML = subjectOnBackgroundMarkup(spec.shape, spec.bg, spec.fg);
    exampleButton.addEventListener("click", () => {
      void exampleToFile(spec, index).then((file) => handleCandidate(file, "example"));
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
    const file = event.dataTransfer?.files?.[0];
    if (file) void handleCandidate(file, "drop");
  };
  const onPaste = (event: ClipboardEvent) => {
    const items = event.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          void handleCandidate(file, "paste");
          break;
        }
      }
    }
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
