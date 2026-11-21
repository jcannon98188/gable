import { bootstrap } from '@gablejs/core';
import { dom } from '@gablejs/renderer-dom';
import './styles.css';
import { CarouselDemo } from './carousel-demo.js';

// A separate page (`/carousel.html`) so the main gallery stays untouched.
bootstrap(CarouselDemo, { renderer: dom(), target: '#app' });
