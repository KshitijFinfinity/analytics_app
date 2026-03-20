# Heatmap Analytics Feature - Implementation Guide

## Overview

The Heatmap Analytics feature provides visual insights into where users interact with your pages through click and scroll depth tracking. This document outlines the complete implementation across frontend, backend, and dashboard components.

## Architecture

### Backend Components

#### 1. Database Schema (`backend/migrations/010_create_heatmap_tables.sql`)
- **heatmap_clicks**: Stores individual click events
  - user_id, session_id, page_url
  - x_coordinate, y_coordinate
  - element_selector, element_text
  - created_at timestamp

- **heatmap_scrolls**: Stores scroll depth events
  - user_id, session_id, page_url
  - scroll_depth_percentage
  - viewport_height, document_height
  - created_at timestamp

- **heatmap_clicks_aggregated**: Pre-aggregated click data (10px buckets)
- **heatmap_scrolls_aggregated**: Pre-aggregated scroll data (5% buckets)

All tables include proper indexes for performance optimization.

#### 2. Backend Service (`backend/services/heatmapService.js`)

**Key Functions:**
- `recordClick()`: Stores individual click events and aggregates data
- `recordScroll()`: Stores scroll events and aggregates data
- `getClickHeatmap()`: Retrieves raw click data for a date range
- `getClickHeatmapAggregated()`: Retrieves aggregated click data for a specific date
- `getScrollHeatmap()`: Retrieves raw scroll data for a date range
- `getScrollHeatmapAggregated()`: Retrieves aggregated scroll data for a specific date
- `getPageUrls()`: Lists all pages with heatmap data
- `getHeatmapStats()`: Returns statistics (total clicks, scrolls, unique users)

**Aggregation Strategy:**
- Clicks are bucketed into 10x10 pixel grids
- Scrolls are bucketed into 5% depth ranges
- Aggregation happens automatically on data insertion for performance

#### 3. Backend Controller (`backend/controllers/heatmapController.js`)

**Endpoints:**
- `POST /heatmap/click`: Record click events (supports single or batch)
- `POST /heatmap/scroll`: Record scroll events
- `GET /analytics/heatmap/click`: Retrieve click heatmap data
- `GET /analytics/heatmap/scroll`: Retrieve scroll heatmap data
- `GET /analytics/heatmap/pages`: List available pages
- `GET /analytics/heatmap/stats`: Get heatmap statistics

Supports both single events and batch event processing for efficiency.

### Frontend Components

#### 1. Click Tracking (`frontend/utils/heatmapClickTracking.js`)

**Features:**
- Captures click coordinates in viewport space
- Extracts element selector and text from clicked elements
- Batch processing for efficiency (max 50 events or flush every 5 seconds)
- Error handling with fallback to multiple backend URLs
- Automatic cleanup on page unload

**Public API:**
```javascript
initializeClickTracking()    // Start tracking
stopClickTracking()           // Stop tracking
isClickTrackingActive()        // Check status
getClickBatch()              // Get pending events (testing)
manualFlushClickBatch()       // Force flush (testing)
```

#### 2. Scroll Tracking (`frontend/utils/heatmapScrollTracking.js`)

**Features:**
- Calculates maximum scroll depth reached
- Throttled updates (2-second intervals minimum)
- Sends final depth on page unload using Navigator.sendBeacon
- Handles edge cases (content shorter than viewport)

**Public API:**
```javascript
initializeScrollTracking()    // Start tracking
stopScrollTracking()          // Stop tracking
isScrollTrackingActive()       // Check status
getCurrentScrollDepth()       // Get current depth %
getMaxScrollDepth()           // Get max depth reached %
```

#### 3. Heatmap Initialization (`frontend/pages/_app.js`)

Both click and scroll tracking are automatically initialized when the app loads:
```javascript
import { initializeClickTracking, stopClickTracking } from "@/utils/heatmapClickTracking";
import { initializeScrollTracking, stopScrollTracking } from "@/utils/heatmapScrollTracking";

// Auto-initialize on app load
```

### Dashboard Components

#### 1. HeatmapCanvas (`dashboard-frontend/components/HeatmapCanvas.js`)

Canvas-based visualization component that renders:
- **Click Heatmap**: Circles sized by click density at X,Y coordinates
- **Scroll Heatmap**: Bar chart showing distribution of scroll depths
- Color gradient: Blue (low) → Cyan → Green → Yellow → Red (high)
- Automatic legend and axis labeling

#### 2. HeatmapFilter (`dashboard-frontend/components/HeatmapFilter.js`)

Filter controls for:
- Heatmap type selection (Click/Scroll)
- Page URL selection
- Date range (start/end dates)
- Aggregation toggle (for performance)
- Reset button to restore defaults

#### 3. HeatmapStats (`dashboard-frontend/components/HeatmapStats.js`)

Statistics dashboard showing:
- Total clicks recorded
- Unique users (clicks)
- Total scrolls recorded
- Unique users (scrolls)
- Loading states and error handling

#### 4. Heatmaps Page (`dashboard-frontend/pages/heatmaps.js`)

Main dashboard page that:
- Fetches available pages from backend
- Combines filters, canvas, and stats components
- Shows raw data table for debugging (collapsible)
- Handles loading and error states
- Provides helpful tips and instructions

## Data Flow

### Click Tracking Flow
1. User clicks on page → `handleClickCapture()` triggered
2. Extract coordinates, element info → Add to `clickBatch`
3. When batch reaches 50 events or 5 seconds elapse → `flushClickBatch()`
4. POST batch to backend `/heatmap/click`
5. Backend processes each event → Store in `heatmap_clicks`
6. Automatically aggregate into `heatmap_clicks_aggregated`

