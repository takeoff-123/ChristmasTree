import { analyzeHandLandmarks } from '../src/gestures.js';

function point(x, y, z = 0) {
  return { x, y, z };
}

const openHand = [
  point(0.50, 0.88), point(0.45, 0.82), point(0.41, 0.77), point(0.36, 0.72), point(0.31, 0.68),
  point(0.43, 0.68), point(0.40, 0.56), point(0.38, 0.47), point(0.36, 0.38),
  point(0.50, 0.66), point(0.50, 0.52), point(0.50, 0.42), point(0.50, 0.32),
  point(0.57, 0.68), point(0.59, 0.55), point(0.61, 0.46), point(0.63, 0.37),
  point(0.64, 0.72), point(0.67, 0.62), point(0.69, 0.55), point(0.71, 0.48),
];

const fist = [
  point(0.50, 0.88), point(0.45, 0.83), point(0.42, 0.78), point(0.39, 0.74), point(0.36, 0.71),
  point(0.43, 0.68), point(0.41, 0.60), point(0.42, 0.65), point(0.43, 0.70),
  point(0.50, 0.66), point(0.50, 0.58), point(0.51, 0.64), point(0.51, 0.69),
  point(0.57, 0.68), point(0.59, 0.61), point(0.60, 0.66), point(0.61, 0.70),
  point(0.64, 0.72), point(0.66, 0.65), point(0.67, 0.69), point(0.68, 0.73),
];

console.log('OPEN', analyzeHandLandmarks(openHand));
console.log('FIST', analyzeHandLandmarks(fist));

const open = analyzeHandLandmarks(openHand);
const closed = analyzeHandLandmarks(fist);
if (!open.open || open.extended < 4) {
  throw new Error(`Open palm was not recognized: extended=${open.extended} angle=${open.averageAngle}`);
}
if (!closed.fist || closed.extended > 1) {
  throw new Error(`Fist was not recognized: extended=${closed.extended} angle=${closed.averageAngle}`);
}
console.log('Gesture classifier checks passed.');
