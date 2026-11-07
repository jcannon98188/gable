import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { DensityDemo } from './density-demo.js';

// A separate page (`/density.html`) so the main gallery stays untouched.
bootstrap(DensityDemo, { renderer: dom(), target: '#app' });
