import { describe, it, expect } from 'vitest';
import {
  autoSplit,
  generatePlayerNotifications,
  PARTIAL_ROOM_LOBBY_TIMEOUT_MS,
  type AutoSplitResult,
} from './auto-split';

describe('autoSplit', () => {
  // --- Spec scenarios (Requirements 7.3, 7.4, 7.5) ---

  it('2P game with 4 players → 2 rooms of 2', () => {
    const result = autoSplit(4, 2);
    expect(result.totalRooms).toBe(2);
    expect(result.totalPlayers).toBe(4);
    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0].playerIndices).toEqual([0, 1]);
    expect(result.rooms[0].isFull).toBe(true);
    expect(result.rooms[1].playerIndices).toEqual([2, 3]);
    expect(result.rooms[1].isFull).toBe(true);
  });

  it('4P game with 4 players → 1 room of 4', () => {
    const result = autoSplit(4, 4);
    expect(result.totalRooms).toBe(1);
    expect(result.totalPlayers).toBe(4);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].playerIndices).toEqual([0, 1, 2, 3]);
    expect(result.rooms[0].isFull).toBe(true);
  });

  it('3P game with 6 players → 2 rooms of 3', () => {
    const result = autoSplit(6, 3);
    expect(result.totalRooms).toBe(2);
    expect(result.totalPlayers).toBe(6);
    expect(result.rooms).toHaveLength(2);
    expect(result.rooms[0].playerIndices).toEqual([0, 1, 2]);
    expect(result.rooms[0].isFull).toBe(true);
    expect(result.rooms[1].playerIndices).toEqual([3, 4, 5]);
    expect(result.rooms[1].isFull).toBe(true);
  });

  it('2P game with 5 players → 2 full rooms + 1 partial room', () => {
    const result = autoSplit(5, 2);
    expect(result.totalRooms).toBe(3);
    expect(result.totalPlayers).toBe(5);
    expect(result.rooms).toHaveLength(3);
    // Two full rooms
    expect(result.rooms[0].playerIndices).toEqual([0, 1]);
    expect(result.rooms[0].isFull).toBe(true);
    expect(result.rooms[1].playerIndices).toEqual([2, 3]);
    expect(result.rooms[1].isFull).toBe(true);
    // One partial room
    expect(result.rooms[2].playerIndices).toEqual([4]);
    expect(result.rooms[2].isFull).toBe(false);
  });

  // --- Edge cases ---

  it('1 player with capacity 1 → 1 room of 1', () => {
    const result = autoSplit(1, 1);
    expect(result.totalRooms).toBe(1);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].playerIndices).toEqual([0]);
    expect(result.rooms[0].isFull).toBe(true);
  });

  it('1 player with capacity 4 → 1 partial room', () => {
    const result = autoSplit(1, 4);
    expect(result.totalRooms).toBe(1);
    expect(result.rooms).toHaveLength(1);
    expect(result.rooms[0].playerIndices).toEqual([0]);
    expect(result.rooms[0].isFull).toBe(false);
  });

  it('capacity 1 with 3 players → 3 rooms of 1', () => {
    const result = autoSplit(3, 1);
    expect(result.totalRooms).toBe(3);
    expect(result.rooms).toHaveLength(3);
    for (let i = 0; i < 3; i++) {
      expect(result.rooms[i].playerIndices).toEqual([i]);
      expect(result.rooms[i].isFull).toBe(true);
    }
  });

  it('exact multiple: 8 players, capacity 4 → 2 full rooms', () => {
    const result = autoSplit(8, 4);
    expect(result.totalRooms).toBe(2);
    expect(result.rooms.every((r) => r.isFull)).toBe(true);
    expect(result.rooms[0].playerIndices).toEqual([0, 1, 2, 3]);
    expect(result.rooms[1].playerIndices).toEqual([4, 5, 6, 7]);
  });

  // --- Validation ---

  it('throws for playerCount < 1', () => {
    expect(() => autoSplit(0, 2)).toThrow('playerCount must be a positive integer');
    expect(() => autoSplit(-1, 2)).toThrow('playerCount must be a positive integer');
  });

  it('throws for roomCapacity < 1', () => {
    expect(() => autoSplit(4, 0)).toThrow('roomCapacity must be a positive integer');
    expect(() => autoSplit(4, -1)).toThrow('roomCapacity must be a positive integer');
  });

  it('throws for non-integer inputs', () => {
    expect(() => autoSplit(2.5, 2)).toThrow('playerCount must be a positive integer');
    expect(() => autoSplit(4, 1.5)).toThrow('roomCapacity must be a positive integer');
  });
});

describe('generatePlayerNotifications', () => {
  it('generates correct notifications for 2P game with 4 players', () => {
    const result = autoSplit(4, 2);
    const notifications = generatePlayerNotifications(result);

    expect(notifications).toHaveLength(4);

    // Player 0 in room 0 with co-player 1
    expect(notifications[0]).toEqual({
      playerIndex: 0,
      roomIndex: 0,
      coPlayerIndices: [1],
      roomFull: true,
    });

    // Player 1 in room 0 with co-player 0
    expect(notifications[1]).toEqual({
      playerIndex: 1,
      roomIndex: 0,
      coPlayerIndices: [0],
      roomFull: true,
    });

    // Player 2 in room 1 with co-player 3
    expect(notifications[2]).toEqual({
      playerIndex: 2,
      roomIndex: 1,
      coPlayerIndices: [3],
      roomFull: true,
    });

    // Player 3 in room 1 with co-player 2
    expect(notifications[3]).toEqual({
      playerIndex: 3,
      roomIndex: 1,
      coPlayerIndices: [2],
      roomFull: true,
    });
  });

  it('generates notification for partial room player', () => {
    const result = autoSplit(3, 2);
    const notifications = generatePlayerNotifications(result);

    expect(notifications).toHaveLength(3);

    // Player 2 is alone in a partial room
    expect(notifications[2]).toEqual({
      playerIndex: 2,
      roomIndex: 1,
      coPlayerIndices: [],
      roomFull: false,
    });
  });

  it('single player gets empty co-players list', () => {
    const result = autoSplit(1, 4);
    const notifications = generatePlayerNotifications(result);

    expect(notifications).toHaveLength(1);
    expect(notifications[0].coPlayerIndices).toEqual([]);
  });
});

describe('PARTIAL_ROOM_LOBBY_TIMEOUT_MS', () => {
  it('is 30 seconds', () => {
    expect(PARTIAL_ROOM_LOBBY_TIMEOUT_MS).toBe(30_000);
  });
});
