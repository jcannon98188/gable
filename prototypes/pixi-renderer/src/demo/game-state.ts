// Game state in a service: shared by the DOM HUD and the canvas entities through DI.
import { computed, signal } from "@gable/core";

export interface RockData {
  id: number;
  x: number;
  speed: number;
  spin: number;
  size: number;
}

export const GW = 800;
export const GH = 600;

export class GameState {
  score = signal(0);
  hits = signal(0);
  rocks = signal<RockData[]>([]);
  shipX = signal(GW / 2);
  shipY = signal(GH - 80);
  keys = new Set<string>();
  /** Accumulator held in the service (survives a component edit, and this service's own edit goes through state transfer). */
  elapsed = 0;
  nextId = 0;
  rockCount = computed(() => this.rocks().length);
  rockLabel = computed(() => `rocks ${this.rocks().length}`);

  spawn() {
    const id = this.nextId++;
    const rock: RockData = { id, x: Math.random() * GW, speed: 90 + Math.random() * 160, spin: (Math.random() - 0.5) * 6, size: 0.6 + Math.random() };
    this.rocks.update((l) => [...l, rock]);
  }

  despawn(id: number) {
    this.rocks.update((l) => l.filter((r) => r.id !== id));
  }

  hit(id: number) {
    this.hits.update((h) => h + 1);
    this.despawn(id);
  }
}
