'use strict';

// Shared lookup for category-password protection, used by both the post
// content gate (scripts/category-encrypt.js) and the attachment gate
// (scripts/generator-protected-pdfs.js), so the two can never disagree about
// which category a post belongs to or which password applies.

// Optional env override so passwords need not live in a committed _config.yml.
// Set CATEGORY_PASSWORDS to a JSON object mapping category name to password,
// e.g. CATEGORY_PASSWORDS='{"SecretCategory":"..."}'. Any keys it defines
// win over the corresponding _config.yml values; everything else falls back.
// A JSON map is used (rather than one env var per category) because category
// names may be non-ASCII.
function resolveMap(configured) {
  var merged = {};
  Object.keys(configured || {}).forEach(function (key) {
    merged[key] = configured[key];
  });

  if (process.env.CATEGORY_PASSWORDS) {
    try {
      var envMap = JSON.parse(process.env.CATEGORY_PASSWORDS);
      if (envMap && typeof envMap === 'object') {
        Object.keys(envMap).forEach(function (key) {
          merged[key] = envMap[key];
        });
      }
    } catch (e) {
      // Malformed override: ignore and keep the config values.
    }
  }

  return merged;
}

function passwordFor(category, map) {
  return map[category];
}

function categoryNamesOf(doc) {
  if (!doc || !doc.categories || typeof doc.categories.map !== 'function') return [];
  return doc.categories.map(function (cat) {
    return typeof cat === 'string' ? cat : cat.name;
  });
}

// Returns the first category name present in `map`, or undefined.
function protectedCategoryOf(names, map) {
  map = map || {};
  return names.filter(function (name) {
    return Object.prototype.hasOwnProperty.call(map, name);
  })[0];
}

module.exports = {
  resolveMap: resolveMap,
  passwordFor: passwordFor,
  categoryNamesOf: categoryNamesOf,
  protectedCategoryOf: protectedCategoryOf
};
