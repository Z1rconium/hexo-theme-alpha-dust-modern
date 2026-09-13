var alphaDustUnlock = (function () {

    function decrypt(cipher, password) {
        if (!window.AlphaDustCrypto) return Promise.resolve('');
        // A wrong password makes AES-GCM authentication fail, which rejects;
        // surface that as an empty string so callers can treat it as "no".
        return window.AlphaDustCrypto.decryptString(cipher, password).catch(function () {
            return '';
        });
    }

    function attemptDecrypt(container, password) {
        return decrypt(container.getAttribute('data-cipher'), password).then(function (plaintext) {
            var errorEl = container.querySelector('.encrypted-post-error');

            if (!plaintext) {
                if (errorEl) errorEl.hidden = false;
                return false;
            }

            var contentEl = container.querySelector('.encrypted-post-content');
            var formEl = container.querySelector('.encrypted-post-form');
            contentEl.innerHTML = plaintext;
            contentEl.hidden = false;
            if (formEl) formEl.hidden = true;
            if (errorEl) errorEl.hidden = true;

            // The revealed HTML may itself embed a .pdf-viewer (see
            // scripts/category-encrypt.js's encryptedHasPdf flag, which is what
            // got pdf-viewer.js loaded on this page in the first place). That
            // script's own DOMContentLoaded scan ran before this content
            // existed, so re-run its init now, scoped to just this subtree.
            // The password is forwarded so a protected PDF attachment can be
            // decrypted client-side rather than fetched as a public file.
            if (window.AlphaDustPdfViewer && typeof window.AlphaDustPdfViewer.init === 'function') {
                window.AlphaDustPdfViewer.init(contentEl, password);
            }

            var category = container.getAttribute('data-category');
            try {
                sessionStorage.setItem('unlock:' + category, password);
            } catch (e) {
                // Private browsing / storage disabled — the unlock above still
                // stands for this page view, it just won't carry over.
            }

            return true;
        });
    }

    function rememberedPassword(category) {
        try {
            return sessionStorage.getItem('unlock:' + category);
        } catch (e) {
            return null;
        }
    }

    function initEncryptedPosts() {
        if (!window.AlphaDustCrypto || !window.AlphaDustCrypto.isSupported()) return;

        document.querySelectorAll('.encrypted-post').forEach(function (container) {
            var category = container.getAttribute('data-category');
            var remembered = rememberedPassword(category);

            if (remembered) attemptDecrypt(container, remembered);

            var form = container.querySelector('.encrypted-post-form');
            if (!form) return;

            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var input = form.querySelector('.encrypted-post-input');
                if (!input || !input.value) return;
                attemptDecrypt(container, input.value);
            });
        });
    }

    // Homepage/listing teaser (article-short.ejs): unlike a single post's
    // .encrypted-post, there's no form here — it's a silent, best-effort
    // reveal using an already-remembered session password, so a visitor who
    // unlocked this category on one post sees the real preview for every
    // other post in it too, without re-entering anything. If nothing is
    // remembered (or it no longer decrypts), the lock badge just stays put.
    function initEncryptedTeasers() {
        if (!window.AlphaDustCrypto || !window.AlphaDustCrypto.isSupported()) return;

        document.querySelectorAll('.encrypted-post-teaser').forEach(function (teaser) {
            var category = teaser.getAttribute('data-category');
            var remembered = rememberedPassword(category);
            if (!remembered) return;

            decrypt(teaser.getAttribute('data-cipher'), remembered).then(function (plaintext) {
                if (!plaintext) return;

                var revealed = teaser.querySelector('.encrypted-post-revealed');
                var contentEl = revealed && revealed.querySelector('.content');
                var card = teaser.querySelector('.encrypted-compact-card');
                if (!revealed || !contentEl) return;

                contentEl.innerHTML = plaintext;
                revealed.hidden = false;
                if (card) card.hidden = true;

                if (window.AlphaDustPdfViewer && typeof window.AlphaDustPdfViewer.init === 'function') {
                    window.AlphaDustPdfViewer.init(contentEl, remembered);
                }
            });
        });
    }

    return {
        initEncryptedPosts: initEncryptedPosts,
        initEncryptedTeasers: initEncryptedTeasers
    };
}());

document.addEventListener('DOMContentLoaded', function () {
    alphaDustUnlock.initEncryptedPosts();
    alphaDustUnlock.initEncryptedTeasers();
});
