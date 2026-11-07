import { describe, expect, it } from 'vitest';
import { mountScene } from '@gable/testing';
import scenes from './todo-item.scenes.js';

describe('todo-item scenes', () => {
  it('Active renders an unchecked toggle', () => {
    const view = mountScene(scenes, 'Active');
    expect(view.text()).toContain('Buy milk');
  });

  it('Completed renders the completed class', () => {
    const view = mountScene(scenes, 'Completed');
    expect(view.text()).toContain('Walk the dog');
  });
});
