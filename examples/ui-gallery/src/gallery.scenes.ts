import type { ComponentScenes } from '@gablejs/core/tooling';
import './styles.css';
import { Gallery } from './gallery.js';

export default {
  component: Gallery,
  scenes: { Default: { description: 'Every gable-ui component on one page' } },
} satisfies ComponentScenes<Gallery>;
