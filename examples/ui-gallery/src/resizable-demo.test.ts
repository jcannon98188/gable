import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { ResizableDemo } from './resizable-demo.js';

describe('resizable demo', () => {
  it('renders nested groups with a splitter per pair of panels', async () => {
    const app = mount(ResizableDemo, { providers: provideTestDom() });
    await app.settle();
    expect(app.queryAll('ui-resizable-panel-group')).toHaveLength(3);
    expect(app.queryAll('[role=separator]')).toHaveLength(3);
    expect(app.textOf(app.query('#layout')!)).toContain('Layout: 50 / 50');
  });
});
