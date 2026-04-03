/**
 * DevTools background script — registers the Bridge panel.
 *
 * Add to manifest.json:
 * {
 *   "devtools_page": "devtools/devtools.html"
 * }
 */

chrome.devtools.panels.create(
  'Bridge',           // panel title
  '',                 // icon path (leave empty to use default)
  'devtools/panel.html',
  (_panel) => {
    // Panel created callback (optional)
  },
);
