# Video Highlight Maker

A web application for creating video highlights from multiple video files. Add goals at specific timestamps, generate YouTube chapters, and render highlight reels.

## Features

- **Multi-video support**: Load and manage multiple video files
- **Goal tracking**: Add goals with team and scorer information
- **YouTube chapters**: Generate formatted chapters with scores
- **Video rendering**: Create highlight reels with cross-file support
- **Hotkeys**: Keyboard shortcuts for video navigation and goal adding
- **Score tracking**: Automatic score calculation and display

## Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Deployment

### Vercel (Recommended)

1. **Connect your repository** to Vercel
2. **Deploy automatically** - Vercel will detect the Vite configuration
3. **Environment**: No additional environment variables needed

The `vercel.json` file is already configured with:
- Proper CORS headers for FFmpeg WASM
- SPA routing support
- Build optimization

### Manual Deployment

```bash
# Build the project
npm run build

# Deploy the `dist` folder to your hosting provider
```

## Usage

1. **Upload videos**: Use the file picker to upload MP4 videos
2. **Navigate videos**: Use `[` and `]` keys to switch between videos
3. **Add goals**: 
   - Use the "Add Goal @ Current" button
   - Press `G` key while video is playing
   - Use the manual form with time input
4. **Generate chapters**: Copy YouTube chapters from the export section
5. **Render highlights**: Create a highlight reel with all goals

## Hotkeys

- **`[` / `]`**: Previous/Next video
- **`G`**: Add goal at current time
- **Spacebar**: Play/pause
- **← →**: Seek backward/forward
- **↑ ↓**: Volume up/down
- **0-9**: Jump to percentage of video
- **Shift + ,**: Decrease playback speed
- **Shift + .**: Increase playback speed
- **Shift + ?**: Reset playback speed to 1x
- **Home**: Jump to start
- **End**: Jump to end

## Technical Notes

- **FFmpeg WASM**: Video processing runs entirely in the browser
- **Cross-file support**: Highlights can span multiple video files
- **YouTube compatibility**: Optimized audio encoding for YouTube uploads
- **Local storage**: Goals are persisted in browser storage

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (iOS 14.3+)

## License

MIT
