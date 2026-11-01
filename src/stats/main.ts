/**
 * Tableau de bord privé /stats (noindex, hors sitemap). Lit /api/stats (Pages Function protégée par
 * Cloudflare Access ; en dev, données de démonstration servies par Vite). Graphiques SVG maison,
 * aucune bibliothèque ni CDN. Interface en français (usage interne).
 */
import "../styles/base.css";
import "./stats.css";
import type { StatsPayload, Totals } from "../../edge/stats.ts";

type Payload = StatsPayload & { demo?: boolean };

const PERIOD_LABELS: [string, string][] = [
  ["today", "Aujourd'hui"],
  ["7", "7 jours"],
  ["30", "30 jours"],
  ["90", "90 jours"],
];
const TIME_LABELS: Record<string, string> = { lt1s: "< 1 s", "1-2s": "1–2 s", "2-5s": "2–5 s", "5-10s": "5–10 s", gt10s: "> 10 s" };
const TIME_ORDER = Object.keys(TIME_LABELS);
const LANG_LABELS: Record<string, string> = { en: "Anglais", fr: "Français", "pt-br": "Portugais (Brésil)", es: "Espagnol", id: "Indonésien" };
const TOOL_LABELS: Record<string, string> = {
  erase: "Gomme",
  restore: "Restaurer",
  reset_mask: "Réinitialiser le masque",
  background: "Fond couleur",
  background_photo: "Fond photo",
  background_blur: "Fond flou",
  shadow: "Ombre",
  outline: "Contour",
  adjust: "Réglages",
  crop: "Recadrage",
  format_preset: "Format prédéfini",
  undo: "Annuler",
  redo: "Rétablir",
};

const nf = new Intl.NumberFormat("fr-FR");
const pf = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 1 });
const df = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const fmtDay = (day: string) => df.format(new Date(`${day}T00:00:00Z`));

const SVG = "http://www.w3.org/2000/svg";
function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
function svg(tag: string, attrs: Record<string, string | number> = {}): SVGElement {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Variation relative (compteurs) ou en points (taux). */
function delta(current: number | null, previous: number | null, isRate: boolean): { text: string; tone: "up" | "down" | "flat" } {
  if (current === null || previous === null) return { text: "—", tone: "flat" };
  if (isRate) {
    const pts = (current - previous) * 100;
    const tone = Math.abs(pts) < 0.05 ? "flat" : pts > 0 ? "up" : "down";
    return { text: `${pts > 0 ? "+" : ""}${pts.toFixed(1).replace(".", ",")} pt`, tone };
  }
  if (previous === 0) return { text: current > 0 ? "nouveau" : "—", tone: current > 0 ? "up" : "flat" };
  const ratio = (current - previous) / previous;
  const tone = Math.abs(ratio) < 0.0005 ? "flat" : ratio > 0 ? "up" : "down";
  return { text: `${ratio > 0 ? "+" : ""}${pf.format(ratio)}`, tone };
}

function card(label: string, value: string, d: { text: string; tone: string }, note?: string): HTMLElement {
  return el(
    "div",
    { class: "stats-card" },
    el("dt", { class: "stats-card__label" }, label),
    el("dd", { class: "stats-card__value" }, value),
    el("dd", { class: `stats-card__delta stats-card__delta--${d.tone}` }, el("span", { class: "sr-only" }, "Variation : "), d.text, el("span", { class: "stats-card__vs" }, " vs période préc.")),
    ...(note ? [el("dd", { class: "stats-card__note" }, note)] : []),
  );
}

function cards(data: Payload): HTMLElement {
  const t: Totals = data.totals;
  const p: Totals = data.previousTotals;
  const rate = (v: number | null) => (v === null ? "—" : pf.format(v));
  const wasm = t.webgpuShare === null ? null : 1 - t.webgpuShare;
  return el(
    "dl",
    { class: "stats-cards" },
    card("Visites", nf.format(t.visits), delta(t.visits, p.visits, false)),
    card("Détourages", nf.format(t.cutouts), delta(t.cutouts, p.cutouts, false)),
    card("Téléchargements", nf.format(t.downloads), delta(t.downloads, p.downloads, false), `dont ${nf.format(t.zips)} ZIP`),
    card("Taux de réussite", rate(t.successRate), delta(t.successRate, p.successRate, true), `${nf.format(t.failures)} échec(s)`),
    card("Part WebGPU", rate(t.webgpuShare), delta(t.webgpuShare, p.webgpuShare, true), wasm === null ? undefined : `WASM : ${pf.format(wasm)}`),
  );
}

interface Series {
  name: string;
  values: number[];
  tone: number;
}

/** Courbes par jour (une ou plusieurs séries), axe Y à 0, table de données équivalente dans <details>. */
function lineChart(title: string, days: string[], series: Series[]): HTMLElement {
  const W = 640;
  const H = 220;
  const pad = { top: 12, right: 12, bottom: 28, left: 44 };
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => pad.left + (days.length === 1 ? (W - pad.left - pad.right) / 2 : (i * (W - pad.left - pad.right)) / (days.length - 1));
  const y = (v: number) => pad.top + (1 - v / top) * (H - pad.top - pad.bottom);

  const chart = svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "stats-chart", role: "img", "aria-label": `${title} : ${series.map((s) => `${s.name} ${nf.format(sum(s.values))}`).join(", ")}` });
  for (let v = 0; v <= top; v += step) {
    chart.append(svg("line", { x1: pad.left, x2: W - pad.right, y1: y(v), y2: y(v), class: "stats-chart__grid" }));
    const label = svg("text", { x: pad.left - 6, y: y(v) + 4, class: "stats-chart__tick", "text-anchor": "end" });
    label.textContent = compact(v);
    chart.append(label);
  }
  const every = Math.max(1, Math.ceil(days.length / 6));
  days.forEach((day, i) => {
    if (i % every !== 0 && i !== days.length - 1) return;
    if (i !== days.length - 1 && days.length - 1 - i < every / 2) return;
    const label = svg("text", { x: x(i), y: H - 8, class: "stats-chart__tick", "text-anchor": days.length === 1 ? "middle" : i === 0 ? "start" : i === days.length - 1 ? "end" : "middle" });
    label.textContent = fmtDay(day);
    chart.append(label);
  });
  for (const s of series) {
    const points = s.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
    if (s.values.length > 1) chart.append(svg("polyline", { points, class: `stats-chart__line stats-tone-${s.tone}` }));
    if (s.values.length <= 31) s.values.forEach((v, i) => chart.append(svg("circle", { cx: x(i), cy: y(v), r: s.values.length === 1 ? 5 : 2.5, class: `stats-chart__dot stats-tone-${s.tone}` })));
  }

  const legend = el("ul", { class: "stats-legend" }, ...series.map((s) => el("li", {}, el("span", { class: `stats-swatch stats-tone-${s.tone}`, "aria-hidden": "true" }), `${s.name} (${nf.format(sum(s.values))})`)));
  const table = el(
    "table",
    { class: "stats-table" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Jour"), ...series.map((s) => el("th", { scope: "col" }, s.name)))),
    el("tbody", {}, ...days.map((day, i) => el("tr", {}, el("th", { scope: "row" }, fmtDay(day)), ...series.map((s) => el("td", {}, nf.format(s.values[i] ?? 0)))))),
  );
  return panel(title, legend, chart, el("details", { class: "stats-details" }, el("summary", {}, "Voir les données"), table));
}

