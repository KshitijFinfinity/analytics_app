# Heatmap Feature - Quick Start Guide

## Setup Instructions

### 1. Backend Database Setup

Run the migration script to create the heatmap tables:

```bash
cd backend

# Option A: Using psql directly
psql -U postgres -d your_analytics_db -f migrations/010_create_heatmap_tables.sql

# Option B: The tables will be auto-created when first click/scroll events are recorded
```

### 2. Start Services

Open three terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Server will run on http://localhost:4001 (or auto-increment port if in use)
```

**Terminal 2 - Website Frontend:**
```bash
cd frontend
npm run dev
# App will run on http://localhost:3000
```

**Terminal 3 - Dashboard:**
```bash
cd dashboard-frontend
npm run dev
# Dashboard will run on http://localhost:3001
```

## Testing the Feature

### Step 1: Generate Click Events
1. Go to http://localhost:3000
2. Click around on the page (various elements)
3. The clicks are batched locally, sent every ~5 seconds or after 50 clicks
4. Open browser DevTools Console → Network tab to see requests to `/heatmap/click`

### Step 2: Generate Scroll Events
1. Scroll down on pages at http://localhost:3000
2. Let the page tracker record max scroll depth
3. The scroll event will be sent periodically (every 2 seconds)
4. Check DevTools → Network tab for `/heatmap/scroll` requests

### Step 3: View Heatmaps
1. Go to http://localhost:3001 (Dashboard)
2. Click "Heatmaps" in the left sidebar
3. Select a Page URL (should appear in dropdown after clicking/scrolling)
4. Choose heatmap type: "Click Heatmap" or "Scroll Heatmap"
5. Adjust date range (defaults to last 7 days)
6. View the visualization

## API Endpoints

### Recording Events

**Record Click Event:**
```bash
POST http://localhost:4001/heatmap/click

# Single event
{
  "user_id": "user_123",
  "session_id": "session_456",
  "page_url": "/",
  "x_coordinate": 250,
  "y_coordinate": 150,
  "element_selector": "button#submit",
  "element_text": "Submit"
}

# Batch events
{
  "events": [
    {
      "user_id": "user_123",
      "session_id": "session_456",
      "page_url": "/",
      "x_coordinate": 250,
      "y_coordinate": 150,
      "element_selector": "button#submit",
      "element_text": "Submit"
    },
    ...
  ]
}
```

**Record Scroll Event:**
```bash
POST http://localhost:4001/heatmap/scroll

{
  "user_id": "user_123",
  "session_id": "session_456",
  "page_url": "/",
  "scroll_depth_percentage": 75,
  "viewport_height": 800,
  "document_height": 3200
}
```

### Querying Data

**Get Click Heatmap (Raw Data):**
```bash
GET http://localhost:4001/analytics/heatmap/click?page_url=/&start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z
```

**Get Click Heatmap (Aggregated):**
```bash
GET http://localhost:4001/analytics/heatmap/click?page_url=/&date=2026-03-16
```

**Get Scroll Heatmap:**
```bash
GET http://localhost:4001/analytics/heatmap/scroll?page_url=/&start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z
```

**List Available Pages:**
```bash
GET http://localhost:4001/analytics/heatmap/pages?start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z
```

**Get Statistics:**
```bash
GET http://localhost:4001/analytics/heatmap/stats?page_url=/&start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z
```

## Testing Checklist

- [ ] Heatmap tables created in database
- [ ] Backend tracks click events (/heatmap/click POST)
- [ ] Backend tracks scroll events (/heatmap/scroll POST)
- [ ] Data appears in database after clicks/scrolls
- [ ] Dashboard Heatmaps page loads without errors
- [ ] Page URLs appear in filter dropdown
- [ ] Click heatmap visualization renders
- [ ] Scroll heatmap visualization renders
- [ ] Color gradient displays correctly
- [ ] Stats show correct numbers
- [ ] Date filters work properly
- [ ] Aggregated data toggle shows difference
- [ ] Raw data table displays below visualization

## Debugging Tips

### Check if events are being sent
1. Open DevTools (F12 or Ctrl+Shift+I)
2. Go to Network tab
3. Filter for "heatmap"
4. Perform clicks/scrolls
5. Look for POST requests to endpoint

### Check database
```sql
-- Check click events
SELECT COUNT(*) FROM heatmap_clicks;
SELECT * FROM heatmap_clicks LIMIT 5;

-- Check scroll events
SELECT COUNT(*) FROM heatmap_scrolls;
SELECT * FROM heatmap_scrolls LIMIT 5;

-- Check aggregated data
SELECT COUNT(*) FROM heatmap_clicks_aggregated;
SELECT * FROM heatmap_clicks_aggregated LIMIT 10;
```

### Backend logs
Watch for messages like:
- "Event received: click" in server console
- "Click tracking initialized" in browser console
- "Scroll tracking initialized" in browser console

## Common Issues

### "No data available" in heatmap
- Make sure you've clicked or scrolled on the website
- Wait 5-10 seconds for batch flush
- Refresh dashboard
- Check that date range includes today

### Heatmap page not showing
- Restart dashboard: `npm run dev` in dashboard-frontend
- Check browser console for errors
- Verify backend is running on port 4001

### Backend won't start
- Check if port 4001 is in use: `netstat -an | findstr 4001` (Windows) or `lsof -i :4001` (Mac/Linux)
- Kill existing process or change port in server.js
- Verify DATABASE_URL is set in backend/.env

### No pages showing in dropdown
- Need to generate some events first
- Make sure to click/scroll on a page, then wait 5+ seconds
- Check network requests for errors

## Next Steps

1. Run the application with the setup instructions above
2. Generate some test data by clicking and scrolling
3. View the heatmaps in the dashboard
4. Customize colors/styling as needed
5. Integrate with your own application's pages
6. Monitor user behavior patterns

## Support

For issues or questions, check:
1. [HEATMAP_IMPLEMENTATION.md](./HEATMAP_IMPLEMENTATION.md) - Technical details
2. Browser DevTools Console - Error messages
3. Backend server logs - Database errors
4. Database logs - SQL execution errors
