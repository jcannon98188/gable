import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { CodeBlockDemo } from './code-block-demo.js';

// A separate page (`/code-block.html`) so the main gallery stays untouched.
bootstrap(CodeBlockDemo, { renderer: dom(), target: '#app' });
