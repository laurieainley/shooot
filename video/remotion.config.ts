import { Config } from '@remotion/cli/config'

Config.setVideoImageFormat('jpeg')
Config.setJpegQuality(92)
Config.setConcurrency(4)
// WebGL (the 3D ball) in headless Chrome on macOS.
Config.setChromiumOpenGlRenderer('angle')
Config.setEntryPoint('src/index.ts')
