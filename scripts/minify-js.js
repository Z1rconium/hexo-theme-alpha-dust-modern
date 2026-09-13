'use strict';

// hexo-neat's JS minifier only hooks `after_render:js`, which never fires for
// plain static .js assets (they're copied straight through, not "rendered").
// This minifies whatever .js files actually end up in the generated route
var terser;
try {
  terser = require('terser');
} catch (e) {
  // terser is optional; if not installed, static JS files won't be minified
}

if (terser) {
hexo.extend.filter.register('after_generate', function () {
  var routes = hexo.route.list().filter(function (path) {
    return /\.js$/i.test(path) && !/\.min\.js$/i.test(path);
  });

  return Promise.all(routes.map(function (path) {
    return new Promise(function (resolve, reject) {
      var chunks = [];
      var stream = hexo.route.get(path);
      stream.on('data', function (chunk) { chunks.push(chunk); });
      stream.on('error', reject);
      stream.on('end', function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    }).then(function (code) {
      return terser.minify(code, { mangle: true }).then(function (result) {
        if (result.error) {
          hexo.log.warn('minify-js: failed to minify %s: %s', path, result.error);
          return;
        }
        hexo.route.set(path, result.code);
      });
    });
  }));
});
}
