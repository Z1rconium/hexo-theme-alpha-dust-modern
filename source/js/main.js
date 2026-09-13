var alphaDust = (function () {

    var menuOpen = false;
    var menuBg;
    var navToggle;

    // head.ejs ships the third-party font/icon stylesheets with media="print"
    // so they don't block rendering; swap them to all here. This replaces the
    // old inline onload="" attribute, which required allowing inline event
    // handlers in the CSP.
    function initAsyncCss() {
        document.querySelectorAll('link[data-async-css]').forEach(function (link) {
            link.media = 'all';
        });
    }

    function initPostHeader() {
        document.querySelectorAll('.main .post').forEach(function (post) {
            var header = post.querySelector('.post-header.index');
            var title = post.querySelector('h1.title');
            var readMoreLink = post.querySelector('a.read-more');

            if (!header) return;

            var toggleHoverClass = function () {
                header.classList.toggle('hover');
            };

            [title, readMoreLink].forEach(function (el) {
                if (!el) return;
                el.addEventListener('mouseenter', toggleHoverClass);
                el.addEventListener('mouseleave', toggleHoverClass);
            });
        });
    }

    function menuShow() {
        if (!menuBg) return;
        menuBg.classList.add('is-open');
        navToggle && navToggle.classList.add('menu-active');
        menuOpen = true;
    }

    function menuHide() {
        if (!menuBg) return;
        menuBg.classList.remove('is-open');
        navToggle && navToggle.classList.remove('menu-active');
        menuOpen = false;
    }

    function initMenu() {
        menuBg = document.querySelector('.menu-bg');
        navToggle = document.querySelector('nav a');

        if (!navToggle) return;

        navToggle.addEventListener('click', function (e) {
            e.preventDefault();
            menuOpen ? menuHide() : menuShow();
        });

        if (menuBg) {
            menuBg.addEventListener('click', function (e) {
                if (menuOpen && e.target === menuBg) {
                    menuHide();
                }
            });
        }
    }

    function initLightbox() {
        var dialog = document.getElementById('lightbox');
        if (!dialog || typeof dialog.showModal !== 'function') return;

        var img = dialog.querySelector('.lightbox-img');
        var closeBtn = dialog.querySelector('.lightbox-close');

        document.querySelectorAll('.lightbox-trigger').forEach(function (trigger) {
            trigger.addEventListener('click', function () {
                img.src = trigger.getAttribute('data-lightbox-src');
                dialog.showModal();
            });
        });

        closeBtn && closeBtn.addEventListener('click', function () {
            dialog.close();
        });

        dialog.addEventListener('click', function (e) {
            if (e.target === dialog) dialog.close();
        });

        dialog.addEventListener('close', function () {
            img.src = '';
        });
    }

    return {
        initAsyncCss: initAsyncCss,
        initPostHeader: initPostHeader,
        initMenu: initMenu,
        initLightbox: initLightbox
    };
}());

document.addEventListener('DOMContentLoaded', function () {
    alphaDust.initAsyncCss();
    alphaDust.initPostHeader();
    alphaDust.initMenu();
    alphaDust.initLightbox();
});
