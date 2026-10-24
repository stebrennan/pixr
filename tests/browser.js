'use strict';
document.getElementById('environment').textContent = `${location.protocol} · ${navigator.userAgent}`;
PixelTests.run(result => {
  const item = document.createElement('li'); item.className = result.pass ? 'pass' : 'fail';
  item.textContent = `${result.pass ? 'PASS' : 'FAIL'} · ${result.name}`;
  if (!result.pass) { const pre = document.createElement('pre'); pre.textContent = result.error; item.append(pre); }
  document.getElementById('results').append(item);
}).then(results => {
  const passed = results.filter(r => r.pass).length;
  const summary = `${passed}/${results.length} passed${passed === results.length ? ' — all checks passed' : ' — failures require attention'}`;
  document.getElementById('result').textContent = summary; document.title = summary;
});
