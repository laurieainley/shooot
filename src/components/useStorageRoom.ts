import { useEffect, useState } from 'react'
import { storageRoom, type StorageRoom } from '../render/storage'

/** The browser's storage room for renders (null while unknown or when the browser will not say); re-read when `refreshKey` changes. */
export function useStorageRoom(refreshKey?: unknown): StorageRoom | null {
    const [room, setRoom] = useState<StorageRoom | null>(null)
    useEffect(() => {
        let live = true
        void storageRoom().then((r) => { if (live) setRoom(r) })
        return () => { live = false }
    }, [refreshKey])
    return room
}
