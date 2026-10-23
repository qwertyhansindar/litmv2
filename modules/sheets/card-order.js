/**
 * Where the Fellowship card sits among a hero's theme cards on the Cards
 * sheet. A slot is the index of the theme it precedes; `themeCount` is last.
 * The Fellowship theme lives on another actor, so its place is a hero flag
 * rather than an item `sort`.
 */

/**
 * Clamp a stored slot to the current theme count. Unset means last.
 * @param {unknown} stored
 * @param {number} themeCount
 * @returns {number}
 */
export function fellowshipSlot(stored, themeCount) {
	if (!Number.isInteger(stored)) return themeCount;
	return Math.min(Math.max(stored, 0), themeCount);
}

/**
 * The slot after dropping the Fellowship card on the theme at `targetIndex`:
 * before it when moving left, after it when moving right, as Foundry's item
 * sort places a dragged item.
 * @param {number} slot
 * @param {number} targetIndex
 * @returns {number}
 */
export function fellowshipSlotAfterDrop(slot, targetIndex) {
	return targetIndex >= slot ? targetIndex + 1 : targetIndex;
}
