import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { SwatchDemo } from './swatch-demo.js';

// A separate page (`/swatch.html`) so the main gallery stays untouched.
bootstrap(SwatchDemo, { renderer: dom(), target: '#app' });
