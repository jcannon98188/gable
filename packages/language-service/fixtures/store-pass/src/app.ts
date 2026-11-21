import { html, inject } from "@gablejs/core";
import { patchState, signalStore, withComputed, withMethods, withState } from "@gablejs/store";

export class CartStore extends signalStore(
  withState({ items: 0 }),
  withComputed((store) => ({ label: () => `${store.items()} items` })),
  withMethods((store) => ({
    add() {
      patchState(store, (s) => ({ items: s.items + 1 }));
    },
  })),
) {
  static scope = "root";
}

export class CartView {
  static meta = {
    selector: "x-cart-view",
    template: html`
      <p>{{ store.items() }} {{ store.label() }}</p>
      <button (click)="store.add()">add</button>
    `,
  };
  store = inject(CartStore);
  own = new CartStore();
}
