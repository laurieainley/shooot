// Usage: swiftc -O scripts/avcheck.swift -o /tmp/avcheck && /tmp/avcheck out.mp4 — decodes every video sample with AVFoundation (as QuickTime would) and reports count, first/last PTS, largest gap and the reader's status.
import AVFoundation
import Foundation

guard CommandLine.arguments.count > 1 else { print("usage: avcheck <file.mp4>"); exit(2) }
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let asset = AVURLAsset(url: url)
let sem = DispatchSemaphore(value: 0)
var tracks: [AVAssetTrack] = []
Task {
    tracks = (try? await asset.loadTracks(withMediaType: .video)) ?? []
    sem.signal()
}
sem.wait()
guard let track = tracks.first else { print("no video track"); exit(1) }
let reader: AVAssetReader
do { reader = try AVAssetReader(asset: asset) } catch { print("reader error: \(error)"); exit(1) }
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
reader.add(output)
reader.startReading()
var count = 0
var first = Double.nan
var last = Double.nan
var maxGap = 0.0
var gapAt = 0.0
var noImage = 0
var times: [Double] = []
while let sample = output.copyNextSampleBuffer() {
    if CMSampleBufferGetNumSamples(sample) == 0 { continue }
    if CMSampleBufferGetImageBuffer(sample) == nil { noImage += 1 }
    let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
    times.append(t)
    count += 1
}
times.sort()
if let f = times.first, let l = times.last { first = f; last = l }
for i in 1..<max(1, times.count) where times[i] - times[i - 1] > maxGap { maxGap = times[i] - times[i - 1]; gapAt = times[i - 1] }
let status = ["unknown", "reading", "completed", "failed", "cancelled"][reader.status.rawValue]
print(String(format: "frames %d  first %.3f  last %.3f  largest gap %.3f s (after %.3f)  no-image %d  status %@", count, first, last, maxGap, gapAt, noImage, status))
if let e = reader.error { print("error: \(e)") }
exit(reader.status == .completed && maxGap < 0.1 && noImage == 0 ? 0 : 1)
