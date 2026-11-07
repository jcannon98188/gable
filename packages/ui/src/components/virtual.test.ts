import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { queryAll } from "@gable/testing/renderer";
import { UiVirtualList, type VirtualListItem } from "./virtual-list.js";
import { UiVirtualTable, type VirtualTableColumn } from "./virtual-table.js";

const ITEMS: VirtualListItem[] = Array.from({ length: 100_000 }, (_, i) =>
  i % 1000 === 0 ? { id: `h${i}`, label: `Group ${i / 1000}`, header: true } : { id: i, label: `Person ${i}`, description: `Row ${i}` },
);

class ListApp {
  static meta = {
    selector: "app-root",
    imports: [UiVirtualList],
    template: html`<ui-virtual-list class="x-list" label="People" [items]="items()" [itemSize]="40" [(value)]="chosen" [scrollToIndex]="target()" (picked)="picks.push($event.index)"></ui-virtual-list>`,
  };
  items = signal(ITEMS);
  chosen = signal<string | number | null>(null);
  target = signal<number | null>(null);
  picks: number[] = [];
}

const scroll = (f: ReturnType<typeof mount>, top: number) => f.dispatch(f.query(".x-list")!, "scroll", { target: { scrollTop: top, clientHeight: 200 } });

describe("ui-virtual-list", () => {
  it("renders a window of 100,000 rows with list semantics", async () => {
    const f = mount(ListApp);
    await f.settle();
    scroll(f, 0);
    await f.settle();
    const list = f.query(".x-list")!;
    expect(list.attrs.role).toBe("list");
    expect(list.attrs["aria-label"]).toBe("People");
    expect(list.attrs.class).toContain("overflow-auto");
    const rows = f.queryAll("[data-index]");
    expect(rows.length).toBeLessThan(20);
    expect(rows[0]!.attrs).toMatchObject({ role: "listitem", "aria-setsize": "100000", "aria-posinset": "1", "data-index": "0" });
    expect(f.textOf(rows[0]!).trim()).toBe("Group 0");
    expect(f.textOf(rows[1]!)).toContain("Person 1");
  });

  it("pins the group header while its group scrolls", async () => {
    const f = mount(ListApp);
    await f.settle();
    scroll(f, 40 * 2500 + 80);
    await f.settle();
    const rows = f.queryAll("[data-index]");
    const pinned = rows.find((r) => r.attrs.style?.includes("position:sticky"))!;
    expect(pinned.attrs["data-index"]).toBe("2000");
    expect(pinned.attrs.style).toContain("position:sticky");
    expect(f.textOf(pinned).trim()).toBe("Group 2");
    expect(rows.some((r) => r.attrs["data-index"] === "2502")).toBe(true);
  });

  it("scrolls to the index it is given", async () => {
    const f = mount(ListApp);
    await f.settle();
    scroll(f, 0);
    f.instance.target.set(50_000);
    await f.settle();
    expect(f.queryAll("[data-index]").some((r) => r.attrs["data-index"] === "50000")).toBe(true);
  });

  it("picks a row by click and Enter, but not a header", async () => {
    const f = mount(ListApp);
    await f.settle();
    scroll(f, 0);
    await f.settle();
    const rows = f.queryAll("[data-index]");
    f.dispatch(rows[0]!, "click");
    expect(f.instance.picks).toEqual([]);
    f.dispatch(rows[3]!, "click");
    f.dispatch(rows[4]!, "keydown", { key: "Enter", preventDefault() {} });
    await f.settle();
    expect(f.instance.picks).toEqual([3, 4]);
    expect(f.instance.chosen()).toBe(4);
    expect(f.query('[data-index="4"]')!.attrs["aria-current"]).toBe("true");
  });
});

const COLUMNS: VirtualTableColumn[] = [
  { key: "id", label: "ID", width: "80px", align: "right" },
  { key: "name", label: "Name" },
];

class TableApp {
  static meta = {
    selector: "app-root",
    imports: [UiVirtualTable],
    template: html`<ui-virtual-table class="x-table" label="People" rowKey="id" [columns]="columns" [rows]="rows()" [rowHeight]="30"></ui-virtual-table>`,
  };
  columns = COLUMNS;
  rows = signal(Array.from({ length: 100_000 }, (_, i) => ({ id: i + 1, name: `Name ${i + 1}` })));
}

describe("ui-virtual-table", () => {
  it("renders a header row and a window of grid rows with aria counts", async () => {
    const f = mount(TableApp);
    await f.settle();
    f.dispatch(f.query(".x-table")!, "scroll", { target: { scrollTop: 30 * 5000, clientHeight: 270 } });
    await f.settle();
    const table = f.query(".x-table")!;
    expect(table.attrs.role).toBe("grid");
    expect(table.attrs["aria-rowcount"]).toBe("100001");
    expect(f.queryAll("[role=columnheader]").map((h) => f.textOf(h))).toEqual(["ID", "Name"]);
    const rows = f.queryAll("[role=row][data-index]");
    expect(rows.length).toBeLessThan(25);
    const first = rows.find((r) => r.attrs["data-index"] === "5000")!;
    expect(first.attrs["aria-rowindex"]).toBe("5002"); // + header row
    expect(first.attrs.style).toContain("grid-template-columns:80px 1fr");
    expect(queryAll(first, "[role=gridcell]").map((c) => f.textOf(c).trim())).toEqual(["5001", "Name 5001"]);
  });
});

const PROBLEMS: VirtualTableColumn[] = [
  { key: "severity", label: "Severity", width: "90px", kind: "severity" },
  { key: "message", label: "Message", wrap: true },
];

class ProblemsApp {
  static meta = {
    selector: "app-root",
    imports: [UiVirtualTable],
    template: html`<ui-virtual-table class="x-problems" label="Problems" [columns]="columns" [rows]="rows" [rowHeight]="32" [autoHeight]="auto()"></ui-virtual-table>`,
  };
  columns = PROBLEMS;
  rows = Array.from({ length: 50 }, (_, i) => ({ severity: i % 2 ? "warning" : "error", message: `Message ${i} that is rather long and wraps onto several lines in a narrow column` }));
  auto = signal(true);
}

describe("ui-virtual-table with variable height rows", () => {
  it("does not fix the row height, wraps the message and starts from the estimate", async () => {
    const f = mount(ProblemsApp);
    await f.settle();
    f.dispatch(f.query(".x-problems")!, "scroll", { target: { scrollTop: 0, clientHeight: 320 } });
    await f.settle();
    const row = f.queryAll("[role=row][data-index]")[0]!;
    expect(row.attrs.style).not.toContain("height:32px");
    expect(row.attrs.style).toContain("align-items:start");
    const [severity, message] = queryAll(row, "[role=gridcell]");
    expect(message!.attrs.class).toContain("whitespace-normal");
    expect(message!.attrs.class).not.toContain("truncate");
    expect(queryAll(severity!, "span").length).toBe(1);
  });

  it("renders a severity cell as a badge with the severity variant, and a fixed height when autoHeight is off", async () => {
    const f = mount(ProblemsApp);
    await f.settle();
    f.dispatch(f.query(".x-problems")!, "scroll", { target: { scrollTop: 0, clientHeight: 320 } });
    await f.settle();
    const badges = f.queryAll("[role=gridcell] span");
    expect(badges[0]!.attrs.class).toContain("text-destructive");
    expect(badges[1]!.attrs.class).toContain("text-warning");
    expect(f.textOf(badges[1]!)).toBe("warning");
    f.instance.auto.set(false);
    await f.settle();
    expect(f.queryAll("[role=row][data-index]")[0]!.attrs.style).toContain("height:32px");
  });
});
