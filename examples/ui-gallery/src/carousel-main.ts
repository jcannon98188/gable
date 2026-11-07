import { bootstrap } from '@gable/core';
import { dom } from '@gable/renderer-dom';
import './styles.css';
import { CarouselDemo } from './carousel-demo.js';

// A separate page (`/carousel.html`) so the main gallery stays untouched.
bootstrap(CarouselDemo, { renderer: dom(), target: '#app' });
