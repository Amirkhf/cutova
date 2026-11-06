import { describe, expect, it } from "vitest";
import { backgroundFromQuery } from "../../src/core/editor/url-preset.ts";

const IDS = ["sea", "bokeh", "city"] as const;

describe("backgroundFromQuery", () => {
  it("?bg=white → blanc pur", () => {
    expect(backgroundFromQuery("?bg=white", IDS)).toEqual({ kind: "color", color: "#ffffff" });
  });
  it("?bg=photo → première photo, ou celle demandée si elle existe", () => {
    expect(backgroundFromQuery("?bg=photo", IDS)).toEqual({ kind: "photo", photoId: "sea" });
    expect(backgroundFromQuery("?bg=photo&photo=city", IDS)).toEqual({ kind: "photo", photoId: "city" });
    expect(backgroundFromQuery("?bg=photo&photo=../../etc", IDS)).toEqual({ kind: "photo", photoId: "sea" });
  });
  it("toute autre valeur est ignorée", () => {
    for (const q of ["", "?bg=", "?bg=red", "?bg=WHITE", "?x=white", "?bg=%3Cscript%3E"]) expect(backgroundFromQuery(q, IDS)).toBeNull();
  });
});
