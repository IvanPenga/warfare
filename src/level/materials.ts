/**
 * What a level cell is made of. The ids are stored in level files and are the values of the terrain mask the game
 * builds from the level (phase 3): only add materials at the end, never reorder, renumber or remove them.
 *
 * There is no grass material: grass is drawn on dirt wherever air is above it, so crater edges get grass too.
 */
export const materialIds = {
    air: 0,
    dirt: 1,
    rock: 2,
    bedrock: 3
} as const;

export type MaterialId = (typeof materialIds)[keyof typeof materialIds];

export type MaterialDefinition = {
    id: MaterialId;
    name: string;
    /** Whether explosions can remove it. Bedrock keeps everything inside the level. */
    destructible: boolean;
};

/** The materials that can be painted, in palette order. */
export const materials: MaterialDefinition[] = [
    { id: materialIds.dirt, name: 'Dirt', destructible: true },
    { id: materialIds.rock, name: 'Rock', destructible: true },
    { id: materialIds.bedrock, name: 'Bedrock', destructible: false }
];

export const maxMaterialId = materialIds.bedrock;

export function getMaterialDefinition(id: number): MaterialDefinition | undefined {
    return materials.find((material) => material.id === id);
}

/** Whether tanks and shots collide with the material. Everything except air is solid. */
export function isSolid(id: number): boolean {
    return id !== materialIds.air;
}
