import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { ChartDemo } from './chart-demo.js';

// A separate page (`/chart.html`) so the main gallery stays untouched.
bootstrap(ChartDemo, { renderer: dom(), target: '#app' });
