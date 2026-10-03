// Stable identity for a source file across sessions and list changes.
// After the GoPro import work merges this becomes `parseGoProName(name)?.key ?? name`
// so LRV proxies and their full MP4s share a key.
export function fileKey(name: string): string {
    return name
}
