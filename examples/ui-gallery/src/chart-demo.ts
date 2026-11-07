import { html } from '@gable/core';
import { UiCard, UiCardContent, UiCardDescription, UiCardHeader, UiCardTitle, UiChart } from '@gable/ui';

/** Every chart type of `<ui-chart>`, drawn as SVG in the theme's `--chart-1` .. `--chart-5` colours. */
export class ChartDemo {
  static meta = {
    selector: 'app-root',
    imports: [UiCard, UiCardHeader, UiCardTitle, UiCardDescription, UiCardContent, UiChart],
    template: html`
      <main class="mx-auto flex max-w-3xl flex-col gap-8 p-8">
        <h1 class="text-2xl font-semibold tracking-tight">Chart</h1>
        <p class="text-sm text-muted-foreground">Hover a column or slice, or Tab into a chart and use the arrow keys.</p>

        <div uiCard>
          <div uiCardHeader>
            <h2 uiCardTitle>Bar chart</h2>
            <p uiCardDescription>Visitors by month, two series</p>
          </div>
          <div uiCardContent>
            <ui-chart type="bar" label="Visitors by month" [data]="months" xKey="month" [series]="visitors" [height]="260"></ui-chart>
          </div>
        </div>

        <div uiCard>
          <div uiCardHeader>
            <h2 uiCardTitle>Stacked bar chart</h2>
            <p uiCardDescription>Click a legend entry to hide a series</p>
          </div>
          <div uiCardContent>
            <ui-chart type="bar" label="Visitors by month, stacked" [data]="months" xKey="month" [series]="visitors" [height]="260" [stacked]="true"></ui-chart>
          </div>
        </div>

        <div uiCard>
          <div uiCardHeader>
            <h2 uiCardTitle>Line chart</h2>
            <p uiCardDescription>The same data as lines</p>
          </div>
          <div uiCardContent>
            <ui-chart type="line" label="Visitors by month, line" [data]="months" xKey="month" [series]="visitors" [height]="260"></ui-chart>
          </div>
        </div>

        <div uiCard>
          <div uiCardHeader>
            <h2 uiCardTitle>Area chart</h2>
            <p uiCardDescription>Negative values and a custom colour</p>
          </div>
          <div uiCardContent>
            <ui-chart type="area" label="Profit by month" [data]="profit" xKey="month" [series]="profitSeries" [height]="260" [showLegend]="false"></ui-chart>
          </div>
        </div>

        <div class="grid gap-8 sm:grid-cols-2">
          <div uiCard>
            <div uiCardHeader>
              <h2 uiCardTitle>Pie chart</h2>
              <p uiCardDescription>Browser share</p>
            </div>
            <div uiCardContent>
              <ui-chart type="pie" label="Browser share" [data]="browsers" xKey="browser" [series]="share" [height]="240"></ui-chart>
            </div>
          </div>
          <div uiCard>
            <div uiCardHeader>
              <h2 uiCardTitle>Donut chart</h2>
              <p uiCardDescription>With the total in the middle</p>
            </div>
            <div uiCardContent>
              <ui-chart type="donut" label="Browser share, donut" [data]="browsers" xKey="browser" [series]="share" [height]="240" totalLabel="Visitors"></ui-chart>
            </div>
          </div>
        </div>
      </main>
    `,
  };

  months = [
    { month: 'January', desktop: 186, mobile: 80 },
    { month: 'February', desktop: 305, mobile: 200 },
    { month: 'March', desktop: 237, mobile: 120 },
    { month: 'April', desktop: 73, mobile: 190 },
    { month: 'May', desktop: 209, mobile: 130 },
    { month: 'June', desktop: 214, mobile: 140 },
  ];
  visitors = [
    { key: 'desktop', label: 'Desktop' },
    { key: 'mobile', label: 'Mobile' },
  ];
  profit = [
    { month: 'January', profit: 40 },
    { month: 'February', profit: -25 },
    { month: 'March', profit: 60 },
    { month: 'April', profit: 15 },
    { month: 'May', profit: -10 },
    { month: 'June', profit: 75 },
  ];
  profitSeries = [{ key: 'profit', label: 'Profit', color: 'var(--chart-2)' }];
  browsers = [
    { browser: 'Chrome', visitors: 275 },
    { browser: 'Safari', visitors: 200 },
    { browser: 'Firefox', visitors: 187 },
    { browser: 'Edge', visitors: 173 },
    { browser: 'Other', visitors: 90 },
  ];
  share = [{ key: 'visitors', label: 'Visitors' }];
}
