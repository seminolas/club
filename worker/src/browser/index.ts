// Browser bundle entry (built to js/dist/rules.js): exposes the rules as the
// globals js/app.js and index.html call, as js/algorithm.js used to.
import * as algorithm from './algorithm';

Object.assign(globalThis, algorithm);
