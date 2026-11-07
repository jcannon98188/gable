// The drawer's Storage panel (TASK-56.21): the selected frame's localStorage, sessionStorage and cookies, live as the page
// changes them, with add, edit, delete and clear. Everything shown is read from the page (and, for cookies, over CDP when
// the backend has it: HttpOnly cookies and attributes); nothing is kept by the Designer. Its own keys in the frame's
// storage are left out and counted.
import { computed, html, inject, signal } from "@gable/core";
import type { CookieRow, CookieWrite, SameSite, StorageArea } from "../../../src/storage.js";
import { UiButton } from "../components/ui/button.js";
import { UiDialog } from "../components/ui/dialog.js";
import { UiSwitch } from "../components/ui/switch.js";
import { UiToggleGroup } from "../components/ui/toggle-group.js";
import { UiTooltip } from "../components/ui/tooltip.js";
import { DesignerState } from "./designer-state.js";
import { StorageState } from "./storage-state.js";

/** The most rows the panel builds (filter to find others); the counts are always complete. */
export const MAX_ROWS = 500;
const PREVIEW_CHARS = 300;

export interface StorageRow {
  id: string;
  name: string;
  value: string;
  /** The value, cut for the row (the whole value is in the title and the editor). */
  shown: string;
  meta: string;
  httpOnly: boolean;
  editLabel: string;
  removeLabel: string;
  cookie: CookieRow | null;
}

