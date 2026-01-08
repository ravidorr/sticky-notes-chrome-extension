# Sticky Notes Landing Page

A simple, modern landing page for the Sticky Notes Chrome Extension.

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

Then open http://localhost:8080 in your browser.

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
   ```
   www.stickynotes.dev
   ```
2. Configure DNS with your domain registrar:
   - Add a CNAME record pointing to `<username>.github.io`

## File Structure

```
site/
├── index.html      # Main landing page
├── styles.css      # All styles
├── scripts.js      # Interactive functionality (navbar, demo, etc.)
├── favicon.svg     # Site favicon
└── README.md       # This file
```

## Customization

### Colors

Edit CSS variables in `styles.css`:

```css
:root {
    --color-primary: #5B4FE9;      /* Main brand color */
    --color-primary-dark: #4840B8;  /* Darker shade for hover */
    --color-yellow: #FEF08A;        /* Sticky note color */
}
```

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

Unit tests for the demo are in `tests/unit/site-scripts.test.js`.

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

- [ ] Add actual Chrome Web Store link once published
- [ ] Add real screenshots/demo GIF
- [ ] Create Privacy Policy page
- [ ] Create Terms of Service page
- [ ] Add actual social meta images (`og-image.png`)
- [ ] Update GitHub repository URL in nav and footer links
