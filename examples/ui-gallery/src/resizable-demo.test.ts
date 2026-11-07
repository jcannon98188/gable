import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { ResizableDemo } from './resizable-demo.js';

const boot = async () => {
  const app = mount(ResizableDemo, { providers: provideTestDom() });
  await app.settle();
  return app;
};

describe('resizable demo', () => {
  it('renders nested groups with a splitter per pair of panels', async () => {
    const app = await boot();
    expect(app.queryAll('ui-resizable-panel-group')).toHaveLength(5);
    expect(app.queryAll('[role=separator]')).toHaveLength(6);
    expect(app.textOf(app.query('#layout')!)).toContain('Layout: 50 / 50');
  });

  it('cascades a resize into the next panel once the middle one hits its minimum', async () => {
    const app = await boot();
    const handle = app.query('[aria-label="Resize A and B"]')!;
    expect(app.textOf(app.query('#cascade-layout')!)).toContain('Layout: 34 / 33 / 33');
    for (let i = 0; i < 3; i++) app.dispatch(handle, 'keydown', { key: 'ArrowRight', preventDefault: () => {} });
    await app.settle();
    // A grew by 30; B stopped at its minimum of 20 and C gave up the rest.
    expect(app.textOf(app.query('#cascade-layout')!)).toContain('Layout: 64 / 20 / 16');
  });
});
