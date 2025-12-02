import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PatchROM } from './PatchROM.js';
import * as text from './text.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface Settings {
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

export default class Randomizer {
    #buffer: ArrayBuffer;
    #rom: Uint8Array;
    #version: number;
    #flags: number;
    #initialSeed: number;
    #seed: number;

    valid: boolean;

    constructor(rom: ArrayBuffer, settings: Settings | number, seed: number) {
        this.#buffer = rom;
        this.#rom = new Uint8Array(this.#buffer);
        this.#version = this.#rom[0x14C];
        this.#flags = typeof settings === 'number' ? (settings >= 0 && settings <= 0xFFFFFF ? this.#sanitizeFlags(settings) : 0) : this.#flagsGenerator(settings);
        this.#initialSeed = seed >= 0x10000000 && seed <= 0xFFFFFFFF ? seed : Math.floor(Math.random() * (0xFFFFFFFF - 0x10000000 + 1) + 0x10000000);
        this.#seed = this.#initialSeed;

        this.valid = this.#authenticate();
    }

    #flagsGenerator(settings: Settings): number {
        let flags = 0;
        if (settings['randomLevelLocations'])   flags = flags | 0b000000000000000000000001;
        if (settings['includeDualLocations'])   flags = flags | 0b000000000000000000000010;
        if (settings['randomBossLocations'])    flags = flags | 0b000000000000000000000100;
        if (settings['randomBossHealth'])       flags = flags | 0b000000000000000000001000;
        if (settings['randomSwapDualExits'])    flags = flags | 0b000000000000000000010000;
        if (settings['swapAllDualExits'])       flags = flags | 0b000000000000000000100000;
        if (settings['randomGamblingCosts'])    flags = flags | 0b000000000000000001000000;
        if (settings['randomBonusGames'])       flags = flags | 0b000000000000000010000000;
        if (settings['randomEnemies'])          flags = flags | 0b000000000000000100000000;
        if (settings['randomPowerups'])         flags = flags | 0b000000000000001000000000;
        if (settings['randomPlatforms'])        flags = flags | 0b000000000000010000000000;
        if (settings['randomGravity'])          flags = flags | 0b000000000000100000000000;
        if (settings['randomScrollingLevels'])  flags = flags | 0b000000000001000000000000;
        if (settings['randomFastScrolling'])    flags = flags | 0b000000000010000000000000;
        if (settings['allFastScrolling'])       flags = flags | 0b000000000100000000000000;
        if (settings['includeIcePhysics'])      flags = flags | 0b000000001000000000000000;
        if (settings['randomLuigiPhysics'])     flags = flags | 0b000000010000000000000000;
        if (settings['allLuigiPhysics'])        flags = flags | 0b000000100000000000000000;
        if (settings['randomMusic'])            flags = flags | 0b000001000000000000000000;
        if (settings['randomFastMusic'])        flags = flags | 0b000010000000000000000000;
        if (settings['disableMusic'])           flags = flags | 0b000100000000000000000000;
        if (settings['disableSoundFX'])         flags = flags | 0b001000000000000000000000;
        if (settings['patchDX'])                flags = flags | 0b010000000000000000000000;
        return this.#sanitizeFlags(flags);
    }

    #sanitizeFlags(flags: number): number {
        let clean = flags;
        // if include duals but no randomizing levels...
        if ((clean & 0b000000000000000000000011) === 0b000000000000000000000010) {
            // ...then randomize the levels
            clean = clean | 0b000000000000000000000001;
        }
        // if both randomly swapping duals and swapping all duals...
        if ((clean & 0b000000000000000000110000) === 0b000000000000000000110000) {
            // ...then swap all dual exits
            clean = clean & 0b111111111111111111101111;
        }
        // if both randomly fast scrolling and all fast scrolling...
        if ((clean & 0b000000000110000000000000) === 0b000000000110000000000000) {
            // ...then all fast scrolling
            clean = clean & 0b111111111101111111111111;
        }
        // if both randomly Luigi physics and all Luigi physics...
        if ((clean & 0b000000110000000000000000) === 0b000000110000000000000000) {
            // ...then all Luigi physics
            clean = clean & 0b111111101111111111111111;
        }
        return clean;
    }

    // prng adapted from https://github.com/bit101/lcg/blob/master/lcg.js
    #nextRNG(): number {
        this.#seed = (this.#seed * 1664525 + 1013904223) % Math.pow(2, 32);
        return this.#seed;
    }

    #randomFloat(): number {
        const float = this.#nextRNG() / Math.pow(2, 32);
        return float;
    }

    #randomInt(lim: number): number {
        return Math.floor(this.#randomFloat() * lim);
    }

    #randomBool(): boolean {
        return this.#randomFloat() < 0.5;
    }

    // adapted from https://github.com/sindresorhus/array-shuffle/blob/main/index.js
    #shuffle(a: any[]): void {
        for (let i = a.length - 1; i > 0; i--) {
            const r = this.#randomInt(i + 1);
            [a[i], a[r]] = [a[r], a[i]];
        }
    }

    // adapted from https://github.com/vhelin/wla-dx/blob/master/wlalink/compute.c
    #checksum(): void {
        let csum = 0;
        let comp = 0;
        for (let i = 0x00; i < 0x14E; i++) {
            csum += this.#rom[i];
        }
        for (let j = 0x150, e = this.#rom[0x148] == 0x05 ? 0xFFFFF : 0x7FFFF; j <= e; j++) {
            csum += this.#rom[j];
        }
        this.#rom[0x14E] = (csum >> 8) & 0xFF;
        this.#rom[0x14F] = csum & 0xFF;
        for (let k = 0x134; k <= 0x14C; k++) {
            comp += this.#rom[k];
        }
        comp += 25;
        this.#rom[0x14D] = 0 - (comp & 0xFF);
    }

    #authenticate(): boolean {
        const count = [0x4D, 0x41, 0x52, 0x49, 0x4F, 0x4C, 0x41, 0x4E, 0x44, 0x32, 0x00].reduce((prev, curr, i) => this.#rom[0x134 + i] === curr ? prev - 1 : prev, 11);
        return count === 0 && this.#rom[0x148] !== 0x05;
    }

    #spriteExtract(a: number, b: number): number {
        const x = ((0b00010000 & a) << 2);
        const y = ((0b11100000 & a) >>> 2);
        const z = ((0b11100000 & b) >>> 5);
        return (x | y | z);
    }

    #spriteInsert(a: number, b: number, s: number): number[] {
        let x = ((s & 0b01000000) >>> 2);
        let y = ((s & 0b00111000) << 2);
        let z = ((s & 0b00000111) << 5);
        return [((a & 0b00001111) | x | y), ((b & 0b00011111) | z)];
    }

    #spriteCopy(arr: number[], pos: number): void {
        for (let i = 0; i < 2; i++) {
            this.#rom[pos + i] = arr[i];
        }
    }

    #spriteRandomize(arr: number[], idx: number): void {
        const s = this.#spriteInsert(this.#rom[idx], this.#rom[idx + 1], arr[this.#randomInt(arr.length)]);
        this.#spriteCopy(s, idx);
    }

    #randomizeGambling(): void {
        [0x3F45F, 0x3F428, 0x3F3F1, 0x3F3BA].forEach((offset, index) => {
            const costMin = 20 + 140 * index;
            const costMax = 120 + 280 * index;
            const cost = this.#randomInt(costMax - costMin + 1) + costMin;
            this.#rom[offset] = cost % 100;
            this.#rom[offset + 1] = Math.floor(cost / 100);
        });
    }

    #randomizeLevels(): void {
        let levels = [0x00, 0x01, 0x03, 0x04, 0x06, 0x0A, 0x0B, 0x0C, 0x0E, 0x15, 0x16, 0x19, 0x1A, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F];
        let offsets = [0x3C218, 0x3C23B, 0x3C239, 0x3C23C, 0x3C240, 0x3C268, 0x3C269, 0x3C26A, 0x3C25E, 0x3C24B, 0x3C24C, 0x3C21C, 0x3C27E, 0x3C290, 0x3C25C, 0x3C23E, 0x3C282, 0x3C292];
        // mixing in secret levels
        if ((this.#flags & 0b000000000000000000000010) > 0) {
            levels = [...levels, 0x02, 0x07, 0x08, 0x0F, 0x11, 0x12, 0x14];
            offsets = [...offsets, 0x3C23A, 0x3C241, 0x3C242, 0x3C260, 0x3C21D, 0x3C254, 0x3C24A];
        } else {
            const secrets = [0x02, 0x07, 0x08, 0x0F, 0x11, 0x12, 0x14];
            this.#shuffle(secrets);
            [0x3C23A, 0x3C241, 0x3C242, 0x3C260, 0x3C21D, 0x3C254, 0x3C24A].forEach((offset, index) => this.#rom[offset] = secrets[index]);
        }
        do {
            this.#shuffle(levels);
        } while (levels[0] === 0x1A); // prevents 0x1A as Mushroom House
        offsets.forEach((offset, index) => this.#rom[offset] = levels[index]);
        // ensure level 11 on overworld is always same level
        this.#rom[0x3C232] = this.#rom[0x3C21D];

        // level offset and zone clear byte
        const bossSetOne = [[0x3C238, 0x05], [0x3C243, 0x09], [0x3C24D, 0x0E], [0x3C255, 0x11], [0x3C261, 0x17], [0x3C26B, 0x1D]];
        // level byte and zone clear offset
        const bossSetTwo = [[0x05, 0x304F6], [0x09, 0x304FA], [0x17, 0x30508], [0x13, 0x30504], [0x10, 0x30501], [0x0D, 0x304FE]];
        this.#shuffle(bossSetTwo);
        bossSetOne.forEach((arr, index) => {
            this.#rom[arr[0]] = bossSetTwo[index][0];
            this.#rom[bossSetTwo[index][1]] = arr[1];
        });
    }

    #randomizeBosses(): void {
        // boss offset and gfx byte
        let bossSetOne = [[0x8E03, 0x84], [0x8E08, 0x8C], [0x8E0D, 0xAC], [0x8E12, 0x9C], [0x8E17, 0x94], [0x8E1C, 0xA4]];
        // boss byte (level) and gfx offset
        let bossSetTwo = [[0x05, 0x1413B], [0x09, 0x1413D], [0x0D, 0x14145], [0x10, 0x14141], [0x13, 0x1413F], [0x17, 0x14143]];
        this.#shuffle(bossSetTwo);
        const v = this.#version === 2 ? 7 : 0;
        bossSetOne.forEach((arr, index) => {
            this.#rom[arr[0]] = bossSetTwo[index][0];
            this.#rom[bossSetTwo[index][1] - v] = arr[1] - v;
        });
    }

    #randomizeBossHP(): void {
        // pigs
        [0x8FBB, 0x8FA9, 0x8E58].forEach(offset => this.#rom[offset] = 2 * (this.#randomInt(3) + 2));
        // bird, octopus, rat
        [0x8E52, 0x8E5B, 0x8E61].forEach(offset => this.#rom[offset] = 2 * (this.#randomInt(4) + 3));
        // tatanga, witch, wario
        [0x8E5E, 0x8E55, 0x8E64, 0x8E67, 0x8E6A].forEach(offset => this.#rom[offset] = 2 * (this.#randomInt(3) + 3));
    }

    #swapDualExits(all: boolean): void {
        [
            {byte: 0x02, offsets: [0x2A385, 0x29947]},
            {byte: 0x11, offsets: [0x4C8EB, 0x4CA7F]},
            {byte: 0x12, offsets: [0x4DA53, 0x4D27B]},
            {byte: 0x14, offsets: [0x54ACE, 0x5475A]},
            {byte: 0x07, offsets: [0x49215, 0x4949E]},
            {byte: 0x08, offsets: [0x49F61, 0x499A7]},
            {byte: 0x0F, offsets: [0x51D99, 0x51D29]}
        ].forEach(level => {
            if (all === false) {
                if (this.#randomBool() === true) {
                    [this.#rom[level.offsets[0]], this.#rom[level.offsets[1]]] = [this.#rom[level.offsets[1]], this.#rom[level.offsets[0]]];
                }
            } else if (this.#rom[0x3C24A] === 0x11 || (level.byte !== 0x11 && this.#rom[0x3C24A] !== level.byte)) {
                [this.#rom[level.offsets[0]], this.#rom[level.offsets[1]]] = [this.#rom[level.offsets[1]], this.#rom[level.offsets[0]]];
            }
        });
    }

    #randomizeBonus(): void {
        // conveyor belt
        for (let i = 0x60A58; i <= 0x60A7F; i++) {
            this.#rom[i] = this.#randomInt(5);
        }
        for (let i = 0x60A2F; i <= 0x60A56; i++) {
            this.#rom[i] = this.#randomInt(5);
        }
        for (let i = 0x60A1A; i <= 0x60A2D; i++) {
            this.#rom[i] = this.#randomInt(5);
        }
        // wires
        for (let i = 0x3E766; i <= 0x3E76F; i += 3) {
            this.#rom[i] = this.#randomInt(4) + 0x2D;
        }
    }

    #randomizeEnemies(): void {
        [
            {"enemies": [0x01, 0x08, 0x09, 0x3A], "start": 0xE077, "end": 0xE0BC},                          //lv00
            {"enemies": [0x01, 0x08, 0x09, 0x3A], "start": 0xE955, "end": 0xE99D},                          //lv17
            {"enemies": [0x08, 0x09, 0x3A], "start": 0xEA2F, "end": 0xEA7D},                                //lv19
            {"enemies": [0x08, 0x09, 0x3A], "start": 0xEAA3, "end": 0xEACD},                                //lv1B
            {"enemies": [0x1F, 0x20, 0x21, 0x22], "start": 0xE0BD, "end": 0xE123},                          //lv01
            {"enemies": [0x44, 0x58], "start": 0xE124, "end": 0xE181},                                      //lv02
            {"enemies": [0x35, 0x3E, 0x40, 0x41, 0x42], "start": 0xE182, "end": 0xE1EE},                    //lv03
            {"enemies": [0x33, 0x34, 0x5D], "start": 0xE1EF, "end": 0xE249},                                //lv04
            {"enemies": [0x08, 0x39, 0x3A], "start": 0xE24A, "end": 0xE2A1},                                //lv05
            {"enemies": [0x4D, 0x54, 0x55, 0x56, 0x5E, 0x5F], "start": 0xE30C, "end": 0xE384},              //lv07
            {"enemies": [0x4D, 0x57], "start": 0xE385, "end": 0xE3D3},                                      //lv08
            {"enemies": [0x01, 0x40, 0x4B], "start": 0xE432, "end": 0xE49B},                                //lv0A
            {"enemies": [0x08, 0x09, 0x3A, 0x44, 0x4D], "start": 0xE49C, "end": 0xE4F9},                    //lv0B
            {"enemies": [0x05, 0x06, 0x07, 0x08, 0x09, 0x0B, 0x3A, 0x3D], "start": 0xE5C2, "end": 0xE62B},  //lv0E
            {"enemies": [0x05, 0x39, 0x57, 0x5B], "start": 0xE706, "end": 0xE77B},                          //lv11
            {"enemies": [0x5C, 0x5E, 0x5F], "start": 0xE7C8, "end": 0xE822},                                //lv13
            {"enemies": [0x22, 0x23, 0x25, 0x27], "start": 0xE823, "end": 0xE88F},                          //lv14
            {"enemies": [0x07, 0x33, 0x34, 0x3D, 0x5D], "start": 0xE890, "end": 0xE8F6},                    //lv15
            {"enemies": [0x01, 0x08, 0x09, 0x34, 0x3A, 0x55], "start": 0xE8F7, "end": 0xE954},              //lv16
            {"enemies": [0x68, 0x69], "start": 0xE99E, "end": 0xEA2E},                                      //lv18a
            {"enemies": [0x6E, 0x6F], "start": 0xE99E, "end": 0xEA2E},                                      //lv18b
            {"enemies": [0x01, 0x09], "start": 0xEB55, "end": 0xEBB5}                                       //lv1F
        ].forEach(level => {
            for (let i = level.start; i < level.end; i +=3) {
                const sprite = this.#spriteExtract(this.#rom[i], this.#rom[i + 1]);
                if (this.#rom[i] === 0xFF) {
                    i -= 2;
                } else if (level.enemies.includes(sprite)) {
                    this.#spriteRandomize(level.enemies, i);
                }
            }
        });
        for (let i = 0xE2A2; i < 0xE30B; i += 3) { //lv06
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x4E:
                    this.#spriteRandomize([0x4D, 0x4E, 0x51, 0x53], i);
                    break;
                case 0x4F:
                    this.#spriteRandomize([0x4D, 0x4F, 0x51, 0x53], i);
                    break;
                case 0x4D: case 0x51: case 0x53:
                    this.#spriteRandomize([0x4D, 0x51, 0x53], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE3D4; i < 0xE431; i += 3) { //lv09
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x4F:
                    this.#spriteRandomize([0x4D, 0x4F, 0x53, 0x5A, 0x5C], i);
                    break;
                case 0x4D: case 0x53: case 0x5A: case 0x5C:
                    this.#spriteRandomize([0x4D, 0x53, 0x5A, 0x5C], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE4FA; i < 0xE560; i += 3) { //lv0C
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x49:
                    this.#spriteRandomize([0x01, 0x47, 0x48, 0x49, 0x53], i);
                    break;
                case 0x01: case 0x47: case 0x48:
                    this.#spriteRandomize([0x01, 0x47, 0x48, 0x53], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE561; i < 0xE5C1; i += 3) { //lv0D
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x43:
                    this.#spriteRandomize([0x09, 0x43, 0x4D, 0x53], i);
                    break;
                case 0x4C:
                    this.#spriteRandomize([0x09, 0x4C, 0x4D, 0x53], i);
                    break;
                case 0x09: case 0x4D:
                    this.#spriteRandomize([0x09, 0x4D, 0x53], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE62C; i < 0xE6BF; i += 3) { //lv0F
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x01:
                    this.#spriteRandomize([0x01, 0x06, 0x53, 0x55, 0x56], i);
                    break;
                case 0x21:
                    this.#spriteRandomize([0x06, 0x21, 0x53, 0x55, 0x56], i);
                    break;
                case 0x06: case 0x55: case 0x56:
                    this.#spriteRandomize([0x06, 0x53, 0x55, 0x56], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE6C0; i < 0xE705; i += 3) { //lv10
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x21:
                    this.#spriteRandomize([0x01, 0x08, 0x20, 0x21, 0x3A, 0x55], i);
                    break;
                case 0x01: case 0x08: case 0x20: case 0x3A: case 0x55:
                    this.#spriteRandomize([0x01, 0x08, 0x20, 0x3A, 0x55], i);
                    break;
                default: break;
            }
        }
        for (let i = 0xE77C; i < 0xE7C7; i += 3) { //lv12
            switch (this.#spriteExtract(this.#rom[i], this.#rom[i + 1])) {
                case 0x4D:
                    this.#spriteRandomize([0x4D, 0x58], i);
                    break;
                case 0x58: case 0x5A:
                    this.#spriteRandomize([0x4D, 0x58, 0x5A], i);
                    break;
                default: break;
            }
        }
        // thwomps in wario's castle
        [0xE9D6, 0xE9D9, 0xE9DF, 0xE9E2, 0xE9E5].forEach(offset => this.#rom[offset] = this.#randomFloat() < 0.1 ? 0x35 : 0x34);
        // piranha plants
        for (let i = 0xE077; i < 0xEBB5; i += 3) {
            if (i < 0xE30C || i > 0xE384 && i < 0xE3D4 || i > 0xE431 && i < 0xE8F7 || i > 0xE954) {
                const sprite = this.#spriteExtract(this.#rom[i], this.#rom[i + 1]);
                if (this.#rom[i] === 0xFF) {
                    i -= 2;
                } else if (sprite === 0x0C || sprite === 0x0D) {
                    this.#spriteCopy(this.#spriteInsert(this.#rom[i], this.#rom[i + 1], this.#randomBool() ? 0x0C : 0x0D), i);
                }
            }
        }
    }

    #randomizePowerups(): void {
        const free = [0x0F, 0x1B, 0x1C, 0x1D, 0x1E, 0x1F];
        const block = [0x11, 0x12, 0x13, 0x14, 0x15, 0x19];
        for (let i = 0xE077; i < 0xEBB5; i += 3) {
            const sprite = this.#spriteExtract(this.#rom[i], this.#rom[i + 1]);
            if (this.#rom[i] == 0xFF) {
                i -= 2;
            } else if (free.includes(sprite)) {
                if (i >= 0xE0BD && i < 0xE123) {
                    if (sprite !== 0x1F) this.#spriteRandomize(free.slice(0, free.length - 1), i)
                } else {
                    this.#spriteRandomize(sprite === 0x1F ? free : free.slice(0, free.length - 1), i);
                }
            } else if (block.includes(sprite)) {
                this.#spriteRandomize(block, i);
            }
        }
        [0xA9A9, 0xACA7].forEach(offset => this.#rom[offset] = [0x1B, 0x1C, 0x1D, 0x1F][this.#randomInt(4)]);
    }

    #randomizePlatforms(): void {
        [
            {"platforms": [0x28, 0x29, 0x2A, 0x2B, 0x2D, 0x2E], "start": 0xE1EF, "end": 0xE249},
            {"platforms": [0x38, 0x3D], "start": 0xE24A, "end": 0xE2A1},
            {"platforms": [0x60, 0x61, 0x67], "start": 0xE99E, "end": 0xEA2E}
        ].forEach(level => {
            for (let i = level.start; i < level.end; i +=3) {
                const sprite = this.#spriteExtract(this.#rom[i], this.#rom[i + 1]);
                if (this.#rom[i] === 0xFF) {
                    i -= 2;
                } else if (level.platforms.includes(sprite)) {
                    this.#spriteRandomize(level.platforms, i);
                }
            }
        });
        for (let i = 0xE9A3; i < 0xE9CE; i += 3) {
            this.#rom[i] = (this.#rom[i] === 0x5E ? 0x57 : 0x38) + this.#randomInt(8);
        }
    }

    #randomizeGravity(): void {
        const v = this.#version === 0 ? 0 : 3;
        for (let i = 0x1F91 + v; i <= 0x1FB0 + v; i++) {
            if (i === 0x1F98 + v || i === 0x1FA6 + v) {
                continue;
            }
            switch (this.#rom[i]) {
                case 0x00:
                    this.#rom[i] = this.#randomFloat() < 0.05 ? 0x01 : this.#randomFloat() < 0.1 && i !== 0x1F99 + v ? 0x08 : 0x00;
                    break;
                case 0x01:
                    this.#rom[i] = this.#randomFloat() < 0.1 ? 0x00 : this.#randomFloat() < 0.3 ? 0x08 : 0x01;
                    break;
                case 0x08:
                    this.#rom[i] = this.#randomFloat() < 0.3 ? 0x00 : this.#randomFloat() < 0.05 ? 0x01 : 0x08;
                    break;
                default: break;
            }
        }
    }

    #randomizeScrolling(): void {
        const v = this.#version === 0 ? 0 : 3;
        [0x1F71, 0x1F72, 0x1F73, 0x1F74, 0x1F76, 0x1F79, 0x1F7A, 0x1F7B, 0x1F7C, 0x1F7D, 0x1F7E, 0x1F7F, 0x1F81, 0x1F82, 0x1F83, 0x1F84, 0x1F85, 0x1F88, 0x1F8A, 0x1F8F, 0x1F90]
        .forEach(level => {
            if (this.#rom[level + v] === 0x00 && this.#randomFloat() < 0.08) {
                this.#rom[level + v] = 0x01;
            } else if (this.#rom[level + v] === 0x01 && this.#randomFloat() < 0.25) {
                this.#rom[level + v] = 0x00;
            }
        });
        // if level 12 is scrolling...
        if (this.#rom[0x1F83 + v] === 0x01) {
            if (this.#rom[0x1FA3 + v] === 0x08) {
                // ...remove scrolling if it has moon physics
                this.#rom[0x1F83 + v] = 0x00;
            } else {
                // ...or replace the midway bell with a money bag if no moon physics
                this.#spriteCopy(this.#spriteInsert(0xE7A6, 0xE7A7, 0x1F), 0xE7A6);
            }
        }
    }

    #fastScrolling(all: boolean): void {
        const v = this.#version === 0 ? 0 : 3;
        const levels = [0x00, 0x05, 0x09, 0x0B, 0x0D, 0x10, 0x13, 0x17, 0x19, 0x1F];
        const start = this.#rom[0x148] === 0x05 ? 0x93D40 : 0x33040;
        // include level 11 if no moon physics
        if (this.#rom[0x1FA2 + v] !== 0x08) {
            levels.push(0x11);
        }
        // include level 0C if not the first level
        if (this.#rom[0x3C218] !== 0x0C) {
            levels.push(0x0C);
        }
        levels.forEach(level => {
            if (this.#rom[0x1F71 + v + level] === 0x01 && (all || this.#randomFloat() < 0.4)) {
                this.#rom[start + level] = 0x02;
            }
        });
    }

    #randomizeIcePhysics(): void {
        for (let i = 0; i < 0x20; i++) {
            if (this.#randomFloat() < 0.1) {
                this.#rom[(this.#rom[0x148] === 0x05 ? 0x93D20 : 0x33020) + i] = 0x00;
            }
        }
    }

    #randomizeLuigiPhysics(all: boolean): void {
        for (let i = 0; i < 0x20; i++) {
            if (all || this.#randomFloat() < 0.15) {
                this.#rom[(this.#rom[0x148] === 0x05 ? 0x93D00 : 0x33000) + i] = 0x04; // jump height
                this.#rom[(this.#rom[0x148] === 0x05 ? 0x93D20 : 0x33020) + i] = 0x03; // move speed
            }
            // mario only for DX
            if (!all && this.#rom[0x148] === 0x05 && this.#rom[0x93D00 + i] === 0xFF && this.#randomFloat() < 0.15) {
                this.#rom[0x93D00 + i] = 0x00;
                this.#rom[0x93D20 + i] = 0x04;
            }
        }
    }

    #randomizeMusic(): void {
        // overworld
        [0x3004F, 0x3EA9B, 0x3D186, 0x3D52B, 0x3D401, 0x3D297, 0x3D840, 0x3D694, 0x3D758]
        .forEach(offset => this.#rom[offset] = [0x05, 0x06, 0x0E, 0x10, 0x12, 0x1B, 0x1C, 0x1E][this.#randomInt(8)]);
        // levels
        if (this.#randomFloat() < 0.02) { // all star song
            this.#rom[0x3004F] = 0x1D;
            for (let i = 0x5619; i <= 0x5885; i += 0x14) {
                this.#rom[i] = 0x1D;
            }
        } else {
            for (let i = 0x5619; i <= 0x5885; i += 0x14) {
                this.#rom[i] = [0x01, 0x0B, 0x11, 0x13, 0x14, 0x17, 0x1D, 0x1F, 0x28][this.#randomInt(9)];
            }
        }
    }

    #randomizeFastMusic(): void {
        [0x1205C, 0x1251F, 0x12B45, 0x12CF2, 0x12E9B, 0x131A6, 0x13879, 0x13A38, 0x13EC6]
        .forEach(offset => {
            if (this.#randomFloat() < 0.3) {
                this.#rom[offset] += 0x04;
                this.#rom[offset + 0x01] = this.#rom[offset + 0x03];
            }
        });
    }

    #customFileSelectScreen(): void {
        // randomizer text
        [0x46, 0x35, 0x42, 0x38, 0x43, 0x41, 0x3D, 0x4E, 0x39, 0x46].forEach((letter, i) => this.#rom[0x30A99 + i] = letter);
        for (let i = 0; i < this.getSeed().length; i++) {
            this.#rom[0x30AD8 + i] = text.ascii.find(letter => letter.char === this.getSeed().charAt(i)).byte;
        }
        // flags even: 0x30AFB - (flags.length / 2 - 1)
        // flags odd:  0x30AFB - Math.floor(flags.length / 2)
        for (let i = 0; i < this.getFlags().length; i++) {
            this.#rom[0x30AF9 + i] = text.ascii.find(letter => letter.char === this.getFlags().charAt(i)).byte;
        }
    }

    #credits(): void {
        const writeSentence = (offset, line) => {
            for (let i = 0; i < line.length; i++) {
                this.#rom[offset + i] = line.charCodeAt(i);
            }
        }
        // quotes
        const quotes = text.sentences.quotes[this.#randomInt(text.sentences.quotes.length)];
        [0x696CF, 0x696E3].forEach((offset, index) => writeSentence(offset, quotes[`line${index + 1}`]));
        // facts
        let facts = [...text.sentences.facts];
        this.#shuffle(facts);
        facts = facts.slice(0, 3);
        [0x69ADC, 0x69AF0, 0x69B04].forEach((offset, index) => writeSentence(offset, facts[0][`line${index + 1}`]));
        [0x69B19, 0x69B2D, 0x69B41].forEach((offset, index) => writeSentence(offset, facts[1][`line${index + 1}`]));
        [0x69B56, 0x69B6A, 0x69B7E].forEach((offset, index) => writeSentence(offset, facts[2][`line${index + 1}`]));
        // song
        const song = text.sentences.songs[this.#randomInt(text.sentences.songs.length)];
        [0x69C37, 0x69C4C, 0x69C61, 0x69C76, 0x69C8B, 0x69CA0, 0x69CB5, 0x69CCA].forEach((offset, index) => writeSentence(offset, song[`line${index + 1}`]));
        // rest
        text.sentences.other.forEach(sentence => writeSentence(sentence.offset, sentence.line));
    }

    setSeed(seed: number): void {
        if (seed >= 0x10000000 && seed <= 0xFFFFFFFF) {
            this.#initialSeed = seed;
            this.#seed = this.#initialSeed;
        }
    }

    getSeed(): string {
        return this.#initialSeed.toString(16).toUpperCase();
    }

    setFlags(settings: Settings | number): void {
        if (typeof settings === 'number') {
            this.#flags = settings >= 0 && settings <= 0xFFFFFF ? this.#sanitizeFlags(settings) : this.#flags;
        } else {
            this.#flags = this.#flagsGenerator(settings);
        }
    }

    getFlags(): string {
        return ('000000' + this.#flags.toString(16)).slice(-6).toUpperCase();
    }

    getVersion(): string {
        return `v1.${this.#version}`;
    }

    async randomize(): Promise<ArrayBuffer> {
        const basePatchBuffer = await readFile(path.resolve(__dirname, `patches/base${(this.#flags & 0b010000000000000000000000) > 0 ? '_dx' : ''}${this.#version === 2 ? '_v2' : ''}.ips`));
        this.#buffer = PatchROM(this.#buffer, basePatchBuffer.buffer);
        this.#rom = new Uint8Array(this.#buffer);
        if ((this.#flags & 0b000000000000000001000000) > 0) {
            const slotsBuffer = await readFile(path.resolve(__dirname, `patches/slots${this.#rom[0x148] === 0x05 ? '_dx' : ''}.ips`));
            this.#buffer = PatchROM(this.#buffer, slotsBuffer.buffer);
            this.#rom = new Uint8Array(this.#buffer);
            this.#randomizeGambling();
        }
        if ((this.#flags & 0b000000000000000000000001) > 0) {
            this.#randomizeLevels();
        }
        if ((this.#flags & 0b000000000000000000000100) > 0) {
            this.#randomizeBosses();
        }
        if ((this.#flags & 0b000000000000000000001000) > 0) {
            this.#randomizeBossHP();
        }
        if ((this.#flags & 0b000000000000000000010000) > 0) {
            this.#swapDualExits(false);
        }
        if ((this.#flags & 0b000000000000000000100000) > 0) {
            this.#swapDualExits(true);
        }
        if ((this.#flags & 0b000000000000000010000000) > 0) {
            this.#randomizeBonus();
        }
        if ((this.#flags & 0b000000000000000100000000) > 0) {
            this.#randomizeEnemies();
        }
        if ((this.#flags & 0b000000000000001000000000) > 0) {
            this.#randomizePowerups();
        }
        if ((this.#flags & 0b000000000000010000000000) > 0) {
            this.#randomizePlatforms();
        }
        if ((this.#flags & 0b000000000000100000000000) > 0) {
            this.#randomizeGravity();
        }
        if ((this.#flags & 0b000000000001000000000000) > 0) {
            this.#randomizeScrolling();
        }
        if ((this.#flags & 0b000000000010000000000000) > 0) {
            this.#fastScrolling(false);
        }
        if ((this.#flags & 0b000000000100000000000000) > 0) {
            this.#fastScrolling(true);
        }
        if ((this.#flags & 0b000000001000000000000000) > 0) {
            this.#randomizeIcePhysics();
        }
        if ((this.#flags & 0b000000010000000000000000) > 0) {
            this.#randomizeLuigiPhysics(false);
        }
        if ((this.#flags & 0b000000100000000000000000) > 0) {
            this.#randomizeLuigiPhysics(true);
        }
        if ((this.#flags & 0b000001000000000000000000) > 0) {
            this.#randomizeMusic();
        }
        if ((this.#flags & 0b000010000000000000000000) > 0) {
            this.#randomizeFastMusic();
        }
        if ((this.#flags & 0b000100000000000000000000) > 0) {
            this.#rom[0x10047] = 0xAF;
        }
        if ((this.#flags & 0b001000000000000000000000) > 0) {
            this.#rom[0x100E1] = 0xAF;
        }
        this.#customFileSelectScreen();
        this.#credits();
        this.#rom[0x30388] = 0x00; // disable easy mode
        this.#checksum();
        return this.#buffer;
    }
}