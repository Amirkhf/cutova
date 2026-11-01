/**
 * Petites briques de formulaire accessibles (libellés reliés, natifs, utilisables au clavier) pour
 * les panneaux de l'éditeur. Chaque contrôle distingue "pendant le geste" (`onInput`) et "fin du
 * geste" (`onCommit`) : l'historique annuler/rétablir enregistre un geste entier, pas chaque pixel
 * d'un curseur.
 */

let uid = 0;
const nextId = (prefix: string) => `${prefix}-${++uid}`;

export interface GestureHandlers<T> {
  /** Appelé une fois au début du geste (avant la première valeur). */
  onStart?: () => void;
  onInput: (value: T) => void;
  onCommit?: (value: T) => void;
}

export function fieldset(legend: string, className = "editor-fieldset"): HTMLFieldSetElement {
  const el = document.createElement("fieldset");
  el.className = className;
  const lg = document.createElement("legend");
  lg.textContent = legend;
  el.append(lg);
  return el;
}

export function rangeField(label: string, min: number, max: number, value: number, handlers: GestureHandlers<number>): { root: HTMLElement; input: HTMLInputElement } {
  const root = document.createElement("div");
  root.className = "editor-range";
  const id = nextId("range");
  const lab = document.createElement("label");
  lab.htmlFor = id;
  lab.textContent = label;
  const out = document.createElement("output");
  out.htmlFor.add(id);
  const input = document.createElement("input");
  input.type = "range";
  input.id = id;
  input.min = String(min);
  input.max = String(max);
  input.value = String(value);
  out.textContent = String(value);
  let active = false;
  input.addEventListener("input", () => {
    if (!active) {
      active = true;
      handlers.onStart?.();
    }
    out.textContent = input.value;
    handlers.onInput(Number(input.value));
  });
  input.addEventListener("change", () => {
    active = false;
    handlers.onCommit?.(Number(input.value));
  });
  root.append(lab, out, input);
  return { root, input };
}

export function setRange(input: HTMLInputElement, value: number): void {
  input.value = String(value);
  const out = input.parentElement?.querySelector("output");
  if (out) out.textContent = String(value);
}

export function checkboxField(label: string, checked: boolean, onChange: (checked: boolean) => void): { root: HTMLElement; input: HTMLInputElement } {
  const root = document.createElement("label");
  root.className = "editor-check";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const span = document.createElement("span");
  span.textContent = label;
  root.append(input, span);
  return { root, input };
}

export function radioGroup<T extends string>(
  name: string,
  legend: string,
  options: { value: T; label: string }[],
  initial: T,
  onChange: (value: T) => void,
): { fieldset: HTMLFieldSetElement; list: HTMLElement; set: (value: T) => void } {
  const fs = fieldset(legend);
  const list = document.createElement("div");
  list.className = "editor-options";
  const inputs: HTMLInputElement[] = [];
  for (const option of options) {
    const label = document.createElement("label");
    label.className = "editor-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = option.value;
    input.checked = option.value === initial;
    input.addEventListener("change", () => input.checked && onChange(option.value));
    const text = document.createElement("span");
    text.textContent = option.label;
    label.append(input, text);
    list.append(label);
    inputs.push(input);
  }
  fs.append(list);
  return {
    fieldset: fs,
    list,
    set: (value) => {
      for (const input of inputs) input.checked = input.value === value;
    },
  };
}

export function colorField(label: string, value: string, handlers: GestureHandlers<string>): { root: HTMLElement; input: HTMLInputElement } {
  const root = document.createElement("label");
  root.className = "editor-color";
  const input = document.createElement("input");
  input.type = "color";
  input.value = value;
  const span = document.createElement("span");
  span.textContent = label;
  let active = false;
  input.addEventListener("input", () => {
    if (!active) {
      active = true;
      handlers.onStart?.();
    }
    handlers.onInput(input.value);
  });
  input.addEventListener("change", () => {
    active = false;
    handlers.onCommit?.(input.value);
  });
  root.append(input, span);
  return { root, input };
}

export function button(label: string, className = "btn btn-secondary"): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = className;
  b.textContent = label;
  return b;
}
