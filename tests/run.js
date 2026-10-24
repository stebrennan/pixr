'use strict';
require('./suite.js').run(result => {
  if (!result.pass) console.error(`FAIL ${result.name}\n${result.error}`);
}).then(results => {
  const failed = results.filter(r => !r.pass).length;
  console.log(`${results.length - failed}/${results.length} Pixr tests passed.`);
  process.exitCode = failed ? 1 : 0;
});
