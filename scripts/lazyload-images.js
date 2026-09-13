'use strict';

// Adds loading="lazy" decoding="async" to rendered <img> tags that don't
// already declare a loading attribute, so post-body images (which templates
// can't touch directly since they come from Markdown) don't block LCP.
hexo.extend.filter.register('after_render:html', function (str) {
  return str.replace(/<img\b((?:(?!loading\s*=)[^>])*?)(\/?)>/gi, function (match, attrs, selfClose) {
    if (/\blogo-img\b/.test(attrs)) return match;
    return '<img' + attrs + ' loading="lazy" decoding="async"' + selfClose + '>';
  });
});
