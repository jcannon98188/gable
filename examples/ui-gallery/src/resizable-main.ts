import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { ResizableDemo } from './resizable-demo.js';

// A separate page (`/resizable.html`) so the main gallery stays untouched.
bootstrap(ResizableDemo, { renderer: dom(), target: '#app' });
