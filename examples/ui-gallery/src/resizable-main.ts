import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { ResizableDemo } from './resizable-demo.js';

// A separate page (`/resizable.html`) so the main gallery stays untouched.
bootstrap(ResizableDemo, { renderer: dom(), target: '#app' });
