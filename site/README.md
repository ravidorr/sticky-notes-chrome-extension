# Sticky Notes Landing Page

A simple, modern landing page for the Sticky Notes Chrome Extension.

## Build Process

The site uses a build script to optimize CSS and JavaScript for production:

```bash
npm run build:site
```

This script:

1. **Bundles CSS**: Resolves all `@import` statements in `styles.css` into a single `styles.bundled.css` file, eliminating render-blocking CSS waterfalls
2. **Minifies JavaScript**: Creates `scripts.min.js` from `scripts.js` (typically 50-60% size reduction)
3. **Generates HTML**: Combines partials (head, header, footer) with page templates

**Important**: Always run `npm run build:site` after making changes to CSS, JavaScript, or HTML templates.

## Local Development

To preview the site locally, you can use any static file server:

```bash
# Using Python
cd site
python -m http.server 8080

# Using Node.js (npx)
npx serve site

# Using PHP
cd site
php -S localhost:8080
```

Then open <http://localhost:8080> in your browser.

## Deploy to GitHub Pages

### Option 1: Deploy from `/site` folder (Recommended)

1. Go to your repository **Settings** → **Pages**
2. Under "Build and deployment":
   - **Source**: Deploy from a branch
   - **Branch**: `main`
   - **Folder**: `/site`
3. Click **Save**
4. Your site will be available at `https://<username>.github.io/<repo-name>/`

### Option 2: Deploy with GitHub Actions

Create `.github/workflows/deploy-pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'site/**'

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Pages
        uses: actions/configure-pages@v4
        
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: './site'
          
      - name: Deploy to GitHub Pages
        uses: actions/deploy-pages@v4
```

### Option 3: Custom Domain

1. Add a `CNAME` file in the `/site` folder with your domain:

   ```text
   www.stickynotes.dev
   ```

2. Configure DNS with your domain registrar:
   - Add a CNAME record pointing to `<username>.github.io`

## File Structure

```text
site/
├── templates/          # Source HTML templates
│   ├── index.html
│   ├── privacy.html
│   ├── terms.html
│   └── contact.html
├── partials/           # Reusable HTML partials
│   ├── head.html       # Common <head> content
│   ├── header.html     # Navigation header
│   └── footer.html     # Footer with scripts
├── css/
│   ├── styles.css          # Main CSS with @imports (source)
│   ├── styles.bundled.css  # Generated: all CSS bundled (use this)
│   ├── _variables.css      # Design tokens
│   ├── _reset.css          # CSS reset
│   ├── _utilities.css      # Utility classes
│   ├── _components.css     # Component styles
│   ├── _animations.css     # Animations
│   └── _pages/             # Page-specific styles
├── js/
│   ├── scripts.js      # Source JavaScript
│   └── scripts.min.js  # Generated: minified version (use this)
├── index.html          # Generated from templates/index.html
├── privacy.html        # Generated from templates/privacy.html
├── terms.html          # Generated from templates/terms.html
├── contact.html        # Generated from templates/contact.html
├── favicon.svg         # Site favicon
└── README.md           # This file
```

## Customization

### Colors

Edit CSS variables in `css/_variables.css`:

```css
:root {
    --c-blue-500: #3b82f6;    /* Primary accent color */
    --c-blue-600: #2563eb;    /* Darker shade for hover */
    --c-yellow-400: #facc15;  /* Sticky note color */
}
```

After making changes, run `npm run build:site` to regenerate the bundled CSS.

### Content

Update these sections in `index.html`:

- **Hero**: Main headline and value proposition
- **Pain Points**: Target audience problems ("Sound familiar?")
- **Interactive Demo**: Try the element anchoring feature
- **Features**: Product capabilities
- **How It Works**: 3-step process
- **Comparison**: Compare with alternatives
- **Pricing**: Pricing tiers
- **Footer**: Links and legal pages

### Interactive Demo

The landing page includes an interactive demo that lets visitors try the element anchoring feature without installing the extension. The demo logic is in `scripts.js` and includes:

- Selection mode activation
- Note creation on clicked elements
- Note deletion
- State management
- Keyboard support (Enter/Space keys for accessibility)

Unit tests for the demo are in `tests/unit/site-scripts.test.js`.

### Accessibility Features

The site includes accessibility enhancements:

- **Skip link**: Allows keyboard users to bypass navigation
- **ARIA attributes**: Mobile menu has proper `aria-expanded`, `aria-hidden`, and `aria-controls`
- **Keyboard navigation**: Mobile menu closes with Escape key, demo targets respond to Enter/Space
- **Focus states**: Visible focus indicators on all interactive elements
- **Screen reader support**: Comparison table has a visually hidden caption

### Adding Analytics

Add before `</head>`:

```html
<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>
```

## TODO

- [x] Add actual Chrome Web Store link once published
- [ ] Add real screenshots/demo GIF
- [x] Create Privacy Policy page
- [x] Create Terms of Service page
- [ ] Add actual social meta images (`og-image.png`)
- [x] Update GitHub repository URL in nav and footer links
