# Alpha Dust Modern — Hexo Blog Theme

![](http://www.codeblocq.com/img/hexo-theme-thumbnail/AlphaDust.jpg)

[Original Demo](http://www.codeblocq.com/assets/projects/hexo-theme-alpha-dust/)

**Alpha Dust Modern** is a glowy, futuristic, cyber-aesthetic blog theme for [Hexo](https://hexo.io/).

This is a modernized edition that removes legacy runtime dependencies (such as jQuery, GSAP, and Featherlight), enhances security with dynamic Content-Security-Policy (CSP) and Web Crypto post encryption, embeds an interactive canvas-based PDF reader, and significantly boosts loading performance and Core Web Vitals.

---

## What's Modernized in This Edition

- **Zero-Dependency Vanilla JS**: Replaced legacy jQuery and GSAP animations with lightweight native ES JavaScript.
- **Native `<dialog>` Lightbox**: Replaced Featherlight.js with standard HTML5 `<dialog>` for fast, accessible image galleries.
- **Post Password Encryption**: Build-time AES-256-GCM + PBKDF2-HMAC-SHA256 (210,000 iterations) encryption with native client-side Web Crypto decryption. No bulky CryptoJS library required.
- **Embedded PDF.js Viewer**: Built-in canvas PDF reader (`{% pdf %}` tag) with lazy-loading and encrypted attachment decryption support.
- **Dynamic Content-Security-Policy (CSP)**: High-security CSP header that dynamically adapts to allow approved third-party services (Disqus, Google Analytics, Facebook comments, CDNs).
- **Non-blocking Font Loading**: Google Fonts and Font Awesome load asynchronously without blocking page render.
- **Native Image Lazy Loading**: Automatic `loading="lazy" decoding="async"` on post images for superior LCP.
- **Modern Hexo Compatibility**: Compatible with Hexo 5, 6, 7, and 8+; includes standard `package.json`.
- **Flexible Logo & Favicons**: Supports both Font Awesome icons and image logos with automatic fallback, plus favicon / apple-touch-icon configuration.
- **Updated Social Accounts**: Added Telegram support and removed deprecated Google Plus.

---

## Features Overview

- Responsive and mobile-first design
- Futuristic neon/glow visual styling
- Category password protection & teaser preview
- Built-in PDF reader with responsive fullscreen and zoom controls
- Image gallery with native modal lightbox
- Disqus & Facebook comments integration
- Google Analytics support
- Tags and categories listing pages
- Stylus CSS preprocessor & EJS HTML templates
- RSS and Sitemap integration support

---

## Installation

### 1. Clone the Theme

In your Hexo blog root directory:

```bash
git clone https://github.com/Z1rconium/hexo-theme-alpha-dust-modern themes/alpha-dust
```

### 2. Enable the Theme

In your blog's root `_config.yml`, set the `theme` field to `alpha-dust`:

```yaml
theme: alpha-dust
```

---

## Theme Configuration

All theme configurations can be modified in `themes/alpha-dust/_config.yml` (or in your blog's main `_config.yml` under `theme_config:`).

### Menu Navigation

Configure top navigation links:

```yaml
menu:
  Home: /
  Archives: /archives
  About: /about/
  Tags: /tags/
  Categories: /categories/
  Contact: /contact/
```

### Blog Logo

You can display either a [Font Awesome icon](https://fontawesome.com/v4/icons/) or a custom image:

```yaml
# Font Awesome icon class (used as fallback)
fa_logo: fa-cube

# Custom logo image path (optional; leave empty to use fa_logo)
logo_img: /img/logo.png
```

You can also override the logo icon for a specific post or page via front-matter:

```markdown
---
title: My Futuristic Post
logoIcon: fa-rocket
---
```

### Favicons

Configure your favicon and Apple touch icon paths:

```yaml
favicon: /favicon.ico
apple_touch_icon: /apple-touch-icon.png
```

### Footer

Customize the "About" section and copyright line (HTML allowed):

```yaml
footer_about: "A personal blog built with Hexo."
footer_copyright: "&copy; 2026 Your Name. All rights reserved."
```

### Social Links

Add links to your social profiles in the footer. If left blank, the corresponding icon will not be displayed:

```yaml
twitter_url:
facebook_url:
instagram_url:
dribble_url:
github_url: https://github.com/yourusername
telegram_url: https://t.me/yourusername
behance_url:
fivehundredpx_url:
email_url: yourname@example.com
rss_url: /atom.xml
```

### Comments & Analytics

```yaml
# Disqus
comments:
  disqus_shortname: your_disqus_shortname

# Google Analytics
google_analytics: UA-XXXXXXXX-X
```

*(The theme's Content-Security-Policy automatically expands whitelist rules for Disqus and Google Analytics when configured.)*

---

## Advanced Features

### 1. Category Password Protection

You can protect all posts in designated categories with a password at build time. The post content and excerpt are encrypted with AES-256-GCM:

```yaml
category_password:
  Private: "your-password-here"
```

> **Tip**: You can also provide passwords via the environment variable `CATEGORY_PASSWORDS` at build time to keep passwords out of committed files:
> ```bash
> CATEGORY_PASSWORDS='{"Private":"your-password-here"}' hexo generate
> ```

Visitors can unlock the post directly in their browser. Once unlocked, the password is remembered in the current session so other posts and homepage teasers in that category unlock automatically.

### 2. Embedded PDF Reader

Embed interactive PDF documents directly inside posts with the `{% pdf %}` tag:

```markdown
{% pdf /files/sample.pdf "Document Title" %}
```

- Features page navigation, zoom controls, and fullscreen view.
- Supports lazy loading: PDF.js is only loaded on pages containing PDF viewers.
- When placed in a password-protected category, the PDF attachment is also encrypted on build and unlocked with the post password.

---

## Creating Tags and Categories Pages

### Tags Page

1. Create a new page:
   ```bash
   hexo new page "tags"
   ```
2. Edit `source/tags/index.md`:
   ```markdown
   ---
   title: "Tags"
   type: "tags"
   ---
   ```

### Categories Page

1. Create a new page:
   ```bash
   hexo new page "categories"
   ```
2. Edit `source/categories/index.md`:
   ```markdown
   ---
   title: "Categories"
   type: "categories"
   ---
   ```

---

## Credits & License

- Original Alpha Dust theme created by [Jonathan Klughertz](https://github.com/klugjo).
- Modernized and maintained by [Z1rconium](https://github.com/Z1rconium).
- Licensed under the [MIT License](LICENSE).
