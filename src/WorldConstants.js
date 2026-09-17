export const SCREEN_LENGTH = 60;   // Length of each screen along Z axis
export const PATH_WIDTH = 8;       // Width of corridor
export const TUNNEL_FLOOR_Y = -12; // Underground tunnel floor (ladder screens)
export const CEIL_TOP_Y = -7;      // Cave ceiling top (landing on it is hit kill)
export const PIT_FLOOR_Y = -1.0;   // Shallow surface-pit floor, independent from the tunnel

// 1-based room number (001..255) for any screen index, wrapping both ways.
export function screenRoom(index) {
  return (((index % 255) + 255) % 255) + 1;
}
