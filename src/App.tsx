import './App.css'
import { FilePicker } from './components/FilePicker'
import { Player } from './components/Player'
import { AddGoalControls } from './components/AddGoalControls'
import { GoalList } from './components/GoalList'
import { ChaptersExport } from './components/ChaptersExport'
import { AddGoalAtCurrentButton } from './components/AddGoalAtCurrentButton'
import { FileList } from './components/FileList'

import { BulkPaste } from './components/BulkPaste'
import { ProjectIO } from './components/ProjectIO'
import { RenderHighlights } from './components/RenderHighlights'
import { PreviewControls } from './components/PreviewControls'
import { HighlightLengthControls } from './components/HighlightLengthControls'

function App() {
  return (
    <div style={{
      padding: 16,
      maxWidth: 1920,
      margin: '0 auto',
      width: '100%'
    }}>
      <h1>SHOOOT - Highlights creator</h1>

      {/* File picker and file list - always at top */}
      <FilePicker />
      <div style={{ marginTop: 12 }}>
        <FileList />
      </div>

      {/* Responsive layout container */}
      <div className="layout-container">

        {/* Main content area - player on desktop left, full width on mobile */}
        <div className="main-content">
          <Player />
        </div>

        {/* Sidebar - right on desktop, below player on mobile */}
        <div className="sidebar">

          <div>
            <AddGoalControls />
            <div style={{ marginTop: 8 }}>
              <AddGoalAtCurrentButton />
            </div>
          </div>

          <GoalList />

          <HighlightLengthControls />

          <PreviewControls />

          <ChaptersExport />

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <BulkPaste />
            <ProjectIO />
          </div>

          <RenderHighlights />

          <p style={{ fontSize: '0.9em', color: '#666', margin: 0 }}>
            Select MP4 H.264 files only.
          </p>
        </div>
      </div>
    </div>
  )
}

export default App
