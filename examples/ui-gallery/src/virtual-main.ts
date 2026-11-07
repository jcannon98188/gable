import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { VirtualDemo } from './virtual-demo.js';

// A separate page (`/virtual.html`) so the main gallery stays untouched.
bootstrap(VirtualDemo, { renderer: dom(), target: '#app' });
