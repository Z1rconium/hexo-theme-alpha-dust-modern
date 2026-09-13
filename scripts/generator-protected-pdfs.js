'use strict';

// Emits password-protected PDF attachments as encrypted blobs, so the raw
// document is never published as a plain, fetchable file.
//
// Source PDFs live in `<project>/protected-files/` — deliberately OUTSIDE
// `source/`, so Hexo's static copy step can never publish them. For every
// `{% pdf /files/name.pdf %}` referenced by a post in a `category_password`
// category, this generator encrypts the bytes with that category's password
// (same AES-256-GCM + PBKDF2 scheme as the post content) and serves the
// ciphertext at `files/name.pdf.enc`. The browser fetches that blob and
// decrypts it after the visitor unlocks the category.
//
// Non-protected attachments are untouched: they stay in `source/files/` and
// are copied through as before.
var fs = require('fs');
var path = require('path');
var webcrypto = require('./lib/webcrypto');
var passwords = require('./lib/passwords');

var PROTECTED_DIR = path.join(hexo.base_dir, 'protected-files');

// First argument of a {% pdf ... %} tag, quoted or bare.
var PDF_TAG_RE = /\{%-?\s*pdf\s+("[^"]*"|'[^']*'|\S+)/g;

function parseTagArgs(raw) {
  var srcs = [];
  var match;
  while ((match = PDF_TAG_RE.exec(raw)) !== null) {
    var arg = match[1];
    if ((arg[0] === '"' && arg[arg.length - 1] === '"') ||
        (arg[0] === "'" && arg[arg.length - 1] === "'")) {
      arg = arg.slice(1, -1);
    }
    if (arg.indexOf('/files/') === 0) srcs.push(arg);
  }
  return srcs;
}

hexo.extend.generator.register('protected-pdf-assets', function (locals) {
  var map = passwords.resolveMap(hexo.config.category_password || (hexo.theme && hexo.theme.config && hexo.theme.config.category_password));
  if (!Object.keys(map).length) return [];

  var routes = [];
  var seen = {};

  locals.posts.forEach(function (post) {
    var protectedCategory = passwords.protectedCategoryOf(passwords.categoryNamesOf(post), map);
    if (!protectedCategory) return;

    var password = passwords.passwordFor(protectedCategory, map);
    parseTagArgs(post.raw || '').forEach(function (src) {
      var basename = path.basename(src);
      if (seen[basename]) return;
      seen[basename] = true;

      var filePath = path.join(PROTECTED_DIR, basename);
      if (!fs.existsSync(filePath)) {
        hexo.log.warn('protected-pdf-assets: missing %s for %s', filePath, src);
        return;
      }

      var encrypted = webcrypto.encryptBytes(fs.readFileSync(filePath), password);
      routes.push({
        path: 'files/' + basename + '.enc',
        data: encrypted
      });
    });
  });

  return routes;
});
