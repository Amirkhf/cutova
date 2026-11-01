import { describe, expect, it, vi } from "vitest";
import { applyAdjustments, channelTables } from "../../src/core/editor/adjust.ts";
import { computeGeometry, scaleGeometry } from "../../src/core/editor/geometry.ts";
import { UndoHistory } from "../../src/core/editor/history.ts";
import { loadPreferences, rememberColor, rememberPreset, savePreferences, defaultPreferences } from "../../src/core/editor/prefs.ts";
import { cloneSettings, defaultSettings, FORMAT_PRESETS, isNeutralAdjust, safeColor, sameSettings } from "../../src/core/editor/settings.ts";
import { crc32, createZip, uniqueNames } from "../../src/core/export/zip.ts";

describe("settings", () => {
  it("valeurs par défaut neutres, clone indépendant", () => {
    const s = defaultSettings();
    expect(isNeutralAdjust(s.adjust)).toBe(true);
    const c = cloneSettings(s);
    c.adjust.brightness = 10;
    expect(s.adjust.brightness).toBe(0);
    expect(sameSettings(s, defaultSettings())).toBe(true);
  });
  it("couleur sûre", () => {
    expect(safeColor("#AbCdEf")).toBe("#AbCdEf");
    expect(safeColor("red;x", "#000000")).toBe("#000000");
  });
  it("formats prédéfinis : identifiants uniques, tailles positives", () => {
    expect(new Set(FORMAT_PRESETS.map((p) => p.id)).size).toBe(FORMAT_PRESETS.length);
    for (const p of FORMAT_PRESETS) expect(p.width * p.height).toBeGreaterThan(0);
  });
});

describe("adjust", () => {
  const neutral = { brightness: 0, contrast: 0, saturation: 0, temperature: 0 };
  it("neutre = identité", () => {
    const [r] = channelTables(neutral);
    expect(Array.from(r.slice(0, 5))).toEqual([0, 1, 2, 3, 4]);
    const px = new Uint8ClampedArray([10, 120, 250, 255]);
    applyAdjustments(px, neutral);
    expect(Array.from(px)).toEqual([10, 120, 250, 255]);
  });
  it("luminosité, saturation 0 = gris, température chaude, pixels transparents ignorés", () => {
    const px = new Uint8ClampedArray([100, 100, 100, 255, 200, 50, 50, 255, 9, 9, 9, 0]);
    applyAdjustments(px, { ...neutral, brightness: 50 });
    expect(px[0]).toBe(140);
    expect(px[8]).toBe(9);
    const grey = new Uint8ClampedArray([200, 50, 50, 255]);
    applyAdjustments(grey, { ...neutral, saturation: -100 });
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
    const warm = new Uint8ClampedArray([100, 100, 100, 255]);
    applyAdjustments(warm, { ...neutral, temperature: 100 });
    expect(warm[0]!).toBeGreaterThan(warm[2]!);
  });
});

describe("geometry", () => {
  const subject = { x: 100, y: 50, width: 200, height: 100 };
  it("image entière, avec largeur demandée", () => {
    expect(computeGeometry(1000, 500, { kind: "original" }, subject)).toMatchObject({ canvasWidth: 1000, canvasHeight: 500, source: { x: 0, y: 0, width: 1000, height: 500 } });
    expect(computeGeometry(1000, 500, { kind: "original" }, subject, 500)).toMatchObject({ canvasWidth: 500, canvasHeight: 250 });
  });
  it("recadrage sur le sujet sans marge", () => {
    expect(computeGeometry(1000, 500, { kind: "subject", marginPercent: 0 }, subject)).toMatchObject({ source: subject, canvasWidth: 200, canvasHeight: 100 });
  });
  it("format prédéfini : taille fixe, sujet centré dans la marge intérieure", () => {
    const g = computeGeometry(1000, 500, { kind: "preset", presetId: "square-1080", paddingPercent: 10 }, subject);
    expect([g.canvasWidth, g.canvasHeight]).toEqual([1080, 1080]);
    expect(g.dest.width).toBeCloseTo(864, 5); // 1080 × 0,8, sujet 2:1 limité par la largeur
    expect(g.dest.x).toBeCloseTo(108, 5);
    expect(g.dest.y + g.dest.height / 2).toBeCloseTo(540, 5);
  });
  it("aperçu réduit", () => {
    const g = scaleGeometry(computeGeometry(1000, 500, { kind: "original" }, null), 0.5);
    expect([g.canvasWidth, g.canvasHeight]).toEqual([500, 250]);
  });
});

describe("UndoHistory", () => {
  it("annuler / rétablir, et une nouvelle action efface le rétablissement", () => {
    const dropped: number[] = [];
    const h = new UndoHistory<number>(2, (s) => dropped.push(s));
    h.record(0);
    h.record(1);
    expect(h.undo(2)).toBe(1);
    expect(h.redo(1)).toBe(2);
    expect(h.undo(2)).toBe(1);
    h.record(5); // efface le futur (2)
    expect(h.canRedo).toBe(false);
    expect(dropped).toContain(2);
    h.record(6); // limite 2 : le plus ancien (0) est libéré
    expect(dropped).toContain(0);
    expect(h.holds((s) => s === 5)).toBe(true);
  });
});

describe("prefs", () => {
  it("aller-retour, valeurs invalides ignorées, stockage absent sans erreur", () => {
    const mem = new Map<string, string>();
    const store = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    let p = rememberColor(defaultPreferences(), "#FF0000");
    p = rememberColor(p, "#00ff00");
    p = rememberColor(p, "#ff0000");
    p = rememberPreset(p, "square-1080");
    savePreferences({ ...p, exportFormat: "webp" }, store);
    expect(loadPreferences(store)).toEqual({ recentColors: ["#ff0000", "#00ff00"], exportFormat: "webp", favoritePresets: ["square-1080"] });
    mem.set("cutova.prefs.v1", JSON.stringify({ recentColors: ["javascript:x"], exportFormat: "gif", favoritePresets: ["nope"] }));
    expect(loadPreferences(store)).toEqual(defaultPreferences());
    mem.set("cutova.prefs.v1", "{abîmé");
    expect(loadPreferences(store)).toEqual(defaultPreferences());
    expect(loadPreferences(null)).toEqual(defaultPreferences());
    const throwing = { setItem: vi.fn(() => { throw new Error("quota"); }) };
    expect(() => savePreferences(p, throwing)).not.toThrow();
  });
});

describe("zip", () => {
  it("CRC32 de référence", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });
  it("noms uniques", () => {
    expect(uniqueNames(["a.png", "a.png", "b", "b"])).toEqual(["a.png", "a (2).png", "b", "b (2)"]);
  });
  it("archive valide : signatures, nombre d'entrées, contenu à sa place", () => {
    const zip = createZip([
      { name: "un.txt", data: new TextEncoder().encode("bonjour") },
      { name: "été.txt", data: new Uint8Array([1, 2, 3]) },
    ]);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(2);
    expect(new TextDecoder().decode(zip.slice(30 + 6, 30 + 6 + 7))).toBe("bonjour");
    const centralOffset = view.getUint32(end + 16, true);
    expect(view.getUint32(centralOffset, true)).toBe(0x02014b50);
  });
});
