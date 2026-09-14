# Map data and screen generation

## Surface map

`src/maps/surface.js` is the fixed data source for surface screens. Each screen is keyed by a three-digit phase string:

```js
{
  Pit: null | 'Quicksand' | 'Crocodile' | 'Tar',
  Hole: 0 | 1 | 3,
  Shifting: true | false,
  Log: 0 | 1 | 2 | 3,
  Rolling: true | false,
  Vine: true | false,
  Treasure: null | 'Money' | 'Silver' | 'Gold' | 'Diamond',
  Enemies: null | 'Snake' | 'Campfire',
  Wall: null | 'N' | 'S',
}
```

Field meanings:

- `Pit` identifies the surface hazard type.
- `Hole` is the number of surface openings: zero, one, or three.
- `Shifting` identifies moving quicksand behavior.
- `Log` stores the rolling-log count from zero to three.
- `Rolling` distinguishes rolling logs from stationary logs.
- `Vine` identifies a vine crossing.
- `Treasure` identifies the treasure type, when present.
- `Enemies` identifies a snake or campfire overlay.
- `Wall` stores the authentic wall side for hole screens. Non-hole screens use `null`.

Crocodile screens do not receive rolling logs. A crocodile screen is represented by `Pit: 'Crocodile'`, with `Vine` indicating whether a vine is also present.

## Shortcut map

`src/maps/shortcuts.js` is a dictionary where the key is the entry screen and the value is the exit screen:

```js
export const UNDERGROUND_SHORTCUTS = Object.freeze({
  '001': 250,
  '250': 1,
});
```

Every hole screen has one entry in this dictionary. The mapping is bidirectional: an exit screen can also be used as a future entry screen.

The current screen number is the lookup key. No runtime route search is performed when Harry enters the tunnel.

## Screen indices and phases

The renderer uses zero-based world indices, while the map files use human-readable screens `001` through `255`:

```text
map screen 001 -> world index 0
map screen 255 -> world index 254
```

The world still loops through the authentic 255-screen sequence. Conversion must normalize indices with modulo 255 so movement works in both directions.

## Rendering authority

The surface map determines which surface category is rendered. The shortcut dictionary determines the underground destination. The LFSR remains available for authentic object and sequence data, but it must not recreate stale underground walls or scorpions while Harry travels through an active shortcut.

## Loading rules

- Surface features are loaded with the current screen.
- Entering a surface screen with `Hole > 0` activates its shortcut.
- Only the active entry and exit ladders are visible.
- Other loaded ladder screens remain hidden and sealed.
- Leaving the surface ladder screen deactivates the dynamic shortcut elements.