/** Liste de barres horizontales (top N). */
function barList(title: string, items: { key: string; count: number }[], labels: Record<string, string> = {}): HTMLElement {
  if (items.length === 0) return panel(title, el("p", { class: "stats-empty" }, "Aucune donnée sur la période."));
  const max = Math.max(...items.map((i) => i.count));
  const total = sum(items.map((i) => i.count));
  const list = el(
    "ol",
    { class: "stats-bars" },
    ...items.map((item) => {
      const bar = el("span", { class: "stats-bars__fill", "aria-hidden": "true" });
      bar.style.setProperty("--w", `${((item.count / max) * 100).toFixed(1)}%`);
      return el(
        "li",
        { class: "stats-bars__row" },
        el("span", { class: "stats-bars__label" }, labels[item.key] ?? item.key),
        el("span", { class: "stats-bars__value" }, `${nf.format(item.count)} · ${pf.format(item.count / total)}`),
        el("span", { class: "stats-bars__track" }, bar),
      );
    }),
  );
  return panel(title, list);
}

/** Temps de traitement : une barre empilée par moteur (tranches), plus la table équivalente. */
function timeByEngine(data: Payload): HTMLElement {
  const engines = Object.keys(data.timeByEngine).sort();
  const title = "Temps de traitement par moteur";
  if (engines.length === 0) return panel(title, el("p", { class: "stats-empty" }, "Aucune donnée sur la période."));
  const rows = engines.map((engine) => {
    const buckets = data.timeByEngine[engine]!;
    const total = sum(Object.values(buckets));
    const stack = el("span", { class: "stats-stack", role: "img", "aria-label": `${engine.toUpperCase()} : ${TIME_ORDER.map((b) => `${TIME_LABELS[b]} ${pf.format((buckets[b] ?? 0) / total)}`).join(", ")}` });
    TIME_ORDER.forEach((b, i) => {
      const share = (buckets[b] ?? 0) / total;
      if (share <= 0) return;
      const part = el("span", { class: `stats-stack__part stats-seq-${i}` });
      part.style.setProperty("--w", `${(share * 100).toFixed(2)}%`);
      stack.append(part);
    });
    return el("div", { class: "stats-stack__row" }, el("span", { class: "stats-bars__label" }, `${engine === "webgpu" ? "WebGPU" : "WASM"} (${nf.format(total)})`), stack);
  });
  const legend = el("ul", { class: "stats-legend" }, ...TIME_ORDER.map((b, i) => el("li", {}, el("span", { class: `stats-swatch stats-seq-${i}`, "aria-hidden": "true" }), TIME_LABELS[b]!)));
  const table = el(
    "table",
    { class: "stats-table" },
    el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Moteur"), ...TIME_ORDER.map((b) => el("th", { scope: "col" }, TIME_LABELS[b]!)))),
    el("tbody", {}, ...engines.map((e) => el("tr", {}, el("th", { scope: "row" }, e === "webgpu" ? "WebGPU" : "WASM"), ...TIME_ORDER.map((b) => el("td", {}, nf.format(data.timeByEngine[e]![b] ?? 0)))))),
  );
  return panel(title, legend, ...rows, el("details", { class: "stats-details" }, el("summary", {}, "Voir les données"), table));
}

