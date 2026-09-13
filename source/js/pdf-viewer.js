// PDF viewer. Loaded as `<script type="module">` (see after-footer.ejs) only on
// pages that actually contain (or, for an encrypted post, will reveal) a
// .pdf-viewer container, so the pdf.js bundle is never requested site-wide.
// The bundle itself is imported lazily below too.
//
// Vanilla ES module, mirroring the style of main.js. Uses import.meta.url to
// resolve the worker path instead of hard-coding a url_for prefix, so it stays
// correct under subdirectory and CDN deployments.
//
// initPdfViewers is also exposed on window so category-unlock.js can re-run
// it, scoped to just the newly-revealed subtree, after a correct password
// decrypts a protected post — the initial DOMContentLoaded scan below runs
// before that content exists in the DOM and so never finds it on its own.
function initPdfViewers(root, password) {
  var viewers = (root || document).querySelectorAll('.pdf-viewer');
  if (!viewers.length) return;

  // Homepage list items (article-short.ejs, wrapped in .post-list) get a
  // one-line compact card instead of the full canvas reader — a post without
  // an excerpt cut would otherwise dump its entire pdf.js viewer into the
  // list. Only viewers outside that context load the heavy pdf.js bundle.
  var fullViewers = [];
  viewers.forEach(function (el) {
    if (el.closest('.post-list')) {
      renderCompactCard(el);
    } else {
      el.classList.add('is-loading');
      fullViewers.push(el);
    }
  });

  if (!fullViewers.length) return;

  import('./vendor/pdfjs/pdf.min.mjs').then(function (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    fullViewers.forEach(function (el) { initViewer(el, pdfjsLib, password); });
  }).catch(function (err) {
    fullViewers.forEach(function (el) {
      el.classList.remove('is-loading');
      el.classList.add('is-error');
    });
    if (window.console && console.error) console.error('pdf-viewer: failed to load pdf.js', err);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initPdfViewers(document);
});

window.AlphaDustPdfViewer = { init: initPdfViewers };

function renderCompactCard(container) {
  var protectedPdf = container.getAttribute('data-protected') === 'true';
  // A protected attachment is ciphertext, so the list card must send the
  // visitor to the post (where they can unlock and decrypt it) instead of
  // offering the .enc blob as a download.
  var url = protectedPdf
    ? (container.getAttribute('data-post-url') || container.getAttribute('data-src'))
    : container.getAttribute('data-src');
  var label = container.getAttribute('data-label') || 'View PDF';

  var link = document.createElement('a');
  link.className = 'pdf-compact-card';
  link.href = url;
  if (!protectedPdf) {
    link.target = '_blank';
    link.rel = 'noopener';
  }

  var icon = document.createElement('i');
  icon.className = protectedPdf ? 'fa fa-lock' : 'fa fa-file-pdf-o';
  icon.setAttribute('aria-hidden', 'true');

  var labelSpan = document.createElement('span');
  labelSpan.className = 'pdf-compact-label';
  labelSpan.textContent = label;

  var hintSpan = document.createElement('span');
  hintSpan.className = 'pdf-compact-hint';
  hintSpan.textContent = protectedPdf ? 'Enter Password' : 'View PDF';

  link.appendChild(icon);
  link.appendChild(labelSpan);
  link.appendChild(hintSpan);

  container.textContent = '';
  container.appendChild(link);
  container.classList.add('is-compact');
}

function debounce(fn, wait) {
  var timer;
  return function () {
    var ctx = this, args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, wait);
  };
}

