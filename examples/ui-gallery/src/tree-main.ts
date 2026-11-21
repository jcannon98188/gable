import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { TreeDemo } from './tree-demo.js';

// A separate page (`/tree.html`) so the main gallery stays untouched.
bootstrap(TreeDemo, { renderer: dom(), target: '#app' });
