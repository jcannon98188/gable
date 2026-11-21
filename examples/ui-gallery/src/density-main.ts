import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { DensityDemo } from './density-demo.js';

// A separate page (`/density.html`) so the main gallery stays untouched.
bootstrap(DensityDemo, { renderer: dom(), target: '#app' });
