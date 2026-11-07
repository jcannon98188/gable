import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { ToastDemo } from './toast-demo.js';

// A separate page (`/toast.html`) so the main gallery stays untouched.
bootstrap(ToastDemo, { renderer: dom(), target: '#app' });
