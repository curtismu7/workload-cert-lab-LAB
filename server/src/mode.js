// Rule 19: runtime server-side mode. POST /api/mode {source:"mock"|"real"};
// GET /api/info returns {source, realAvailable}. Real is not configured in this
// mock-only lab, so setMode('real') is refused with 409 semantics from the route.
let source = 'mock';
export function getMode() { return source; }
export function setMode(next) { source = next; }
export function realAvailable() { return false; }
export const REAL_HINT = 'This lab is mock-only: the IETF WIMSE flows are simulated in-process and there is no real server to connect to.';
