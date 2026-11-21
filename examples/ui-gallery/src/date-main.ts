import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { DateDemo } from './date-demo.js';

// A separate page (`/date.html`) so the main gallery stays untouched.
bootstrap(DateDemo, { renderer: dom(), target: '#app' });