### Scroll Tracking Flow
1. User scrolls → `handleScrollEvent()` (throttled)
2. Calculate scroll depth % → Update `maxScrollDepth`
3. Send update every 2 seconds or when reaching 100%
4. On page unload → Send final `maxScrollDepth` via sendBeacon
5. Backend stores in `heatmap_scrolls`
6. Automatically aggregate into `heatmap_scrolls_aggregated`

### Dashboard Data Retrieval
1. User selects filters (page, type, date range)
2. Request appropriate endpoint from backend
3. For aggregated data: Use specific date, retrieve bucketed data
4. For raw data: Use date range, get individual events
5. Render on canvas with color gradient visualization

## Usage

### For Developers

#### Enable/Disable Tracking
```javascript
import { initializeClickTracking, stopClickTracking } from "@/utils/heatmapClickTracking";
import { initializeScrollTracking, stopScrollTracking } from "@/utils/heatmapScrollTracking";

// Start tracking
initializeClickTracking();
initializeScrollTracking();

// Stop tracking
stopClickTracking();
stopScrollTracking();
```

#### Query Heatmap Data
```bash
# Get click heatmap for specific date
curl "http://localhost:4001/analytics/heatmap/click?page_url=/&date=2026-03-16"

# Get scroll heatmap with date range
curl "http://localhost:4001/analytics/heatmap/scroll?page_url=/&start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z"

# Get available pages
curl "http://localhost:4001/analytics/heatmap/pages"

# Get statistics
curl "http://localhost:4001/analytics/heatmap/stats?page_url=/&start_date=2026-03-09T00:00:00Z&end_date=2026-03-16T23:59:59Z"
```

### For Users

#### Accessing Heatmaps
1. Open Dashboard → http://localhost:3001
2. Click "Heatmaps" in sidebar
3. Select heatmap type (Click/Scroll)
4. Choose page URL from dropdown
5. Adjust date range or toggle aggregation
6. View visualization with color-coded density

#### Interpreting Click Heatmaps
- Larger circles = more clicks in that area
- Red = highest click density
- Blue = lowest click density
- Helps identify page hotspots and user attention

#### Interpreting Scroll Heatmaps
- Taller bars = more users scrolling to that depth
- Shows typical reading/engagement patterns
- Helps identify content visibility issues

## Performance Considerations

### Batch Processing
- Click events are batched (max 50/batch or 5 sec intervals)
- Reduces network requests and backend load
- Improves responsiveness for end users

### Data Aggregation
- Raw events stored for detailed analysis
- Aggregated data (bucketed) for visual performance
- Aggregation happens at write-time, not query-time
- Queries on aggregated data are much faster

### Indexes
- Strategically placed on page_url, date, session_id, user_id
- Improves query performance for common filters
- Reduces database load for high-traffic sites

### Recommended Practices
1. Use aggregated data for date ranges > 7 days
2. Use raw data for single-day detailed analysis
3. Access dashboard during off-peak hours for large date ranges
4. Archive old heatmap data periodically

## Troubleshooting

### No Heatmap Data Appearing
1. Verify backend is running on port 4001-4003
2. Check browser console for network errors
3. Verify click/scroll tracking is initialized
4. Check database has heatmap tables created
5. Ensure frontend can reach backend URLs

### Performance Issues
1. Toggle "Use Aggregated Data" option
2. Reduce date range filter
3. Check database indexes are created
4. Monitor database query performance
5. Consider archiving old data

### Data Not Syncing
1. Check network tab for failed POST requests
2. Verify backend `/heatmap/click` and `/heatmap/scroll` endpoints
3. Check firewall/CORS settings
4. Verify batch processing is not stopped
5. Check backend logs for errors

## Future Enhancements

1. **Move Heatmap**: Track element hover/mouse movement
2. **Device Segmentation**: Filter by device type
3. **User Segment Analysis**: Filter by user cohorts
4. **Real-time Streaming**: WebSocket-based live heatmaps
5. **Comparison View**: Compare heatmaps across dates
6. **Export**: Export heatmap data and visualizations
7. **Custom Color Schemes**: User-configurable gradients
8. **Screenshot Overlays**: Display heatmaps over actual page screenshots
9. **Mobile-specific Views**: Touch vs scroll patterns
10. **Advanced Analytics**: Session context and correlation

## Files Created/Modified

### New Files
- `backend/migrations/010_create_heatmap_tables.sql`
- `backend/services/heatmapService.js`
- `backend/controllers/heatmapController.js`
- `frontend/utils/heatmapClickTracking.js`
- `frontend/utils/heatmapScrollTracking.js`
- `dashboard-frontend/components/HeatmapCanvas.js`
- `dashboard-frontend/components/HeatmapFilter.js`
- `dashboard-frontend/components/HeatmapStats.js`
- `dashboard-frontend/pages/heatmaps.js`

### Modified Files
- `backend/routes/track.js` (added heatmap POST routes)
- `backend/routes/analytics.js` (added heatmap GET routes)
- `dashboard-frontend/components/AppShell.js` (added Heatmaps nav)
- `frontend/pages/_app.js` (initialized tracking)

## Summary

The Heatmap Analytics feature provides a complete solution for understanding user interactions on web pages. With efficient batch processing, intelligent data aggregation, and intuitive visualizations, it enables product teams to identify usability issues and optimize user engagement.

The modular architecture allows for easy maintenance and future enhancements, while the performance optimizations ensure scalability even with high traffic volumes.
