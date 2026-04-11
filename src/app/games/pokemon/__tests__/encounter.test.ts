import { describe, it, expect } from "vitest";
import {
  checkEncounter,
  selectWildPet,
  PET_TEMPLATES,
  MAP_AREAS,
  type PetEncounter,
} from "../game-utils";

describe("checkEncounter", () => {
  it("returns false when not on an encounter tile", () => {
    // Should always return false regardless of rate
    for (let i = 0; i < 100; i++) {
      expect(checkEncounter(false)).toBe(false);
    }
  });

  it("returns false when rate is 0", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkEncounter(true, 0)).toBe(false);
    }
  });

  it("returns true when rate is 1", () => {
    for (let i = 0; i < 100; i++) {
      expect(checkEncounter(true, 1)).toBe(true);
    }
  });

  it("uses ENCOUNTER_RATE (0.15) as default and triggers within expected range", () => {
    const trials = 5000;
    let triggers = 0;
    for (let i = 0; i < trials; i++) {
      if (checkEncounter(true)) triggers++;
    }
    const rate = triggers / trials;
    // ENCOUNTER_RATE is 0.15, allow statistical margin
    expect(rate).toBeGreaterThan(0.10);
    expect(rate).toBeLessThan(0.20);
  });
});

describe("selectWildPet", () => {
  it("returns a petId from the given pet table", () => {
    const table: PetEncounter[] = [
      { petId: "fire_pup", weight: 50 },
      { petId: "aqua_frog", weight: 50 },
    ];
    for (let i = 0; i < 50; i++) {
      const result = selectWildPet(table);
      expect(["fire_pup", "aqua_frog"]).toContain(result);
    }
  });

  it("returns the only pet when table has one entry", () => {
    const table: PetEncounter[] = [{ petId: "sproutling", weight: 100 }];
    expect(selectWildPet(table)).toBe("sproutling");
  });

  it("respects weight distribution", () => {
    const table: PetEncounter[] = [
      { petId: "common", weight: 90 },
      { petId: "rare", weight: 10 },
    ];
    const counts: Record<string, number> = { common: 0, rare: 0 };
    const trials = 5000;
    for (let i = 0; i < trials; i++) {
      counts[selectWildPet(table)]++;
    }
    // common should appear much more often
    expect(counts.common / trials).toBeGreaterThan(0.80);
    expect(counts.rare / trials).toBeLessThan(0.20);
  });

  it("every area pet table only references valid PET_TEMPLATES", () => {
    const templateIds = new Set(PET_TEMPLATES.map((t) => t.id));
    for (const area of MAP_AREAS) {
      for (const entry of area.petTable) {
        expect(templateIds.has(entry.petId)).toBe(true);
      }
    }
  });
});
