import { computed, html, inject } from "@gable/core";
import { getState, patchState, signalStore, withComputed, withMethods, withState, withStorage } from "@gable/store";

export interface Product {
  sku: string;
  name: string;
  /** Price in cents, so the arithmetic stays exact. */
  price: number;
}

export interface Line {
  sku: string;
  qty: number;
}

export const PRODUCTS: readonly Product[] = [
  { sku: "pin", name: "Enamel pin", price: 800 },
  { sku: "tee", name: "Gable tee", price: 2400 },
  { sku: "mug", name: "Hot-reload mug", price: 1500 },
];

const priceOf = (sku: string) => PRODUCTS.find((p) => p.sku === sku)?.price ?? 0;

export const cents = (n: number) => `${n < 0 ? "-" : ""}$${(Math.abs(n) / 100).toFixed(2)}`;

/**
 * A real `@gable/store` store: state, derived values and methods are separate features. `patchState` is the only way
 * to write. `withStorage` keeps the cart in `sessionStorage` (this tab only), so a reload restores it.
 */
export class CartStore extends signalStore(
  withState({ lines: [] as Line[], coupon: false }),
  withStorage("gable-site-demo-cart", { storage: "session", version: 1, debounce: 0 }),
  withComputed((store) => ({
    count: () => store.lines().reduce((n, l) => n + l.qty, 0),
    subtotal: () => store.lines().reduce((sum, l) => sum + priceOf(l.sku) * l.qty, 0),
  })),
  withComputed((store) => ({
    discount: () => (store.coupon() ? Math.round(store.subtotal() * 0.1) : 0),
  })),
  withComputed((store) => ({
    total: () => store.subtotal() - store.discount(),
  })),
  withMethods((store) => ({
    add(sku: string) {
      patchState(store, (s) =>
        s.lines.some((l) => l.sku === sku)
          ? { lines: s.lines.map((l) => (l.sku === sku ? { ...l, qty: l.qty + 1 } : l)) }
          : { lines: [...s.lines, { sku, qty: 1 }] },
      );
    },
    remove(sku: string) {
      patchState(store, (s) => ({ lines: s.lines.flatMap((l) => (l.sku !== sku ? [l] : l.qty > 1 ? [{ ...l, qty: l.qty - 1 }] : [])) }));
    },
    toggleCoupon() {
      patchState(store, (s) => ({ coupon: !s.coupon }));
    },
    clear() {
      patchState(store, { lines: [], coupon: false });
    },
  })),
) {}

/**
 * A cart on a component-scoped store. The JSON on the right is `getState(store)` read live, and the totals below the
 * list are the store's computed values, so both are the real thing, not a mock.
 */
export class StoreDemo {
  static meta = {
    selector: "data-store-demo",
    providers: [CartStore],
    template: html`
<div class="dd-panel dd-split">
  <div>
    <ul class="dd-list" aria-label="Products">
      @for (p of products; track p.sku) {
        <li class="dd-li"><span>{{ p.name }} <span class="mut mono">{{ p.label }}</span></span><button type="button" class="dd-btn" (click)="store.add(p.sku)">Add<span class="dd-sr"> {{ p.name }}</span></button></li>
      }
    </ul>
    <h4 class="dd-h4">Cart ({{ store.count() }})</h4>
    <ul class="dd-list" aria-label="Cart">
      @for (row of rows(); track row.sku) {
        <li class="dd-li"><span>{{ row.name }} x {{ row.qty }}</span><span class="mono">{{ row.total }}</span><button type="button" class="dd-mini" (click)="store.remove(row.sku)" [attr.aria-label]="row.removeLabel">-</button></li>
      } @empty {
        <li class="dd-li mut">Empty. Add something above.</li>
      }
    </ul>
    <label class="dd-chk"><input type="checkbox" [checked]="store.coupon()" (change)="store.toggleCoupon()" /> Coupon: 10% off</label>
    <dl class="dd-tot">
      <dt>Subtotal</dt><dd class="mono">{{ subtotal() }}</dd>
      <dt>Discount</dt><dd class="mono">{{ discount() }}</dd>
      <dt>Total</dt><dd class="mono"><b>{{ total() }}</b></dd>
    </dl>
    <button type="button" class="dd-btn dd-ghost" (click)="store.clear()">Empty cart</button>
  </div>
  <div>
    <div class="dd-lbl">getState(store)</div>
    <pre class="dd-pre" aria-live="polite">{{ json() }}</pre>
    <p class="dd-note">The <span class="mono">withStorage</span> feature saves <span class="mono">lines</span> and <span class="mono">coupon</span> to <span class="mono">sessionStorage</span>, so a reload keeps the cart.</p>
  </div>
</div>
    `,
  };

  store = inject(CartStore);

  products = PRODUCTS.map((p) => ({ ...p, label: cents(p.price) }));

  rows = computed(() =>
    this.store.lines().map((l) => {
      const p = PRODUCTS.find((x) => x.sku === l.sku);
      return { sku: l.sku, qty: l.qty, name: p?.name ?? l.sku, total: cents(priceOf(l.sku) * l.qty), removeLabel: `Remove one ${p?.name ?? l.sku}` };
    }),
  );
  subtotal = computed(() => cents(this.store.subtotal()));
  discount = computed(() => cents(-this.store.discount()));
  total = computed(() => cents(this.store.total()));
  json = computed(() => JSON.stringify(getState(this.store), null, 2));
}
