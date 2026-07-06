# Sharps Disposal Compliance Tracker - Technical Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Schemas](#data-schemas)
3. [Calculation / Logic Algorithms](#calculation--logic-algorithms)
4. [API Reference](#api-reference)
5. [Integration Guide](#integration-guide)
6. [Customization](#customization)
7. [Performance](#performance)
8. [Browser Compatibility](#browser-compatibility)
9. [Security](#security)
10. [Version History](#version-history)
11. [Support / Contact](#support--contact)

## Architecture Overview

### Technology Stack

The tool is a standalone, dependency-free static web application built with:

- **HTML5** - Semantic markup with form inputs and data tables
- **CSS3** - Linked via external stylesheet at `/tools/sharps-disposal-tracker/css/style.css`
- **Vanilla JavaScript (ES6+)** - All application logic in a single file at `/tools/sharps-disposal-tracker/js/app.js`
- **LocalStorage API** - Client-side data persistence with no backend or database requirements

### File Structure

```
/tools/sharps-disposal-tracker/
├── index.html          # Main application page
├── css/
│   └── style.css       # Styling (external)
└── js/
    └── app.js          # All application logic
```

### Component / Logic Breakdown

The application consists of three logical layers:

1. **Data Layer** - LocalStorage read/write operations for persistence
2. **Business Logic Layer** - Record management, calculations, and forecasting
3. **Presentation Layer** - DOM manipulation and event handling

## Data Schemas

### LocalStorage Key

```
Key: "poli-sharps-disposal"
Type: JSON string
```

### Record Object Structure

Each disposal event is stored as an object within an array:

```javascript
{
  "date": "2025-03-15",        // String: ISO date format (YYYY-MM-DD)
  "size": "5 L",               // String: container size or empty string
  "cost": "12.50",             // String: numeric cost value or empty string
  "provider": "Daniels Health", // String: provider name or empty string
  "notes": "Collection ref: ABC123", // String: additional notes or empty string
}
```

### Example Data Array

```javascript
[
  {
    "date": "2025-03-01",
    "size": "5 L",
    "cost": "15.00",
    "provider": "Daniels Health",
    "notes": "Monthly pickup"
  },
  {
    "date": "2025-03-15",
    "size": "2 L",
    "cost": "",
    "provider": "",
    "notes": ""
  }
]
```

### Container Size Options

The dropdown provides these selectable values:

| Value | Display Text |
|-------|-------------|
| `""` | Select... |
| `"0.7 L"` | 0.7 L (small / chairside) |
| `"1 L"` | 1 L |
| `"2 L"` | 2 L |
| `"5 L"` | 5 L |
| `"8 L"` | 8 L |
| `"Multiple containers"` | Multiple containers |

## Calculation / Logic Algorithms

### `forecastNext(records)` Function

This function predicts the next disposal date based on historical intervals.

**Input:** Array of record objects with `date` properties

**Algorithm Steps:**

1. If fewer than 2 records exist, return `", "` (insufficient data)
2. Sort records chronologically by date (oldest first)
3. Calculate gaps between consecutive disposal dates in days:
   - For each pair of consecutive records, compute `(date[i] - date[i-1]) / 86400000`
4. Calculate average gap: `sum of all gaps / number of gaps`
5. Add the average gap to the most recent disposal date
6. Return the forecast date as `YYYY-MM-DD` string

**Example Calculation:**

```
Records: 2025-01-01, 2025-01-15, 2025-02-05
Gaps: 14 days, 21 days
Average gap: (14 + 21) / 2 = 17.5 days
Forecast: 2025-02-05 + 18 days (rounded) = 2025-02-23
```

### Summary Calculations

**Total Disposals:** Count of all records in the array

**Total Cost:** Sum of all records where `cost` is not empty, parsed as float

**Average Cost per Pickup:** `totalCost / count of records with cost values`

**Next Forecast:** Result of `forecastNext(records)` function

## API Reference

### Core Functions

#### `load()`
- **Returns:** Array of record objects parsed from LocalStorage
- **Behavior:** Reads `"poli-sharps-disposal"` key, returns empty array if null
- **Implementation:** `JSON.parse(localStorage.getItem(KEY) || '[]')`

#### `save(records)`
- **Parameters:** `records` (Array) - Array of record objects to persist
- **Behavior:** Serializes array to JSON and stores in LocalStorage
- **Implementation:** `localStorage.setItem(KEY, JSON.stringify(records))`

#### `escHtml(s)`
- **Parameters:** `s` (String) - Raw string to sanitize
- **Returns:** HTML-escaped string
- **Behavior:** Replaces `&`, `<`, `>`, `"` with HTML entities
- **Implementation:** Uses regex replacement for XSS prevention

#### `render()`
- **Parameters:** None
- **Returns:** void
- **Behavior:** Reads all records from LocalStorage, updates all DOM elements:
  - Shows/hides empty state, table, and summary row
  - Calculates and displays summary statistics
  - Builds table rows in reverse chronological order
  - Updates log count display

#### `forecastNext(records)`
- **Parameters:** `records` (Array) - Array of record objects
- **Returns:** String - Forecast date in `YYYY-MM-DD` format or `", "`

### Event Handlers

#### `addBtn` click handler
- **Trigger:** Click on "Log Disposal" button
- **Validation:** Requires date field to be non-empty
- **Behavior:** Creates new record object from form fields, appends to array, saves, clears form, re-renders

#### `recordsBody` click handler (delegated)
- **Trigger:** Click on any `.del-btn` button within table body
- **Confirmation:** Shows `confirm()` dialog before deletion
- **Behavior:** Removes record at specified index, saves, re-renders

#### `exportBtn` click handler
- **Trigger:** Click on "Export CSV" button
- **Validation:** Requires at least one record to exist
- **Behavior:** Generates CSV with header row `Date,Container Size,Cost,Provider,Notes`, creates download link, triggers download as `sharps-disposal-log.csv`

#### `clearBtn` click handler
- **Trigger:** Click on "Clear All" button
- **Confirmation:** Shows `confirm()` dialog before clearing
- **Behavior:** Removes `"poli-sharps-disposal"` key from LocalStorage, re-renders

## Integration Guide

### Standalone Embedding

The tool can be embedded in any webpage using an iframe:

```html
<iframe 
  src="https://poliinternational.com/tools/sharps-disposal-tracker/" 
  width="100%" 
  height="800" 
  frameborder="0"
  title="Sharps Disposal Compliance Tracker">
</iframe>
```

### Theme Support

When embedded in an iframe, the tool listens for `message` events:

```javascript
// Parent page can send theme preference:
iframe.contentWindow.postMessage({
  type: 'poli-theme',
  light: true  // or false for dark mode
}, '*');
```

The tool automatically detects iframe embedding and defaults to dark theme.

### Dependencies

The tool has zero external dependencies. No npm packages, CDN resources, or third-party libraries are required. All functionality is implemented in vanilla JavaScript.

## Customization

### Styling

The tool uses an external stylesheet at `/tools/sharps-disposal-tracker/css/style.css`. You can override styles by:

1. Modifying the CSS file directly
2. Adding custom CSS rules in the parent page when embedding via iframe
3. Using CSS custom properties if supported by the stylesheet

### Default Date

The date input defaults to today's date on page load:

```javascript
disposalDate.value = new Date().toISOString().slice(0, 10);
```

### Data Persistence

All data is stored in the browser's LocalStorage under the key `"poli-sharps-disposal"`. To reset data programmatically:

```javascript
localStorage.removeItem('poli-sharps-disposal');
```

## Performance

- **Storage:** Maximum LocalStorage capacity is typically 5-10 MB per origin, sufficient for thousands of disposal records
- **Rendering:** The `render()` function rebuilds the entire table on every data change. For typical studio usage (hundreds of records), this completes in under 10ms
- **Memory:** Only one array of records is held in memory at any time
- **No network requests:** All operations are client-side with no API calls

## Browser Compatibility

The tool uses standard web APIs supported in all modern browsers:

| Feature | Minimum Browser Support |
|---------|------------------------|
| LocalStorage | IE 8+, all modern browsers |
| `Array.prototype.sort()` | IE 9+, all modern browsers |
| `Array.prototype.reduce()` | IE 9+, all modern browsers |
| `Array.prototype.map()` | IE 9+, all modern browsers |
| `Array.prototype.filter()` | IE 9+, all modern browsers |
| `Date.prototype.toISOString()` | IE 9+, all modern browsers |
| `template literals` | IE does not support, requires modern browser |
| `const` / `let` | IE 11+, all modern browsers |
| `arrow functions` | IE does not support, requires modern browser |

**Note:** The tool uses ES6+ syntax (arrow functions, template literals, `const`/`let`). It will not function in Internet Explorer 10 or below without transpilation.

## Security

### Input Handling

The tool implements HTML entity escaping via the `escHtml()` function to prevent XSS attacks when displaying user input:

```javascript
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
```

This function is applied to all user-supplied values (date, size, provider, notes) before rendering them in the table.

### CSV Export

The export function properly escapes double quotes in CSV values to prevent CSV injection:

```javascript
.map(v => `"${String(v).replace(/"/g, '""')}"`)
```

### Data Storage

- All data is stored client-side in LocalStorage
- No data is transmitted to any server
- No cookies are used
- No tracking or analytics are implemented

### Limitations

- The tool uses `confirm()` dialogs for delete operations, which cannot be styled
- No authentication or access control is implemented
- Data is specific to the browser and device where it was entered

## Version History

### Version 1.0.0 (Current)

- Initial release of Sharps Disposal Compliance Tracker
- Features: log disposal events, view history, export CSV, forecast next pickup
- LocalStorage-based persistence
- Zero external dependencies

## Support / Contact

For technical support, feature requests, or bug reports:

- **Email:** support@poliinternational.com
- **Website:** https://poliinternational.com
- **Tool URL:** https://poliinternational.com/tools/sharps-disposal-tracker/
