import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { Gallery } from './gallery.js';

const start = async () => {
  const app = mount(Gallery, { providers: provideTestDom() });
  await app.settle();
  return app;
};

describe('gable-ui gallery', () => {
  it('shows all six components', async () => {
    const app = await start();
    expect(app.queryAll('button').length).toBeGreaterThan(10); // buttons
    expect(app.query('[role=dialog]')).not.toBeNull();
    expect(app.query('[role=combobox]')).not.toBeNull(); // select
    expect(app.queryAll('[role=tab]').map((t) => app.textOf(t).trim().replace(/\s+/g, ' '))).toEqual(['Account', 'Password', 'Billing', 'Inbox 12', 'Sent']);
    expect(app.queryAll('[role=tooltip]')).toHaveLength(4);
  });

  it('counts button clicks', async () => {
    const app = await start();
    const count = app.queryAll('button').find((b) => app.textOf(b).trim() === 'Count')!;
    app.dispatch(count, 'click');
    await app.settle();
    expect(app.text()).toContain('Clicked 1 times.');
  });

  it('starts with the dialog closed and the first tab selected', async () => {
    const app = await start();
    expect(app.query('[role=dialog]')!.attrs.hidden).toBe('');
    expect(app.query('[role=tab]')!.attrs['aria-selected']).toBe('true');
  });

  it("renders the form controls, display and navigation components", async () => {
    const app = await start();
    expect(app.query("ui-switch"), "switch").not.toBeNull();
    expect(app.query("ui-radio-group")).not.toBeNull();
    expect(app.query("[role=slider]"), "slider").not.toBeNull();
    expect(app.query("[role=progressbar]"), "progressbar").not.toBeNull();
    expect(app.query("[role=alert]"), "alert").not.toBeNull(); // the Alert (field errors are hidden until touched)
    expect(app.query("[role=alertdialog]"), "alertdialog").not.toBeNull();
    expect(app.query("table"), "table").not.toBeNull();
    expect(app.query("[role=menu]"), "menu").not.toBeNull();
    expect(app.text()).toContain("Result: not submitted");
  });

  it("shows field errors after submitting an empty form", async () => {
    const app = await start();
    app.dispatch(app.query("form")!, "submit", { preventDefault: () => {} });
    await app.settle();
    expect(app.text()).toContain("This field is required.");
  });
});
