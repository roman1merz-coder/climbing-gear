# Google Search Console Setup Instructions

## Step 1: Add Property to Google Search Console

1. Go to https://search.google.com/search-console
2. Click "Add Property"
3. Enter your domain: `climbing-gear.vercel.app`

## Step 2: Verify Ownership

Google will provide a verification file like `google1234567890abcdef.html`

### Option A: HTML File Upload (Recommended)
1. Download the verification file from Google
2. Place it in the `public/` folder: `public/google1234567890abcdef.html`
3. Commit and push
4. Click "Verify" in Google Search Console

### Option B: HTML Tag (Already done!)
Add this to index.html `<head>` (we'll do this next):
```html
<meta name="google-site-verification" content="YOUR_CODE_HERE" />
```

## Step 3: Submit Sitemap

Once verified:
1. In Google Search Console, go to "Sitemaps"
2. Enter: `https://climbing-gear.vercel.app/sitemap.xml`
3. Click "Submit"

## Expected Results

- **Indexing**: 1-2 weeks for initial indexing
- **Full coverage**: 4-8 weeks for all 666 URLs
- **Rankings**: 2-3 months to see traffic

## Current URLs
- Homepage + 4 category pages
- 340 climbing shoes
- 155 ropes
- 111 crash pads
- 49 belay devices
- 6 static pages
**Total: 666 URLs**
