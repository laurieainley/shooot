import { parseGoProName } from './gopro'

// Stable identity for a source file across sessions and list changes.
// GoPro LRV proxies and their full MP4s share a key (chapter + recording number).
export function fileKey(name: string): string {
    return parseGoProName(name)?.key ?? name
}
