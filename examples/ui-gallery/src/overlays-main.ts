import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { OverlaysDemo } from './overlays-demo.js';

// A separate page (`/overlays.html`) so the main gallery stays untouched.
bootstrap(OverlaysDemo, { renderer: dom(), target: '#app' });
