// =============================================================================
// Auto-Split Algorithm for Smart Player Allocation
// =============================================================================
//
// Distributes players into rooms based on a game's room capacity (player count).
// When more players want to play than a single room supports, this algorithm
// creates ⌈N/C⌉ rooms and distributes players evenly.

/**
 * Represents a single room's player assignment.
 */
export interface RoomAssignment {
  /** Zero-based room index */
  roomIndex: number;
  /** Zero-based player indices assigned to this room */
  playerIndices: number[];
  /** Whether this room is at full capacity */
  isFull: boolean;
}

/**
 * Result of the auto-split algorithm.
 */
export interface AutoSplitResult {
  /** Array of room assignments */
  rooms: RoomAssignment[];
  /** Total number of rooms created */
  totalRooms: number;
  /** Total number of players distributed */
  totalPlayers: number;
}

/**
 * Notification sent to a player about their room assignment.
 */
export interface PlayerNotification {
  /** Zero-based player index */
  playerIndex: number;
  /** Zero-based room index the player is assigned to */
  roomIndex: number;
  /** Indices of co-players in the same room */
  coPlayerIndices: number[];
  /** Whether the room is full or partially filled */
  roomFull: boolean;
}

/**
 * Distributes N players into ⌈N/C⌉ rooms of capacity C.
 *
 * - ⌊N/C⌋ rooms will have exactly C players
 * - At most one room will have N mod C players (if N mod C > 0)
 * - Total players across all rooms equals N
 *
 * @param playerCount - Total number of players (N), must be >= 1
 * @param roomCapacity - Max players per room (C), must be >= 1
 * @returns AutoSplitResult with room assignments
 * @throws Error if playerCount < 1 or roomCapacity < 1
 */
export function autoSplit(playerCount: number, roomCapacity: number): AutoSplitResult {
  if (!Number.isInteger(playerCount) || playerCount < 1) {
    throw new Error(`playerCount must be a positive integer, got ${playerCount}`);
  }
  if (!Number.isInteger(roomCapacity) || roomCapacity < 1) {
    throw new Error(`roomCapacity must be a positive integer, got ${roomCapacity}`);
  }

  const totalRooms = Math.ceil(playerCount / roomCapacity);
  const fullRoomCount = Math.floor(playerCount / roomCapacity);
  const remainder = playerCount % roomCapacity;

  const rooms: RoomAssignment[] = [];
  let playerIndex = 0;

  // Create full rooms first
  for (let i = 0; i < fullRoomCount; i++) {
    const indices: number[] = [];
    for (let j = 0; j < roomCapacity; j++) {
      indices.push(playerIndex++);
    }
    rooms.push({
      roomIndex: i,
      playerIndices: indices,
      isFull: true,
    });
  }

  // Create the partial room if there's a remainder
  if (remainder > 0) {
    const indices: number[] = [];
    for (let j = 0; j < remainder; j++) {
      indices.push(playerIndex++);
    }
    rooms.push({
      roomIndex: fullRoomCount,
      playerIndices: indices,
      isFull: false,
    });
  }

  return {
    rooms,
    totalRooms,
    totalPlayers: playerCount,
  };
}

/**
 * Generates notifications for each player about their room assignment and co-players.
 *
 * @param result - The AutoSplitResult from autoSplit()
 * @returns Array of PlayerNotification, one per player, sorted by playerIndex
 */
export function generatePlayerNotifications(result: AutoSplitResult): PlayerNotification[] {
  const notifications: PlayerNotification[] = [];

  for (const room of result.rooms) {
    for (const playerIndex of room.playerIndices) {
      notifications.push({
        playerIndex,
        roomIndex: room.roomIndex,
        coPlayerIndices: room.playerIndices.filter((idx) => idx !== playerIndex),
        roomFull: room.isFull,
      });
    }
  }

  return notifications.sort((a, b) => a.playerIndex - b.playerIndex);
}

/**
 * Lobby timeout in milliseconds for partially filled rooms created by auto-split.
 * Partially filled rooms stay in lobby state for up to this duration before
 * allowing the host to start with fewer players.
 */
export const PARTIAL_ROOM_LOBBY_TIMEOUT_MS = 30_000;
