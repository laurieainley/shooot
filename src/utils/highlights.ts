import type { Goal } from '../types'

export type HighlightSegment = {
    startTime: number
    endTime: number
    sourceFileIndex: number
    goals: Goal[]
    duration: number
}

// Function to merge overlapping goal segments
export function mergeOverlappingGoalSegments(
    goals: Goal[],
    cumulativeOffsets: number[],
    matchStartTimeSec: number,
    adjustTimestampsByOffset: boolean,
    lengthBeforeGoalSec: number,
    lengthAfterGoalSec: number
): HighlightSegment[] {
    if (goals.length === 0) return [];

    // Create goals with adjusted times for sorting, but keep original times for playback
    const goalsWithSortTimes = goals.map(goal => ({
        ...goal,
        originalMatchTimeSec: goal.matchTimeSec, // Keep original time for video seeking
        sortTimeSec: adjustTimestampsByOffset ? Math.max(0, goal.matchTimeSec - matchStartTimeSec) : goal.matchTimeSec
    }));

    // Sort goals by adjusted time
    const sortedGoals = [...goalsWithSortTimes].sort((a, b) => {
        const aTime = (cumulativeOffsets[a.sourceFileIndex ?? 0] || 0) + a.sortTimeSec;
        const bTime = (cumulativeOffsets[b.sourceFileIndex ?? 0] || 0) + b.sortTimeSec;
        return aTime - bTime;
    });

    const merged: HighlightSegment[] = [];
    let currentSegment = {
        startTime: sortedGoals[0].originalMatchTimeSec - lengthBeforeGoalSec,
        endTime: sortedGoals[0].originalMatchTimeSec + lengthAfterGoalSec,
        sourceFileIndex: sortedGoals[0].sourceFileIndex ?? 0,
        goals: [sortedGoals[0]]
    };

    for (let i = 1; i < sortedGoals.length; i++) {
        const goal = sortedGoals[i];
        const goalTime = goal.originalMatchTimeSec; // Use original time for segment boundaries
        const goalStart = goalTime - lengthBeforeGoalSec;
        const goalEnd = goalTime + lengthAfterGoalSec;

        // Check if this goal overlaps with the current segment
        // Don't merge cross-file segments with single-file segments
        const currentSegmentIsCrossFile = currentSegment.startTime < 0;
        const goalIsCrossFile = goalStart < 0;

        if (goalStart <= currentSegment.endTime &&
            goal.sourceFileIndex === currentSegment.sourceFileIndex &&
            currentSegmentIsCrossFile === goalIsCrossFile) {
            // Merge segments
            currentSegment.endTime = Math.max(currentSegment.endTime, goalEnd);
            currentSegment.goals.push(goal);
        } else {
            // No overlap, finalize current segment and start new one
            merged.push({
                ...currentSegment,
                duration: currentSegment.endTime - currentSegment.startTime
            });

            currentSegment = {
                startTime: goalStart,
                endTime: goalEnd,
                sourceFileIndex: goal.sourceFileIndex ?? 0,
                goals: [goal]
            };
        }
    }

    // Add the last segment
    merged.push({
        ...currentSegment,
        duration: currentSegment.endTime - currentSegment.startTime
    });

    return merged;
}
