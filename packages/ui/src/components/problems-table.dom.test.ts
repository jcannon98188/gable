// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { html } from "@gable/core";
import { expectNoA11yViolations } from "@gable/testing/a11y";
import { UiBadge } from "./badge.js";
import { UiTable, UiTableBody, UiTableCell, UiTableContainer, UiTableHead, UiTableHeader, UiTableRow } from "./table.js";
import { UiVirtualTable, type VirtualTableColumn } from "./virtual-table.js";
import { $, useDomApp } from "../test-utils.js";

Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 300 });

const COLUMNS: VirtualTableColumn[] = [
  { key: "severity", label: "Severity", width: "90px", kind: "severity" },
  { key: "message", label: "Message", wrap: true },
];

class App {
  static meta = {
    selector: "app-root",
    imports: [UiVirtualTable, UiBadge, UiTable, UiTableBody, UiTableCell, UiTableContainer, UiTableHead, UiTableHeader, UiTableRow],
    template: html`
      <ui-virtual-table label="Problems" [columns]="columns" [rows]="rows" [rowHeight]="32" [autoHeight]="true" class="h-80"></ui-virtual-table>
      <div uiTableContainer>
        <table uiTable aria-label="Problems table">
          <thead uiTableHeader><tr uiTableRow><th uiTableHead>Severity</th><th uiTableHead>Message</th></tr></thead>
          <tbody uiTableBody><tr uiTableRow><td uiTableCell><span uiBadge variant="warning">warning</span></td><td uiTableCell [wrap]="true" class="msg">A long message that wraps</td></tr></tbody>
        </table>
      </div>
    `,
  };
  columns = COLUMNS;
  rows = Array.from({ length: 30 }, (_, i) => ({ severity: ["error", "warning", "info", "success"][i % 4], message: `Problem ${i}: ${"word ".repeat(i % 7 === 0 ? 40 : 3)}` }));
}

const boot = useDomApp();

describe("problems tables", () => {
  it("shows severity badges as the leading cell, wraps messages and has no axe violations", async () => {
    await boot(App);
    const grid = $("ui-virtual-table");
    const firstRow = grid.querySelector("[role=row][data-index]") as HTMLElement;
    expect(firstRow.style.height).toBe("");
    const badge = firstRow.querySelector("[role=gridcell] span")!;
    expect(badge.textContent).toBe("error");
    expect(badge.className).toContain("text-destructive");
    expect(firstRow.querySelectorAll("[role=gridcell]")[1]!.className).toContain("whitespace-normal");
    expect($(".msg").className).toContain("whitespace-normal");
    expect($(".msg").className).not.toContain("whitespace-nowrap");
    await expectNoA11yViolations(document.body);
  });
});
