import { describe, expect, it } from 'vitest';
import { mountScene } from '@gable/testing';
import scenes from './http-demo.scenes.js';

describe('UserList scenes (the HTTP mocks answer; the test answers nothing by hand)', () => {
  it('Loaded lists the users', async () => {
    const view = mountScene(scenes, 'Loaded');
    await view.settle();
    expect(view.text()).toContain('Grace Hopper');
    expect(view.queryAll('li')).toHaveLength(3);
  });

  it('Empty says so', async () => {
    const view = mountScene(scenes, 'Empty');
    await view.settle();
    expect(view.text()).toContain('No users yet.');
  });

  it('Server error and Offline show the failure', async () => {
    const a = mountScene(scenes, 'Server error');
    await a.settle();
    expect(a.text()).toContain('HTTP 500');
    const b = mountScene(scenes, 'Offline');
    await b.settle();
    expect(b.text()).toContain('HTTP network error');
  });
});
