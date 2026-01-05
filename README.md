# sml2r-node
A Node.js module for the Super Mario Land 2 Randomizer.

Live version available at [sml2r.com](https://sml2r.com/)

## Installing & Importing

```
npm i sml2r-node
```

```js
import Randomizer from 'sml2r-node';
```

## Usage

### Initialization

```ts
new Randomizer(
    rom: ArrayBuffer,
    settings: Settings | number,
    seed: number
)
```

The `rom` should be a valid Super Mario Land 2 ROM (an `ArrayBuffer` can be created by `readFile` with the `.buffer` property).

The `settings` can either be a valid number (between 0 and 0xFFFFFF), or an object with valid settings (see below).

The `seed` can either be a valid number (between 0x10000000 and 0xFFFFFFFF), or omitted, in which case a random one will be generated.

#### Settings

```ts
{
    randomLevelLocations?: boolean,
    includeDualLocations?: boolean,
    randomBossLocations?: boolean,
    randomBossHealth?: boolean,
    swapAllDualExits?: boolean,
    randomSwapDualExits?: boolean,
    randomGamblingCosts?: boolean,
    randomBonusGames?: boolean,
    randomEnemies?: boolean,
    randomPowerups?: boolean,
    randomPlatforms?: boolean,
    randomGravity?: boolean,
    randomScrollingLevels?: boolean,
    randomFastScrolling?: boolean,
    allFastScrolling?: boolean,
    includeIcePhysics?: boolean,
    randomLuigiPhysics?: boolean,
    allLuigiPhysics?: boolean,
    randomMusic?: boolean,
    randomFastMusic?: boolean,
    disableMusic?: boolean,
    disableSoundFX?: boolean,
    patchDX?: boolean
}
```

### Properties

```ts
valid: boolean
```

If the ROM included in the constructor is valid to be randomized. The validator checks internal name and size.

### Methods

```ts
setSeed(seed: number): void
```

Sets the seed. If the parameter is not a valid seed number (between 0x10000000 and 0xFFFFFFFF), then the seed is unchanged.

```ts
getSeed(): string
```

Returns a hexadecimal representation of the seed. For example, if the seed is 1009416207 (0x3c2a780f), then the method returns the string `'3C2A780F'`.

```ts
setFlags(settings: Settings | number): void
```

Sets the flags. If the parameter is a `Settings` object, it is converted to a number. If the parameter is a number and not a valid flags number (between 0 and 0xFFFFFF), then the flags are unchanged.

```ts
getFlags(): string
```

Returns a hexadecimal representation of the flags. For example, if the flags are 147421 (0x23fdd), then the method returns the string `'023FDD'`.

```ts
getVersion(): string
```

Returns a string indicating the version of the SML2 ROM in the format `v1.#`.

```ts
randomize(): Promise<ArrayBuffer>
```

Randomizes the ROM. The `ArrayBuffer` can be saved into a `.gb` (or `.gbc` if patched with DX) file with `writeFile` and `Buffer.from`.

This method is asynchronous and should be `await`ed in an `async` function.

#### Note

Node's built-in `readFileSync` does not fully capture the buffers. Thus, promise-based versions should be used.

### Example

```js
import { readFile, writeFile } from 'node:fs/promises';
import Randomizer from 'sml2r-node';

const main = async () => {
    const file = await readFile('link/to/sml2.gb');
    const Rando = new Randomizer(file.buffer, {
        randomLevelLocations: true,
        randomBossLocations: true,
        randomBossHealth: true,
        randomSwapDualExits: true,
        randomGamblingCosts: true,
        randomBonusGames: true,
        randomEnemies: true,
        randomPowerups: true,
        randomPlatforms: true,
        randomGravity: true,
        randomFastScrolling: true,
        randomMusic: true,
        randomFastMusic: true
    });
    const buffer = await Rando.randomize();
    await writeFile(`sml2r-${Rando.getSeed()}-${Rando.getFlags()}.gb`, Buffer.from(buffer));
}

main();
```

## Discussion

You can discuss this repository more in my [Discord](https://discord.gg/Q8t9gcZ77s).