// Resolves the input pdf.js should open. For a normal attachment that's just
// its URL. For a `category_password`-protected one, the URL points at an
// encrypted `.enc` blob; we fetch it and decrypt client-side with the password
// the visitor entered (forwarded by category-unlock.js, or remembered in
// sessionStorage), so the raw document is never publicly downloadable.
function loadPdfInput(container, password) {
  var src = container.getAttribute('data-src');

  if (container.getAttribute('data-protected') === 'true') {
    var category = container.getAttribute('data-category');
    var pw = password;
    if (!pw && category) {
      try { pw = sessionStorage.getItem('unlock:' + category); } catch (e) { pw = null; }
    }
    if (!pw || !window.AlphaDustCrypto) {
      return Promise.reject(new Error('pdf-viewer: attachment is locked'));
    }
    return fetch(src, { credentials: 'same-origin' }).then(function (res) {
      if (!res.ok) throw new Error('pdf-viewer: fetch failed (HTTP ' + res.status + ')');
      return res.arrayBuffer();
    }).then(function (payload) {
      return window.AlphaDustCrypto.decryptBytes(payload, pw);
    }).then(function (bytes) {
      return { data: bytes, decryptedBytes: bytes };
    });
  }

  return Promise.resolve(document.baseURI ? new URL(src, document.baseURI).href : src);
}

