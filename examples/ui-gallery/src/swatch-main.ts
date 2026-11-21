import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { SwatchDemo } from './swatch-demo.js';

// A separate page (`/swatch.html`) so the main gallery stays untouched.
bootstrap(SwatchDemo, { renderer: dom(), target: '#app' });
