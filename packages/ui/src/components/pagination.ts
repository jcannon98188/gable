import { computed, html, inject, input, model } from "@gable/core";
import { PaginationState, UiProps } from "@gable/ui-primitives";
import { cn } from "../lib/cn.js";
import { UiIcon } from "../lib/icon.js";
import { buttonVariants } from "./button.js";

/**
 * Page navigation.
 *
 *   <ui-pagination [(page)]="page" [count]="240" [pageSize]="20" [siblingCount]="1"></ui-pagination>
 *
 * `count` is the number of items; the page numbers, ellipses and the previous/next buttons come from Zag's pagination
 * machine. The current page has `aria-current="page"`.
 */
export class UiPagination {
  static meta = {
    selector: "ui-pagination",
    host: { class: "mx-auto flex w-full justify-center" },
    providers: [PaginationState],
    imports: [UiProps, UiIcon],
    template: html`
      <nav [uiProps]="rootProps()" class="mx-auto flex w-full justify-center">
        <ul class="flex flex-row items-center gap-1">
          <li>
            <button [uiProps]="prevProps()" [attr.class]="prevClasses()"><svg uiIcon="chevron-left" class="size-4"></svg><span class="hidden sm:block">Previous</span></button>
          </li>
          @for (row of rows(); track row.key) {
            <li>
              @if (row.type === 'page') {
                <button [uiProps]="row.props" [attr.class]="row.classes">{{ row.value }}</button>
              }
              @if (row.type === 'ellipsis') {
                <span [uiProps]="row.props" class="flex size-9 items-center justify-center"><svg uiIcon="ellipsis" class="size-4"></svg><span class="sr-only">More pages</span></span>
              }
            </li>
          }
          <li>
            <button [uiProps]="nextProps()" [attr.class]="nextClasses()"><span class="hidden sm:block">Next</span><svg uiIcon="chevron-right" class="size-4"></svg></button>
          </li>
        </ul>
      </nav>
    `,
  };

  /** Two-way, 1-based: `[(page)]="page"`. */
  page = model(1);
  count = input<number>(0);
  pageSize = input<number>(10);
  siblingCount = input<number>(1);

  state = inject(PaginationState).bind(() => ({
    page: this.page(),
    count: this.count(),
    pageSize: this.pageSize(),
    siblingCount: this.siblingCount(),
    onPageChange: (details) => this.page.set(details.page),
  }));
  rootProps = computed(() => this.state.api().getRootProps());
  prevProps = computed(() => this.state.api().getPrevTriggerProps());
  nextProps = computed(() => this.state.api().getNextTriggerProps());
  prevClasses = computed(() => cn(buttonVariants({ variant: "ghost", size: "default", class: "gap-1 px-2.5 sm:pl-2.5" }), this.state.api().previousPage === null && "pointer-events-none opacity-50"));
  nextClasses = computed(() => cn(buttonVariants({ variant: "ghost", size: "default", class: "gap-1 px-2.5 sm:pr-2.5" }), this.state.api().nextPage === null && "pointer-events-none opacity-50"));
  rows = computed(() => {
    const api = this.state.api();
    return api.pages.map((entry, index) =>
      entry.type === "page"
        ? {
            key: `p${entry.value}`,
            type: "page" as const,
            value: entry.value,
            props: api.getItemProps(entry),
            classes: buttonVariants({ variant: entry.value === api.page ? "outline" : "ghost", size: "icon" }),
          }
        : { key: `e${index}`, type: "ellipsis" as const, value: 0, props: api.getEllipsisProps({ index }), classes: "" },
    );
  });
}
