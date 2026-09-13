'use strict';

// Gates every post in a `category_password`-listed category behind a single,
// category-wide password. Since this is a static site (no server at serve
// time — see deploy/deploy.sh), the gate is enforced client-side: content is
// AES-256-GCM encrypted here at build time and decrypted in the browser by
// themes/alpha-dust/source/js/category-unlock.js after the correct password
// is entered. The password never reaches the client; only the KDF params and
// ciphertext do. This is still obfuscation, not real access control.
//
// Registered on `after_post_render`, which Hexo 8's own
// before_generate/render_post filter triggers by calling Post#render
// directly on the live Warehouse Post document (see
// node_modules/hexo/dist/plugins/filter/before_generate/render_post.js).
// That means `data` here is the same document object templates read later,
// so `data.categories` is already the populated Category collection (same
// as `item.categories.first()` in the theme's templates), and mutating
// `data.content`/`data.excerpt` here is automatically picked up by every
// downstream consumer (homepage, single-post page, RSS feed, sitemap) with
// no per-generator special-casing needed.
var webcrypto = require('./lib/webcrypto');
var passwords = require('./lib/passwords');

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderGate(category, cipher) {
  return '<div class="encrypted-post" data-category="' + escapeAttr(category) + '" data-cipher="' + escapeAttr(cipher) + '">' +
    '<span class="encrypted-post-label">🔐 This post is password-protected</span>' +
    '<form class="encrypted-post-form">' +
    '<input type="password" class="encrypted-post-input" autocomplete="off" placeholder="Enter password">' +
    '<button type="submit" class="btn encrypted-post-submit">Unlock</button>' +
    '</form>' +
    '<p class="encrypted-post-error" hidden>Incorrect password.</p>' +
    '<div class="encrypted-post-content" hidden></div>' +
    '<noscript><p>JavaScript is required to view this content.</p></noscript>' +
    '</div>';
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.encrypted) return data; // idempotency guard

  var map = passwords.resolveMap(hexo.config.category_password || (hexo.theme && hexo.theme.config && hexo.theme.config.category_password));
  var protectedCategory = passwords.protectedCategoryOf(passwords.categoryNamesOf(data), map);
  if (!protectedCategory) return data;

  var password = passwords.passwordFor(protectedCategory, map);
  var content = data.content;
  var excerpt = data.excerpt;

  // after-footer.ejs's hasPdfViewer check can't see through the ciphertext
  // to decide whether to load pdf-viewer.js, so record the answer now while
  // the plaintext is still on hand.
  var hasPdf = content.indexOf('pdf-viewer') !== -1;

  var contentCipher = webcrypto.encryptString(content, password);
  var excerptCipher = excerpt ? webcrypto.encryptString(excerpt, password) : contentCipher;

  data.content = renderGate(protectedCategory, contentCipher);
  data.excerpt = renderGate(protectedCategory, excerptCipher);
  data.encrypted = true;
  data.encryptedCategory = protectedCategory;
  data.encryptedHasPdf = hasPdf;
  // Raw cipher (not the full gate-widget HTML above) for the homepage
  // teaser in article-short.ejs, which needs to silently re-decrypt the
  // excerpt into a live preview when the visitor already unlocked this
  // category this session — see category-unlock.js's initEncryptedTeasers.
  data.encryptedExcerptCipher = excerptCipher;

  return data;
});
