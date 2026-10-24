'use strict';
function reportTestError(error) {
  document.getElementById('result').textContent = `Test harness error: ${error.message || error}`;
}
window.addEventListener('error', event => reportTestError(event.error || event.message));
window.addEventListener('unhandledrejection', event => reportTestError(event.reason));
