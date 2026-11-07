import { describe, expect, it } from "vitest";
import { html, signal } from "@gable/core";
import { mount } from "@gable/testing";
import { UiAlert, UiAlertDescription, UiAlertTitle } from "./alert.js";
import { UiBadge } from "./badge.js";
import { UiBreadcrumb, UiBreadcrumbEllipsis, UiBreadcrumbItem, UiBreadcrumbLink, UiBreadcrumbList, UiBreadcrumbPage, UiBreadcrumbSeparator } from "./breadcrumb.js";
import { UiCard, UiCardContent, UiCardDescription, UiCardFooter, UiCardHeader, UiCardTitle } from "./card.js";
import { UiInput } from "./input.js";
import { UiLabel } from "./label.js";
import { UiSeparator } from "./separator.js";
import { UiSkeleton } from "./skeleton.js";
import { UiTable, UiTableBody, UiTableCaption, UiTableCell, UiTableContainer, UiTableFooter, UiTableHead, UiTableHeader, UiTableRow } from "./table.js";
import { UiTextarea } from "./textarea.js";

class App {
  static meta = {
    selector: "app-root",
    imports: [
      UiAlert, UiAlertTitle, UiAlertDescription, UiBadge, UiBreadcrumb, UiBreadcrumbList, UiBreadcrumbItem, UiBreadcrumbLink, UiBreadcrumbPage, UiBreadcrumbSeparator, UiBreadcrumbEllipsis,
      UiCard, UiCardHeader, UiCardTitle, UiCardDescription, UiCardContent, UiCardFooter, UiInput, UiLabel, UiSeparator, UiSkeleton, UiTextarea,
      UiTable, UiTableContainer, UiTableHeader, UiTableBody, UiTableFooter, UiTableRow, UiTableHead, UiTableCell, UiTableCaption,
    ],
    template: html`
      <label uiLabel for="email" class="x-label">Email</label>
      <input uiInput id="email" [value]="text()" class="x-input" />
      <textarea uiTextarea class="x-textarea"></textarea>
      <span uiBadge variant="destructive" class="x-badge">New</span>
      <div uiCard class="x-card"><div uiCardHeader><h3 uiCardTitle>Title</h3><p uiCardDescription>Desc</p></div><div uiCardContent>Body</div><div uiCardFooter>Foot</div></div>
      <div uiAlert variant="destructive" class="x-alert"><div uiAlertTitle>Oops</div><div uiAlertDescription>Bad</div></div>
      <div uiSeparator class="x-sep"></div>
      <div uiSeparator orientation="vertical" [decorative]="false" class="x-vsep"></div>
      <div uiSkeleton class="x-skel h-4"></div>
      <div uiTableContainer><table uiTable><caption uiTableCaption>Caption</caption><thead uiTableHeader><tr uiTableRow><th uiTableHead>Name</th></tr></thead><tbody uiTableBody><tr uiTableRow><td uiTableCell>Ada</td></tr></tbody><tfoot uiTableFooter><tr uiTableRow><td uiTableCell>Total</td></tr></tfoot></table></div>
      <nav uiBreadcrumb><ol uiBreadcrumbList><li uiBreadcrumbItem><a uiBreadcrumbLink href="/">Home</a></li><ui-breadcrumb-separator></ui-breadcrumb-separator><li uiBreadcrumbItem><ui-breadcrumb-ellipsis></ui-breadcrumb-ellipsis></li><ui-breadcrumb-separator></ui-breadcrumb-separator><li uiBreadcrumbItem><span uiBreadcrumbPage>Now</span></li></ol></nav>
    `,
  };
  text = signal("");
}

const start = async () => {
  const f = mount(App);
  await f.settle();
  return f;
};

describe("display components", () => {
  it("style their elements and let the element's class win conflicts", async () => {
    const f = await start();
    expect(f.query(".x-input")!.attrs.class).toContain("rounded-md");
    expect(f.query("label")!.attrs.class).toContain("text-sm");
    expect(f.query(".x-textarea")!.attrs.class).toContain("min-h-16");
    expect(f.query(".x-badge")!.attrs.class).toContain("bg-destructive");
    expect(f.query(".x-badge")!.attrs.class).not.toContain("bg-primary");
    expect(f.query(".x-skel")!.attrs.class).toContain("animate-pulse");
    expect(f.query(".x-card")!.attrs.class).toContain("bg-card");
  });

  it("adds roles and aria state", async () => {
    const f = await start();
    expect(f.query(".x-alert")!.attrs.role).toBe("alert");
    expect(f.query(".x-sep")!.attrs).toMatchObject({ role: "none", "data-orientation": "horizontal" });
    expect(f.query(".x-vsep")!.attrs).toMatchObject({ role: "separator", "aria-orientation": "vertical" });
    expect(f.query("nav")!.attrs["aria-label"]).toBe("breadcrumb");
    expect(f.query("[aria-current=page]")!.attrs.role).toBe("link");
    expect(f.queryAll("ui-breadcrumb-separator svg")).toHaveLength(2);
    expect(f.queryAll("ui-breadcrumb-ellipsis svg")).toHaveLength(1);
  });

  it("styles every table part", async () => {
    const f = await start();
    for (const part of ["table", "caption", "thead", "tbody", "tfoot", "tr", "th", "td"]) expect(f.query(part)!.attrs.class, part).toBeTruthy();
    expect(f.queryAll("tr")).toHaveLength(3);
  });
});
