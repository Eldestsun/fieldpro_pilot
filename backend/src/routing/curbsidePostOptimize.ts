import { OsrmStop } from "../osrmClient";
import { LegCost } from "./routeCost";

export async function postOptimizeCurbsideOrder(
    stops: OsrmStop[],
    getCost: (a: OsrmStop, b: OsrmStop) => Promise<LegCost>,
    opts?: { lookahead?: number; maxMoves?: number; minImprovementSeconds?: number }
): Promise<OsrmStop[]> {
    const lookahead = opts?.lookahead ?? 8;
    const maxMoves = opts?.maxMoves ?? 30;
    const minImprovementSeconds = opts?.minImprovementSeconds ?? 5; // Default lowered to 5s per user notes

    if (stops.length > 150) {
        if (process.env.DEBUG_OSRM === "1") {
            console.warn(`[OSRM] Post-optimization skipped: stop count ${stops.length} > 150`);
        }
        return stops;
    }

    const arr = [...stops];
    let moves = 0;

    if (process.env.DEBUG_OSRM === "1") {
        console.log(`[OSRM] Starting Post-Opt: lookahead=${lookahead}, maxMoves=${maxMoves}, minImp=${minImprovementSeconds}s`);
    }

    // Iterate through the list positions
    // We look for a candidate 'j' to insert at 'i+1'
    // i goes from 0 to N-2 (need at least one node after i to be an insertion target)
    for (let i = 0; i < arr.length - 1; i++) {
        if (moves >= maxMoves) break;

        const A = arr[i];      // Stop before insertion point
        const B = arr[i + 1];  // Current stop at insertion point

        let bestMoveIndex = -1;
        let bestDelta = 0;

        // Search for a candidate 'C' at index 'j' to move to 'i+1'.
        // j must be > i+1 (downstream).
        const searchLimit = Math.min(i + 1 + lookahead, arr.length);

        for (let j = i + 2; j < searchLimit; j++) {
            const C = arr[j];
            const P = arr[j - 1];
            const N = (j + 1 < arr.length) ? arr[j + 1] : null;

            // Current Cost (Removals):
            // 1. A -> B
            // 2. P -> C
            // 3. C -> N (if N exists)
            const current_AB = await getCost(A, B);
            const current_PC = await getCost(P, C);

            let currentTotal = current_AB.duration_s + current_PC.duration_s;

            if (N) {
                const current_CN = await getCost(C, N);
                currentTotal += current_CN.duration_s;
            }

            // Proposed Cost (Additions):
            // The new sequence at insertion point: A -> C -> B
            // The new sequence at removal point: P -> N

            const prop_AC = await getCost(A, C);
            const prop_CB = await getCost(C, B);

            let proposedTotal = prop_AC.duration_s + prop_CB.duration_s;

            if (N) {
                // If N exists, we close the gap P -> N
                const prop_PN = await getCost(P, N);
                proposedTotal += prop_PN.duration_s;
            }

            const delta = proposedTotal - currentTotal;

            if (delta < bestDelta) {
                bestDelta = delta;
                bestMoveIndex = j;
            }
        }

        // Check if we found a worthy move
        if (bestMoveIndex !== -1 && bestDelta < -minImprovementSeconds) {
            if (process.env.DEBUG_OSRM === "1") {
                console.log(`[OSRM] Insert Move: Stop[${bestMoveIndex}] -> Pos[${i + 1}]. Delta: ${bestDelta.toFixed(1)}s`);
            }

            // Perform the move: Remove at bestMoveIndex, Insert at i+1
            const [candidate] = arr.splice(bestMoveIndex, 1);
            arr.splice(i + 1, 0, candidate);

            moves++;
            // Since we modified the array indices downstream, standard behavior 
            // is to either restart or be careful.
            // Since we moved something from *ahead* to *here*, 
            // the node at i+1 is now the new candidate.
            // We should probably re-evaluate position i because now we have a new neighbor?
            // Or just continue.
            // For a greedy single pass, continuing is usually safer/simpler to terminate.
            // But actually, if we just inserted at i+1, maybe we can insert *another* thing at i+2?
            // Let's just continue loop. i increments, so we consider A=newCandidate for the next step.
        }
    }

    if (process.env.DEBUG_OSRM === "1") {
        console.log(`[OSRM] Post-optimization finished. Moves: ${moves}`);
    }

    return arr;
}
