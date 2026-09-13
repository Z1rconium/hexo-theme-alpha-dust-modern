'use strict';

// {% pdf /files/report.pdf "季度报告" %}
//
// Emits a styled <canvas>-based PDF viewer container. The heavy pdf.js bundle
// is loaded lazily by js/pdf-viewer.js only when a container is present on the
// page; this tag just emits the lightweight, progressively-enhanced markup.
//
// When the post belongs to a `category_password` category, the attachment is
// served as an encrypted `.enc` blob produced by
// scripts/generator-protected-pdfs.js (the raw file is not published), and the
// container carries the metadata pdf-viewer.js needs to decrypt it client-side
// after unlock. Otherwise the attachment is a normal public static file.
//
// `this` inside a Hexo tag function is the post/page document, which exposes
// the permalink `path` but NOT the site `config`. url_for needs a config, so we
// bind it against hexo.config and supply the current path for relative links.
var urlFor = require('hexo-util').url_for;
var passwords = require('./lib/passwords');

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

hexo.extend.tag.register('pdf', function (args) {
  var src = args[0];
  var title = args.slice(1).join(' ').trim();
  var baseUrl = urlFor.call({ config: hexo.config, path: this.path }, src);
  var label = title || 'Download PDF';

  var map = passwords.resolveMap(hexo.config.category_password || (hexo.theme && hexo.theme.config && hexo.theme.config.category_password));
  var protectedCategory = this.categories
    ? passwords.protectedCategoryOf(passwords.categoryNamesOf(this), map)
    : undefined;

  var effectiveSrc = protectedCategory ? baseUrl + '.enc' : baseUrl;
  var viewerAttrs = ' data-src="' + escapeHtml(effectiveSrc) + '" data-label="' + escapeHtml(label) + '"';
  if (protectedCategory) {
    viewerAttrs += ' data-protected="true" data-category="' + escapeHtml(protectedCategory) + '"' +
      ' data-post-url="' + escapeHtml(hexo.config.root + this.path) + '"';
  }

  return [
    '<div class="pdf-viewer"' + viewerAttrs + '>',
    '  <div class="pdf-toolbar">',
    '    <button type="button" class="btn pdf-prev" aria-label="Previous page">&laquo;</button>',
    '    <span class="pdf-page-info"><span class="pdf-page-num">1</span> / <span class="pdf-page-count">-</span></span>',
    '    <button type="button" class="btn pdf-next" aria-label="Next page">&raquo;</button>',
    '    <select class="btn pdf-zoom-mode" aria-label="Zoom mode">',
    '      <option value="fit-height" selected>Fit Height</option>',
    '      <option value="fit-width">Fit Width</option>',
    '      <option value="actual">100%</option>',
    '      <option value="custom" hidden>Custom</option>',
    '    </select>',
    '    <button type="button" class="btn pdf-zoom-out" aria-label="Zoom out">-</button>',
    '    <button type="button" class="btn pdf-zoom-in" aria-label="Zoom in">+</button>',
    '    <button type="button" class="btn pdf-fullscreen" aria-label="Fullscreen"><i class="fa fa-expand" aria-hidden="true"></i></button>',
    '    <a class="btn pdf-download" href="' + escapeHtml(effectiveSrc) + '"' + (protectedCategory ? '' : ' download') + ' aria-label="Download"><i class="fa fa-download" aria-hidden="true"></i></a>',
    '  </div>',
    '  <div class="pdf-canvas-wrap"></div>',
    '  <noscript><a href="' + escapeHtml(effectiveSrc) + '">' + escapeHtml(label) + '</a></noscript>',
    '</div>'
  ].join('\n');
}, { ends: false });
