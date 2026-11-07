import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { CommandDemo } from './command-demo.js';

// A separate page (`/command.html`) so the main gallery stays untouched.
bootstrap(CommandDemo, { renderer: dom(), target: '#app' });