function panel(title: string, ...children: Node[]): HTMLElement {
  return el("section", { class: "stats-panel" }, el("h2", { class: "stats-panel__title" }, title), ...children);
}

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);
function niceStep(max: number): number {
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw) || 1;
}
const compact = (v: number) => (v >= 10_000 ? `${nf.format(Math.round(v / 1000))} k` : nf.format(v));

// ——— Page ———

const root = document.querySelector<HTMLElement>("#stats");
if (!root) throw new Error("#stats introuvable");

const status = el("p", { class: "stats-status", role: "status" });
const content = el("div", { class: "stats-content" });
const range = el("p", { class: "stats-range" });
const demoBadge = el("span", { class: "stats-demo", hidden: "" }, "Données de démonstration");
const periods = el("div", { class: "stats-periods", role: "group", "aria-label": "Période" });

function initialPeriod(): string {
  const p = new URLSearchParams(location.search).get("period");
  return PERIOD_LABELS.some(([k]) => k === p) ? p! : "7";
}
let current = initialPeriod();
for (const [key, label] of PERIOD_LABELS) {
  const button = el("button", { type: "button", class: "stats-periods__btn", "data-period": key, "aria-pressed": String(key === current) }, label);
  button.addEventListener("click", () => {
    if (key === current) return;
    current = key;
    for (const b of periods.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.period === key));
    const url = new URL(location.href);
    url.searchParams.set("period", key);
    history.replaceState(null, "", url);
    void load();
  });
  periods.append(button);
}

root.append(
  el("header", { class: "stats-header" }, el("div", {}, el("h1", { class: "stats-title" }, "Statistiques Cutova"), range), demoBadge, periods),
  status,
  content,
  el("p", { class: "stats-footnote" }, "Compteurs anonymes agrégés par jour (UTC). Aucune donnée personnelle : voir la politique de confidentialité."),
);

async function load(): Promise<void> {
  status.textContent = "Chargement…";
  root!.setAttribute("aria-busy", "true");
  try {
    const response = await fetch(`/api/stats?period=${encodeURIComponent(current)}`, { credentials: "same-origin", cache: "no-store" });
    if (response.status === 403) throw new Error("Accès refusé : connectez-vous via Cloudflare Access.");
    if (!response.ok) throw new Error(`Données indisponibles (erreur ${response.status}).`);
    const data = (await response.json()) as Payload;
    render(data);
    status.textContent = "";
  } catch (error) {
    content.replaceChildren();
    status.textContent = error instanceof Error ? error.message : "Données indisponibles.";
  } finally {
    root!.removeAttribute("aria-busy");
  }
}

function render(data: Payload): void {
  demoBadge.hidden = !data.demo;
  range.textContent =
    data.range.start === data.range.end
      ? `${fmtDay(data.range.start)} · comparé au ${fmtDay(data.previousRange.start)}`
      : `Du ${fmtDay(data.range.start)} au ${fmtDay(data.range.end)} · comparé au ${fmtDay(data.previousRange.start)} – ${fmtDay(data.previousRange.end)}`;
  content.replaceChildren(
    cards(data),
    lineChart("Activité par jour", data.days, [
      { name: "Visites", values: data.series.visits, tone: 1 },
      { name: "Détourages", values: data.series.cutouts, tone: 2 },
      { name: "Téléchargements", values: data.series.downloads, tone: 3 },
    ]),
    lineChart("Échecs et replis WASM par jour", data.days, [
      { name: "Échecs", values: data.series.failures, tone: 4 },
      { name: "Replis vers WASM", values: data.series.fallbacks, tone: 3 },
    ]),
    el(
      "div",
      { class: "stats-grid" },
      barList("Outils les plus utilisés", data.tools, TOOL_LABELS),
      barList("Formats d'export", data.formats.map((f) => ({ ...f, key: f.key.toUpperCase() }))),
      barList("Langues", data.langs, LANG_LABELS),
      barList("Pages d'arrivée", data.landingPages),
    ),
    timeByEngine(data),
  );
}

void load();