function initViewer(container, pdfjsLib, password) {
  var wrapEl = container.querySelector('.pdf-canvas-wrap');
  var pageNumEl = container.querySelector('.pdf-page-num');
  var pageCountEl = container.querySelector('.pdf-page-count');
  var prevBtn = container.querySelector('.pdf-prev');
  var nextBtn = container.querySelector('.pdf-next');
  var zoomModeSelect = container.querySelector('.pdf-zoom-mode');
  var zoomInBtn = container.querySelector('.pdf-zoom-in');
  var zoomOutBtn = container.querySelector('.pdf-zoom-out');
  var fullscreenBtn = container.querySelector('.pdf-fullscreen');

  var MIN_SCALE = 0.4, MAX_SCALE = 3, SCALE_STEP = 0.2;
  // Pages beyond this count get their off-screen canvas pixel buffers freed
  // as they scroll out of the lazy-render margin, to bound memory on very
  // long documents. Typical blog attachments (reports/slides) stay well
  // under this, so the common case never pays the re-render-on-scroll-back
  // cost of unloading.
  var UNLOAD_PAGE_THRESHOLD = 40;
  var LAZY_ROOT_MARGIN = '800px 0px 800px 0px';
  var RESIZE_DEBOUNCE_MS = 150;

  var pdfDoc = null;
  var numPages = 0;
  var pageMeta = [];
  var scale = 1.2;
  var zoomMode = 'fit-height';
  var pageNum = 1;
  var scrollTicking = false;
  var lazyObserver = null;
  var resizeObserver = null;
  var lastOutputScale = 1;

  function clampScale(s) {
    return Math.min(Math.max(s, MIN_SCALE), MAX_SCALE);
  }

  // Canvas backing-store multiplier. Rendering only at CSS-pixel resolution
  // makes the bitmap look soft on HiDPI/Retina screens, where the browser
  // upscales it by devicePixelRatio. Cap at 2 so a 3x/4x display does not
  // quadruple canvas memory for negligible visual gain.
  function outputScaleFor() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  function buildPageContainers() {
    wrapEl.textContent = '';
    pageMeta = new Array(numPages);
    for (var i = 0; i < numPages; i++) {
      var div = document.createElement('div');
      div.className = 'pdf-page-container';
      div.setAttribute('data-page-num', String(i + 1));
      var canvas = document.createElement('canvas');
      canvas.className = 'pdf-page';
      div.appendChild(canvas);
      wrapEl.appendChild(div);
      pageMeta[i] = {
        pageProxy: null,
        baseWidth: 0,
        baseHeight: 0,
        container: div,
        canvas: canvas,
        ctx: canvas.getContext('2d'),
        renderedAtScale: null,
        renderedAtDpr: null,
        renderTask: null,
        failed: false
      };
    }

    var loads = [];
    var loadOne = function (num) {
      loads.push(pdfDoc.getPage(num).then(function (page) {
        var meta = pageMeta[num - 1];
        var vp1 = page.getViewport({ scale: 1 });
        meta.pageProxy = page;
        meta.baseWidth = vp1.width;
        meta.baseHeight = vp1.height;
      }).catch(function (err) {
        pageMeta[num - 1].failed = true;
        pageMeta[num - 1].container.classList.add('is-page-error');
        if (window.console && console.error) console.error('pdf-viewer: page metadata failed', num, err);
      }));
    };
    for (var n = 1; n <= numPages; n++) loadOne(n);
    return Promise.all(loads);
  }

  function computeScaleForMode(mode) {
    var ref = pageMeta[0];
    if (!ref || !ref.baseWidth) return scale;
    var style = getComputedStyle(wrapEl);
    var padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    var padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    var availW = wrapEl.clientWidth - padX;
    var availH = wrapEl.clientHeight - padY;
    if (mode === 'fit-height') return clampScale(availH / ref.baseHeight);
    if (mode === 'fit-width') return clampScale(availW / ref.baseWidth);
    if (mode === 'actual') return 1;
    return scale;
  }

  function renderPageContainer(idx) {
    var meta = pageMeta[idx];
    if (!meta || meta.failed || !meta.pageProxy) return;
    var outputScale = outputScaleFor();
    if (meta.renderTask) {
      // A render is already in flight. pdf.js does not release the canvas
      // synchronously on cancel() — calling render() again immediately would
      // throw "Cannot use the same canvas during multiple render()
      // operations." Flag a retry and let the in-flight task's rejection
      // handler restart it once the canvas is actually free.
      if (meta.renderedAtScale !== scale || meta.renderedAtDpr !== outputScale) {
        meta.renderTask.cancel();
        meta.pendingRerender = true;
      }
      return;
    }
    if (meta.renderedAtScale === scale && meta.renderedAtDpr === outputScale) return;
    startRender(meta, idx, outputScale);
  }

  function startRender(meta, idx, outputScale) {
    var renderScale = scale;
    var viewport = meta.pageProxy.getViewport({ scale: renderScale });
    // Size the backing store in device pixels (viewport is in CSS pixels) and
    // pin the canvas display size to the layout size, so the extra resolution
    // only sharpens the image and never changes the rendered zoom/dimensions.
    meta.canvas.width = Math.floor(viewport.width * outputScale);
    meta.canvas.height = Math.floor(viewport.height * outputScale);
    meta.canvas.style.width = Math.floor(viewport.width) + 'px';
    meta.canvas.style.height = Math.floor(viewport.height) + 'px';

    var renderParams = { canvasContext: meta.ctx, viewport: viewport };
    if (outputScale !== 1) {
      renderParams.transform = [outputScale, 0, 0, outputScale, 0, 0];
    }
    var task = meta.pageProxy.render(renderParams);
    meta.renderTask = task;
    lastOutputScale = outputScale;
    task.promise.then(function () {
      meta.renderTask = null;
      meta.renderedAtScale = renderScale;
      meta.renderedAtDpr = outputScale;
      meta.container.classList.add('is-rendered');
      if (meta.pendingRerender) {
        meta.pendingRerender = false;
        renderPageContainer(idx);
      }
    }).catch(function (err) {
      meta.renderTask = null;
      var wasPending = meta.pendingRerender;
      meta.pendingRerender = false;
      if (err && err.name === 'RenderingCancelledException') {
        if (wasPending) renderPageContainer(idx);
        return;
      }
      meta.failed = true;
      meta.container.classList.add('is-page-error');
      if (window.console && console.error) console.error('pdf-viewer: page render failed', idx + 1, err);
    });
  }

  function renderCurrentlyVisiblePages() {
    var wrapRect = wrapEl.getBoundingClientRect();
    pageMeta.forEach(function (meta, idx) {
      var r = meta.container.getBoundingClientRect();
      if (r.bottom >= wrapRect.top && r.top <= wrapRect.bottom) renderPageContainer(idx);
    });
  }

  function maybeUnrender(idx) {
    if (numPages <= UNLOAD_PAGE_THRESHOLD) return;
    var meta = pageMeta[idx];
    if (!meta || meta.renderedAtScale == null || meta.renderTask) return;
    meta.canvas.width = 0;
    meta.canvas.height = 0;
    meta.renderedAtScale = null;
    meta.renderedAtDpr = null;
    meta.container.classList.remove('is-rendered');
  }

  function applyScale(newScale, opts) {
    opts = opts || {};
    scale = clampScale(newScale);
    var fallback = pageMeta[0];
    pageMeta.forEach(function (meta) {
      var w = meta.baseWidth || (fallback && fallback.baseWidth) || 600;
      var h = meta.baseHeight || (fallback && fallback.baseHeight) || 800;
      meta.container.style.width = Math.round(w * scale) + 'px';
      meta.container.style.height = Math.round(h * scale) + 'px';
      // No need to touch renderTask/renderedAtScale here: renderPageContainer
      // compares renderedAtScale against the now-updated `scale` itself, and
      // owns cancelling/retrying any in-flight render safely (see there).
    });
    if (!opts.skipScrollAnchor) scrollToPage(pageNum, false);
    renderCurrentlyVisiblePages();
  }

  function setupLazyObserver() {
    lazyObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var idx = Number(entry.target.getAttribute('data-page-num')) - 1;
        if (entry.isIntersecting) {
          renderPageContainer(idx);
        } else {
          maybeUnrender(idx);
        }
      });
    }, { root: wrapEl, rootMargin: LAZY_ROOT_MARGIN, threshold: 0.01 });
    pageMeta.forEach(function (m) { lazyObserver.observe(m.container); });
  }

  function updateNavButtonsDisabled() {
    prevBtn.disabled = !pdfDoc || pageNum <= 1;
    nextBtn.disabled = !pdfDoc || pageNum >= numPages;
  }

  function updatePageNumFromScroll() {
    var topLine = wrapEl.getBoundingClientRect().top + 1;
    var current = 1;
    for (var i = 0; i < pageMeta.length; i++) {
      if (pageMeta[i].container.getBoundingClientRect().top <= topLine) {
        current = i + 1;
      } else {
        break;
      }
    }
    if (current !== pageNum) {
      pageNum = current;
      pageNumEl.textContent = pageNum;
    }
    updateNavButtonsDisabled();
  }

  function onWrapScroll() {
    if (scrollTicking) return;
    scrollTicking = true;
    requestAnimationFrame(function () {
      scrollTicking = false;
      updatePageNumFromScroll();
    });
  }

  function scrollToPage(num, smooth) {
    num = Math.min(Math.max(num, 1), numPages || 1);
    var meta = pageMeta[num - 1];
    if (!meta) return;
    var delta = meta.container.getBoundingClientRect().top - wrapEl.getBoundingClientRect().top;
    wrapEl.scrollBy({ top: delta, left: 0, behavior: smooth === false ? 'auto' : 'smooth' });
  }

  function setZoomMode(mode) {
    zoomMode = mode;
    applyScale(computeScaleForMode(mode));
  }

  function nudgeScale(delta) {
    zoomMode = 'custom';
    zoomModeSelect.value = 'custom';
    applyScale(scale + delta);
  }

  function handleWrapResize() {
    if (!pdfDoc) return;
    if (zoomMode === 'fit-height' || zoomMode === 'fit-width') {
      applyScale(computeScaleForMode(zoomMode));
    }
  }

  function handleDprChange() {
    if (pdfDoc && lastOutputScale !== outputScaleFor()) {
      // Dragging the window to a display with a different DPI does not always
      // resize the viewer, so re-render the visible pages explicitly. Pages
      // already at the current DPR are skipped by renderPageContainer.
      renderCurrentlyVisiblePages();
    }
  }

  function setupResizeWatcher() {
    var debounced = debounce(handleWrapResize, RESIZE_DEBOUNCE_MS);
    if (typeof ResizeObserver === 'function') {
      resizeObserver = new ResizeObserver(debounced);
      resizeObserver.observe(wrapEl);
    } else {
      window.addEventListener('resize', debounced);
    }
    window.addEventListener('resize', debounce(handleDprChange, RESIZE_DEBOUNCE_MS));
  }

  loadPdfInput(container, password).then(function (input) {
    // A protected attachment arrives as decrypted bytes, so the plain .enc
    // href on the download button would save ciphertext. Swap in a Blob URL of
    // the real PDF instead.
    if (input && input.decryptedBytes) {
      var downloadEl = container.querySelector('.pdf-download');
      if (downloadEl && window.URL && URL.createObjectURL) {
        try {
          var blob = new Blob([input.decryptedBytes], { type: 'application/pdf' });
          downloadEl.href = URL.createObjectURL(blob);
          downloadEl.setAttribute('download', (container.getAttribute('data-label') || 'document') + '.pdf');
        } catch (e) {
          // Blob unavailable — leave the button pointing at the ciphertext
          // rather than breaking the viewer.
        }
      }
    }
    return pdfjsLib.getDocument(input).promise;
  }).then(function (doc) {
    pdfDoc = doc;
    numPages = doc.numPages;
    pageCountEl.textContent = numPages;
    return buildPageContainers();
  }).then(function () {
    zoomMode = 'fit-height';
    scale = computeScaleForMode(zoomMode);
    applyScale(scale, { skipScrollAnchor: true });
    setupLazyObserver();
    wrapEl.addEventListener('scroll', onWrapScroll, { passive: true });
    setupResizeWatcher();
    updateNavButtonsDisabled();
    container.classList.remove('is-loading');
  }).catch(function (err) {
    container.classList.remove('is-loading');
    container.classList.add('is-error');
    if (window.console && console.error) console.error('pdf-viewer: failed to open PDF', err);
  });

  prevBtn.addEventListener('click', function () {
    if (pdfDoc) scrollToPage(pageNum - 1, true);
  });
  nextBtn.addEventListener('click', function () {
    if (pdfDoc) scrollToPage(pageNum + 1, true);
  });
  zoomModeSelect.addEventListener('change', function () {
    if (pdfDoc) setZoomMode(this.value);
  });
  zoomInBtn.addEventListener('click', function () {
    if (pdfDoc) nudgeScale(SCALE_STEP);
  });
  zoomOutBtn.addEventListener('click', function () {
    if (pdfDoc) nudgeScale(-SCALE_STEP);
  });
  fullscreenBtn.addEventListener('click', function () {
    openFullscreen(container, function () {
      requestAnimationFrame(function () { scrollToPage(pageNum, false); });
    });
  });
}

function openFullscreen(container, onToggle) {
  var dialog = container.querySelector('dialog.pdf-lightbox');
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'pdf-lightbox';
    dialog.innerHTML = '<button type="button" class="pdf-lightbox-close" aria-label="Close">&times;</button>';
    container.appendChild(dialog);
    dialog.querySelector('.pdf-lightbox-close').addEventListener('click', function () { dialog.close(); });
    dialog.addEventListener('click', function (e) { if (e.target === dialog) dialog.close(); });
  }

  var wrap = container.querySelector('.pdf-canvas-wrap');
  var originalParent = wrap.parentNode;
  var originalNext = wrap.nextSibling;

  dialog.appendChild(wrap);
  if (typeof dialog.showModal === 'function') {
    dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  if (onToggle) onToggle();

  dialog.addEventListener('close', function restore() {
    originalParent.insertBefore(wrap, originalNext);
    dialog.removeEventListener('close', restore);
    if (onToggle) onToggle();
  });
}
