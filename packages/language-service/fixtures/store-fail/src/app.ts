import { html, inject } from "@gable/core";
import { STATE_SOURCE, patchState, signalStore, withMethods, withState } from "@gable/store";

export class CartStore extends signalStore(
  withState({ items: 0 }),
  withMethods((store) => ({
    add() {
      patchState(store, (s) => ({ items: s.items + 1 }));
    },
    sneaky() {
      store[STATE_SOURCE].set({ items: 99 });
    },
  })),
) {
  static scope = "root";
}

export const orphan = new CartStore();

export class CartView {
  static meta = {
    selector: "x-cart-view",
    template: html`
      <p>{{ store.items() }}</p>
      <p>{{ store.add() }}</p>
      <button (click)="store.add()">add</button>
    `,
  };
  store = inject(CartStore);
  late = new CartStore();
}
