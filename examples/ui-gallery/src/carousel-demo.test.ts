import { describe, expect, it } from 'vitest';
import { mount } from '@gable/testing';
import { provideTestDom } from '@gable/ui-primitives/testing';
import { CarouselDemo } from './carousel-demo.js';

describe('carousel demo', () => {
  it('renders two carousels with numbered slides', async () => {
    const app = mount(CarouselDemo, { providers: provideTestDom() });
    await app.settle();
    const carousels = app.queryAll('ui-carousel');
    expect(carousels).toHaveLength(2);
    expect(carousels[0].attrs['aria-roledescription']).toBe('carousel');
    expect(app.queryAll('ui-carousel-item')).toHaveLength(8);
    expect(app.textOf(app.query('#current')!)).toContain('Slide 1 of 4');
  });
});