/** When a cookie expires, as the row says it. */
export function expiresText(expires: number, session: boolean, now = Date.now()): string {
  if (session || expires < 0) return "session";
  const ms = expires * 1000 - now;
  if (ms <= 0) return "expired";
  const d = new Date(expires * 1000);
  return d.toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

/** A cookie row's attributes line: domain, path, expiry, size and flags (or why they are unknown). */
export function cookieMeta(c: CookieRow, now = Date.now()): string {
  if (!c.attributes) return `${c.size} B · attributes need CDP`;
  const flags = [c.httpOnly ? "HttpOnly" : "", c.secure ? "Secure" : "", c.sameSite ? `SameSite=${c.sameSite}` : ""].filter(Boolean);
  return [c.domain, c.path, expiresText(c.expires, c.session, now), `${c.size} B`, ...flags].join(" · ");
}

/** The rows of `area` (or the cookies) that match `filter` (name or value, case-insensitive). */
export function storageRows(items: Array<{ key: string; value: string }> | null, cookies: CookieRow[] | null, filter: string): StorageRow[] {
  const f = filter.trim().toLowerCase();
  const keep = (name: string, value: string) => !f || name.toLowerCase().includes(f) || value.toLowerCase().includes(f);
  const cut = (v: string) => (v.length > PREVIEW_CHARS ? v.slice(0, PREVIEW_CHARS) + "…" : v);
  if (cookies) {
    return cookies
      .filter((c) => keep(c.name, c.value))
      .map((c, i) => ({
        id: c.attributes ? `${c.name}|${c.domain}|${c.path}` : `${c.name}|${i}`,
        name: c.name,
        value: c.value,
        shown: cut(c.value),
        meta: cookieMeta(c),
        httpOnly: c.attributes && c.httpOnly,
        editLabel: `Edit the cookie ${c.name}`,
        removeLabel: `Delete the cookie ${c.name}`,
        cookie: c,
      }));
  }
  return (items ?? [])
    .filter((it) => keep(it.key, it.value))
    .map((it) => ({ id: it.key, name: it.key, value: it.value, shown: cut(it.value), meta: `${it.value.length} chars`, httpOnly: false, editLabel: `Edit ${it.key}`, removeLabel: `Remove ${it.key}`, cookie: null }));
}

const SAME_SITE_OPTIONS = [
  { value: "", label: "Not set (the browser's default)" },
  { value: "Lax", label: "Lax" },
  { value: "Strict", label: "Strict" },
  { value: "None", label: "None (needs Secure)" },
];

export class StoragePanel {
  static meta = {
    selector: "app-storage-panel",
    host: { class: "flex h-full min-h-0 flex-col" },
    imports: [UiButton, UiDialog, UiSwitch, UiToggleGroup, UiTooltip],
    template: html`
      <div class="dbar">
        <ui-toggle-group class="seg small" data-part="st-area" [items]="areaItems()" [(value)]="areaPick" type="single" variant="outline" size="sm"></ui-toggle-group>
        <span class="dim mono truncate" data-part="st-origin" [attr.title]="origin()">{{ origin() }}</span>
        <span class="spacer"></span>
        <input class="fld st-filter" placeholder="Filter by name or value" aria-label="Filter by name or value" data-part="st-filter" [value]="filter()" (input)="filter.set($event.currentTarget.value)" />
        <button uiButton variant="outline" size="sm" class="btn sm" data-part="st-add" [disabled]="!canWrite()" (click)="openAdd()">{{ addText() }}</button>
        @if (!isCookies()) {
          <button uiButton variant="ghost" size="sm" class="btn sm" data-part="st-clear" [disabled]="!canWrite() || !count()" (click)="clearOpen.set(true)">Clear</button>
        }
        <button uiButton variant="ghost" size="sm" class="btn sm" data-part="st-refresh" [disabled]="!ready()" (click)="store.refresh()">Refresh</button>
      </div>
      @if (store.error(); as e) {
        <p class="callout err" role="alert" data-part="st-error">The frame's storage could not be read: {{ e }}</p>
      }
      @if (areaError(); as e) {
        <p class="callout warn" role="status" data-part="st-area-error">{{ e }}</p>
      }
      @if (isCookies()) {
        <div class="dbar">
          @if (viaCdp()) {
            <span class="chip ok" data-part="st-cookies-via">Every cookie of the frame, HttpOnly included (CDP)</span>
          } @else {
            <span class="chip off" data-part="st-cookies-via" tabindex="0" [uiTooltip]="cookieNote()">The page's cookies only: HttpOnly unavailable</span>
          }
        </div>
        @if (thirdParty()) {
          <p class="callout warn" role="status" data-part="st-third-party">{{ thirdParty() }}</p>
        }
      }
      @if (actionError()) {
        <p class="callout err" role="alert" data-part="st-action-error">{{ actionError() }}</p>
      }
      <div class="min-h-0 flex-1 overflow-auto" role="table" [attr.aria-label]="tableLabel()" data-part="st-table">
        <!-- TODO(gable-ui): UiVirtualTable has no row actions or selection, so this is a plain table capped at MAX_ROWS rows. -->
        @for (r of rows(); track r.id) {
          <div class="tbl-row st-row" role="row" data-part="st-row" [attr.data-name]="r.name">
            <span class="mono truncate" role="cell" [attr.title]="r.name">{{ r.name }}</span>
            <span class="mono truncate" role="cell" data-part="st-value" [attr.title]="r.value">{{ r.shown }}</span>
            <span class="dim truncate" role="cell" [attr.title]="r.meta">{{ r.meta }}</span>
            <span class="net-actions" role="cell">
              <button uiButton variant="ghost" size="sm" class="btn sm" data-part="st-row-edit" [attr.aria-label]="r.editLabel" [disabled]="!canWrite()" (click)="openEdit(r)">Edit</button>
              <button uiButton variant="ghost" size="sm" class="btn sm" data-part="st-row-remove" [attr.aria-label]="r.removeLabel" [disabled]="!canWrite()" (click)="remove(r)">Delete</button>
            </span>
          </div>
        } @empty {
          <div class="empty" data-part="st-empty"><strong>{{ emptyTitle() }}</strong>{{ emptyText() }}</div>
        }
        @if (more()) {
          <p class="dim net-pad" data-part="st-more">{{ more() }}</p>
        }
      </div>
      @if (hiddenText()) {
        <p class="dim net-pad" data-part="st-hidden">{{ hiddenText() }}</p>
      }

      <ui-dialog [(open)]="itemOpen" [heading]="itemHeading()" description="Written into the frame's storage at once, as the page's own code would; the page sees it on its next read." contentClass="dlg">
        <label class="form-row"><span>Key</span>
          <input class="fld mono" aria-label="Key" data-part="st-key" [value]="itemKey()" (input)="itemKey.set($event.currentTarget.value)" />
        </label>
        <label class="form-row net-body-row"><span>Value</span>
          <!-- TODO(gable-ui): there is no textarea component; a styled native textarea stands in. -->
          <textarea class="fld mono net-body" rows="8" aria-label="Value" data-part="st-value-input" [value]="itemValue()" (input)="itemValue.set($event.currentTarget.value)"></textarea>
        </label>
        @if (dialogError()) {
          <p class="callout err" role="alert" data-part="st-dialog-error">{{ dialogError() }}</p>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="itemOpen.set(false)">Cancel</button>
          <button uiButton size="sm" class="btn" data-part="st-submit" (click)="saveItem()">Save</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="cookieOpen" [heading]="cookieHeading()" [description]="cookieDescription()" contentClass="dlg">
        <label class="form-row"><span>Name</span>
          <input class="fld mono" aria-label="Cookie name" data-part="st-c-name" [value]="cName()" (input)="cName.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Value</span>
          <input class="fld mono" aria-label="Cookie value" data-part="st-c-value" [value]="cValue()" (input)="cValue.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>Path</span>
          <input class="fld mono" placeholder="/" aria-label="Cookie path" data-part="st-c-path" [value]="cPath()" (input)="cPath.set($event.currentTarget.value)" />
        </label>
        @if (viaCdp()) {
          <label class="form-row"><span>Domain</span>
            <input class="fld mono" placeholder="The frame's host" aria-label="Cookie domain" data-part="st-c-domain" [value]="cDomain()" (input)="cDomain.set($event.currentTarget.value)" />
          </label>
        }
        <label class="form-row"><span>Max age (s)</span>
          <input class="fld" type="number" placeholder="Session cookie" aria-label="Max age in seconds" data-part="st-c-maxage" [value]="cMaxAge()" (input)="cMaxAge.set($event.currentTarget.value)" />
        </label>
        <label class="form-row"><span>SameSite</span>
          <select class="fld" aria-label="SameSite" data-part="st-c-samesite" (change)="cSameSite.set($event.currentTarget.value)">
            @for (o of sameSiteOptions; track o.value) {
              <option [value]="o.value" [selected]="o.value === cSameSite()">{{ o.label }}</option>
            }
          </select>
        </label>
        <div class="form-row"><span>Flags</span>
          <span class="flex gap-3">
            <ui-switch data-part="st-c-secure" [(value)]="cSecure">Secure</ui-switch>
            @if (viaCdp()) {
              <ui-switch data-part="st-c-httponly" [(value)]="cHttpOnly">HttpOnly</ui-switch>
            } @else {
              <span class="chip off" tabindex="0" data-part="st-c-httponly-off" [uiTooltip]="cookieNote()">HttpOnly unavailable</span>
            }
          </span>
        </div>
        @if (dialogError()) {
          <p class="callout err" role="alert" data-part="st-dialog-error">{{ dialogError() }}</p>
        }
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="cookieOpen.set(false)">Cancel</button>
          <button uiButton size="sm" class="btn" data-part="st-c-submit" (click)="saveCookie()">Save</button>
        </div>
      </ui-dialog>

      <ui-dialog [(open)]="clearOpen" [heading]="clearHeading()" description="The Designer's own keys stay. This cannot be undone: the values are not kept anywhere." contentClass="dlg">
        <div slot="footer" class="flex justify-end gap-2">
          <button uiButton variant="outline" size="sm" class="btn" (click)="clearOpen.set(false)">Cancel</button>
          <button uiButton variant="destructive" size="sm" class="btn" data-part="st-clear-confirm" (click)="clearArea()">Clear</button>
        </div>
      </ui-dialog>
    `,
  };
  store = inject(StorageState);
  state = inject(DesignerState);
  sameSiteOptions = SAME_SITE_OPTIONS;

  ready = computed(() => this.state.connection() === "ready");
  canWrite = computed(() => this.ready() && !!this.store.current());
  areaPick = signal<string[]>(["local"]);
  area = computed(() => (this.areaPick()[0] ?? "local") as StorageArea | "cookies");
  isCookies = computed(() => this.area() === "cookies");
  viaCdp = computed(() => this.store.current()?.cookiesVia === "cdp");
  cookieNote = computed(() => this.store.current()?.cookieNote ?? "");
  thirdParty = computed(() => this.store.current()?.thirdParty ?? "");
  filter = signal("");
  actionError = signal("");

  areaItems = computed(() => {
    const c = this.store.current();
    const n = (list: unknown[] | null | undefined) => (list ? ` (${list.length})` : "");
    return [
      { value: "local", label: `Local storage${n(c?.snapshot.local)}` },
      { value: "session", label: `Session storage${n(c?.snapshot.session)}` },
      { value: "cookies", label: `Cookies${n(c?.cookies)}` },
    ];
  });
  origin = computed(() => this.store.current()?.snapshot.origin ?? "");
  #all = computed(() => {
    const c = this.store.current();
    if (!c) return [];
    const a = this.area();
    return storageRows(a === "cookies" ? null : a === "local" ? c.snapshot.local : c.snapshot.session, a === "cookies" ? c.cookies : null, this.filter());
  });
  rows = computed(() => this.#all().slice(0, MAX_ROWS));
  more = computed(() => {
    const n = this.#all().length - MAX_ROWS;
    return n > 0 ? `${n} more not shown: filter to find them.` : "";
  });
  count = computed(() => {
    const c = this.store.current();
    const a = this.area();
    if (!c) return 0;
    return (a === "cookies" ? c.cookies : (a === "local" ? c.snapshot.local : c.snapshot.session) ?? []).length;
  });
  areaError = computed(() => {
    const c = this.store.current();
    const a = this.area();
    if (!c) return null;
    const e = a === "cookies" ? c.snapshot.errors.cookies : c.snapshot.errors[a];
    return e ? `The page cannot use ${a === "cookies" ? "cookies" : `${a}Storage`}: ${e}` : null;
  });
  tableLabel = computed(() => (this.isCookies() ? "Cookies" : this.area() === "local" ? "Local storage" : "Session storage"));
  addText = computed(() => (this.isCookies() ? "Add cookie" : "Add item"));
  emptyTitle = computed(() => (!this.store.current() ? "Reading the frame's storage…" : this.filter().trim() ? "Nothing matches the filter" : this.isCookies() ? "No cookies" : "No items"));
  emptyText = computed(() => {
    if (!this.store.current() || this.filter().trim()) return "";
    return this.isCookies() ? "The frame has no cookies for its URL. Add one, or let the app set them." : "The page has stored nothing here. Changes the app makes appear as they happen.";
  });
  hiddenText = computed(() => {
    const h = this.store.current()?.snapshot.hidden ?? 0;
    return h && !this.isCookies() ? `${h} key${h === 1 ? "" : "s"} of the Designer's own (its session, network condition, recording) left out.` : "";
  });

  async #run(body: () => Promise<unknown>): Promise<string | null> {
    this.actionError.set("");
    try {
      await body();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  }

  // --- items ---------------------------------------------------------------------------------------------------------------
  itemOpen = signal(false);
  itemFrom = signal<string | null>(null);
  itemKey = signal("");
  itemValue = signal("");
  dialogError = signal("");
  itemHeading = computed(() => {
    const where = this.area() === "local" ? "localStorage" : "sessionStorage";
    return this.itemFrom() === null ? `Add to ${where}` : `Edit ${where} item`;
  });

  openAdd(): void {
    this.dialogError.set("");
    if (this.isCookies()) return this.#openCookie(null);
    this.itemFrom.set(null);
    this.itemKey.set("");
    this.itemValue.set("");
    this.itemOpen.set(true);
  }

  openEdit(r: StorageRow): void {
    this.dialogError.set("");
    if (r.cookie) return this.#openCookie(r.cookie);
    this.itemFrom.set(r.name);
    this.itemKey.set(r.name);
    this.itemValue.set(r.value);
    this.itemOpen.set(true);
  }

  async saveItem(): Promise<void> {
    const area = this.area();
    if (area === "cookies") return;
    const key = this.itemKey();
    if (!key) return this.dialogError.set("An item needs a key.");
    const from = this.itemFrom();
    const error = await this.#run(() => (from !== null && from !== key ? this.store.renameItem(area, from, key, this.itemValue()) : this.store.setItem(area, key, this.itemValue())));
    if (error) return this.dialogError.set(error);
    this.itemOpen.set(false);
  }

  async remove(r: StorageRow): Promise<void> {
    const area = this.area();
    const error = await this.#run(() => (r.cookie ? this.store.deleteCookie(r.cookie.attributes ? { name: r.name, path: r.cookie.path, domain: r.cookie.domain } : { name: r.name }) : area === "cookies" ? Promise.resolve() : this.store.removeItem(area, r.name)));
    if (error) this.actionError.set(error);
  }

  clearOpen = signal(false);
  clearHeading = computed(() => `Clear ${this.count()} item${this.count() === 1 ? "" : "s"} of ${this.area() === "local" ? "localStorage" : "sessionStorage"}?`);
  async clearArea(): Promise<void> {
    const area = this.area();
    if (area === "cookies") return;
    const error = await this.#run(() => this.store.clear(area));
    this.clearOpen.set(false);
    if (error) this.actionError.set(error);
  }

  // --- cookies -------------------------------------------------------------------------------------------------------------
  cookieOpen = signal(false);
  cookieFrom = signal<CookieRow | null>(null);
  cName = signal("");
  cValue = signal("");
  cPath = signal("");
  cDomain = signal("");
  cMaxAge = signal("");
  cSameSite = signal("");
  cSecure = signal(false);
  cHttpOnly = signal(false);
  cookieHeading = computed(() => (this.cookieFrom() ? `Edit cookie ${this.cookieFrom()!.name}` : "Add cookie"));
  cookieDescription = computed(() =>
    this.viaCdp()
      ? "Written for the frame's URL over CDP, as a server's Set-Cookie would."
      : "Written through document.cookie, as the page's own code would. A cookie on another path than this one is a separate cookie.",
  );

  #openCookie(c: CookieRow | null): void {
    this.cookieFrom.set(c);
    this.cName.set(c?.name ?? "");
    this.cValue.set(c?.value ?? "");
    this.cPath.set(c?.attributes ? c.path : "");
    this.cDomain.set("");
    const left = c?.attributes && !c.session && c.expires > 0 ? Math.max(0, Math.round(c.expires - Date.now() / 1000)) : null;
    this.cMaxAge.set(left === null ? "" : String(left));
    // Unknown attributes in a third-party frame default to the only ones it keeps (see thirdPartyNote).
    const thirdParty = !c?.attributes && !!this.thirdParty();
    this.cSameSite.set(c?.attributes ? (c.sameSite ?? "") : thirdParty ? "None" : "");
    this.cSecure.set(c?.attributes ? c.secure : thirdParty);
    this.cHttpOnly.set(c?.attributes ? c.httpOnly : false);
    this.cookieOpen.set(true);
  }

  async saveCookie(): Promise<void> {
    const from = this.cookieFrom();
    const maxAge = this.cMaxAge().trim() === "" ? null : Number(this.cMaxAge());
    if (maxAge !== null && !Number.isFinite(maxAge)) return this.dialogError.set("Max age is a number of seconds (empty for a session cookie).");
    const cookie: CookieWrite = {
      name: this.cName().trim(),
      value: this.cValue(),
      ...(this.cPath().trim() ? { path: this.cPath().trim() } : {}),
      ...(this.viaCdp() && this.cDomain().trim() ? { domain: this.cDomain().trim() } : {}),
      maxAge,
      ...(this.cSameSite() ? { sameSite: this.cSameSite() as SameSite } : {}),
      secure: this.cSecure(),
      ...(this.viaCdp() ? { httpOnly: this.cHttpOnly() } : {}),
    };
    const error = await this.#run(async () => {
      // A renamed or moved cookie is another cookie: the old one is deleted first.
      const moved = from && (from.name !== cookie.name || (from.attributes && from.path !== (cookie.path ?? "/")));
      if (from && moved) await this.store.deleteCookie(from.attributes ? { name: from.name, path: from.path, domain: from.domain } : { name: from.name });
      await this.store.setCookie(cookie);
    });
    if (error) return this.dialogError.set(error);
    this.cookieOpen.set(false);
  }
}
