import { ChallengeSheet } from "../actor/challenge/challenge-sheet.js";
import { FellowshipSheet } from "../actor/fellowship/fellowship-sheet.js";
import { HeroSheet } from "../actor/hero/hero-sheet.js";
import { JourneySheet } from "../actor/journey/journey-sheet.js";
import { FLAGS } from "../system/config.js";
import { LitmActorSheet } from "./base-actor-sheet.js";
import { FELLOWSHIP_KEY, fellowshipSlot, moveCard } from "./card-order.js";
import { isDescriptionShort } from "./description-fit.js";

const LANDSCAPE_OPTIONS = {
	classes: ["litm-landscape"],
	position: {
		width: LitmActorSheet.LANDSCAPE_WIDTH,
	},
};

/**
 * The hero landscape variant starts wider so the responsive board layout
 * (4-up themes, split inventory/fellowship band, 3-up story themes) kicks
 * in by default. The layout itself is driven by container queries on
 * .litm-hero-sheet, so resizing either variant past the breakpoint shows
 * the same wide layout; this just picks the initial width.
 */
export class HeroSheetLandscape extends HeroSheet {
	static DEFAULT_OPTIONS = {
		classes: ["litm-landscape"],
		position: { width: 1280 },
	};
}

/**
 * Printed-card hero variant: tags lead, quest and tracks recede, portrait
 * always framed. Styling lives under `.litm-hero-cards` (litmv2.css §25);
 * `cardsLayout` switches the few template branches that differ.
 */
export class HeroSheetCards extends HeroSheet {
	static DEFAULT_OPTIONS = {
		classes: ["litm-hero-cards"],
		// Opens as wide as the Landscape sheet, so the themes row fits.
		position: { width: 1280 },
		actions: {
			toggleHeroPanel: HeroSheetCards._onToggleHeroPanel,
			flipThemeCard: HeroSheetCards._onFlipThemeCard,
		},
	};

	/** Class on the sheet root while the wide portrait panel is folded away. */
	static PANEL_COLLAPSED_CLASS = "litm-hero-cards--panel-collapsed";

	/** Theme cards turned to their back (the note), by `data-flip-key`; kept across re-renders. */
	#flipped = new Set();

	/** Panel fold state; seeded from the client setting, then kept here so a re-render never snaps back. */
	#panelCollapsed = null;

	/** @type {ResizeObserver|null} */
	#resizeObserver = null;

	/** Name button and its text stand-in, swapped while the toggle cannot act. */
	#nameToggle = null;
	#nameText = null;

	/** Original description toggle attributes, restored when the toggle can act again. */
	#descAttrs = null;

	/** Apply a panel state to the sheet root and the toggle's ARIA. */
	#applyPanelCollapsed(collapsed) {
		// Only the art layout has a panel to fold (and a toggle to unfold it).
		const hasPanel = !!this.element.querySelector(".litm--play-header--art");
		this.element.classList.toggle(
			HeroSheetCards.PANEL_COLLAPSED_CLASS,
			hasPanel && collapsed,
		);
		this.element
			.querySelector(".litm--hero-panel-toggle")
			?.setAttribute("aria-expanded", String(!collapsed));
	}

	/**
	 * Fold or unfold the portrait panel. Remembered per client (a client
	 * setting), so every Cards sheet this user opens keeps the same choice.
	 * @this {HeroSheetCards}
	 */
	static async _onToggleHeroPanel() {
		this.#panelCollapsed = !this.#panelCollapsed;
		this.#applyPanelCollapsed(this.#panelCollapsed);
		this.#measureDescription();
		await game.settings.set(
			"litmv2",
			"heroPanelCollapsed",
			this.#panelCollapsed,
		);
	}

	/**
	 * Decide whether the description needs its fade and the name toggle.
	 * Reversible: nothing is deleted, the toggle's semantics are swapped back
	 * in when it can act again. Skipped while hidden (folded panel, minimised
	 * window), keeping the last state.
	 */
	#measureDescription() {
		const body = this.element.querySelector(
			".litm--hero-description .theme-card__description-body",
		);
		if (!body || body.offsetParent === null) return;
		const box = body.parentElement;
		const clampPx = Number.parseFloat(getComputedStyle(body).fontSize) * 6;
		const short = isDescriptionShort(body.scrollHeight, clampPx);
		box.classList.toggle("is-short", short);
		// The wide layout leaves the description unclamped: nothing to toggle.
		const canToggle =
			!short &&
			(box.classList.contains("is-expanded") ||
				getComputedStyle(body).maxHeight !== "none");
		const { action, tooltip } = this.#descAttrs;
		if (canToggle) {
			box.dataset.action = action;
			box.dataset.tooltip = tooltip;
		} else {
			delete box.dataset.action;
			delete box.dataset.tooltip;
		}
		// Plain heading text for screen readers when the button would do nothing.
		const button = this.#nameToggle;
		if (!button) return;
		if (canToggle && !button.isConnected) this.#nameText.replaceWith(button);
		else if (!canToggle && button.isConnected)
			button.replaceWith(this.#nameText);
	}

	/**
	 * Turn a theme card over: the back shows its note. A half-turn out, the
	 * face swaps, a half-turn back in; no motion when the user asks for less.
	 * @this {HeroSheetCards}
	 */
	static _onFlipThemeCard(_event, target) {
		const card = target.closest(".theme-card[data-flip-key]");
		if (!card) return;
		const key = card.dataset.flipKey;
		const flipped = !this.#flipped.has(key);
		if (flipped) this.#flipped.add(key);
		else this.#flipped.delete(key);
		if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
			return this.#applyFlip(card, flipped);
		const turn = (from, to, easing) =>
			card.animate(
				[
					{ transform: `perspective(60rem) rotateY(${from})` },
					{ transform: `perspective(60rem) rotateY(${to})` },
				],
				{ duration: 140, easing },
			).finished;
		turn("0deg", "90deg", "ease-in").then(() => {
			this.#applyFlip(card, flipped);
			turn("-90deg", "0deg", "ease-out");
		});
	}

	/** Show a card's back or face. The back sits under the banner, so it is placed from the banner's measured bottom. */
	#applyFlip(card, flipped) {
		// A note deleted while flipped leaves no back: show the face.
		flipped &&= !!card.querySelector(":scope > .theme-card__back");
		const legend = card.querySelector(":scope > legend");
		card.style.setProperty(
			"--litm-back-top",
			`${legend.offsetTop + legend.offsetHeight}px`,
		);
		card.classList.toggle("is-flipped", flipped);
		for (const face of card.querySelectorAll(
			":scope > :not(legend, .theme-card__back)",
		))
			face.inert = flipped;
		card
			.querySelector("[data-action='flipThemeCard']")
			?.setAttribute("aria-pressed", String(flipped));
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		context.cardsLayout = true;
		context.fellowshipSlot = fellowshipSlot(
			this.document.getFlag("litmv2", FLAGS.fellowshipIndex),
			context.themes?.length ?? 0,
		);
		return context;
	}

	/* -------------------------------------------- */
	/*  Card reordering                             */
	/* -------------------------------------------- */

	/** Drag type for the Fellowship card, which is not an item of this hero. */
	static FELLOWSHIP_CARD_DRAG = "litmv2.FellowshipCard";

	/** @override */
	_onDragStart(event) {
		// A card's banner is its drag handle. The item id stays on the card, not
		// the banner: Foundry's sort reads the drop target's nearest id and its
		// siblings, which must be the cards.
		const card = event.currentTarget.closest(".theme-card");
		if (!card || card === event.currentTarget) return super._onDragStart(event);
		const data = card.matches("[data-fellowship-card]")
			? {
					type: HeroSheetCards.FELLOWSHIP_CARD_DRAG,
					actorUuid: this.document.uuid,
				}
			: this.document.items.get(card.dataset.itemId)?.toDragData();
		if (data) event.dataTransfer.setData("text/plain", JSON.stringify(data));
	}

	/** @override */
	async _onDrop(event) {
		const data =
			foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
		if (data.type !== HeroSheetCards.FELLOWSHIP_CARD_DRAG)
			return super._onDrop(event);
		if (data.actorUuid !== this.document.uuid || !this.isEditable) return;
		return this.#sortThemesRow(event, FELLOWSHIP_KEY);
	}

	/** @override */
	async _onSortItem(event, item) {
		if (item.type === "theme" && (await this.#sortThemesRow(event, item.id)))
			return;
		return super._onSortItem(event, item);
	}

	/**
	 * Reorder the themes row as one sequence, the Fellowship card included,
	 * then write back the themes' sort and the Fellowship's slot. A theme
	 * moved past the Fellowship shifts it, as it would any card.
	 * @param {DragEvent} event
	 * @param {string} source  The dragged theme's id, or FELLOWSHIP_KEY.
	 * @returns {Promise<boolean>} False when the drop is outside the row.
	 */
	async #sortThemesRow(event, source) {
		const target = event.target.closest(
			".litm-hero-board__themes > .theme-card",
		);
		if (!target) return false;
		const keyOf = (card) =>
			card.matches("[data-fellowship-card]")
				? FELLOWSHIP_KEY
				: card.dataset.itemId;
		const cards = [
			...target.parentElement.querySelectorAll(":scope > .theme-card"),
		];
		const order = moveCard(cards.map(keyOf), source, keyOf(target));
		if (!order) return true;
		const themeIds = order.filter((key) => key !== FELLOWSHIP_KEY);
		await this.document.updateEmbeddedDocuments(
			"Item",
			themeIds.map((_id, i) => ({
				_id,
				sort: (i + 1) * CONST.SORT_INTEGER_DENSITY,
			})),
		);
		if (order.includes(FELLOWSHIP_KEY))
			await this.document.setFlag(
				"litmv2",
				FLAGS.fellowshipIndex,
				order.indexOf(FELLOWSHIP_KEY),
			);
		return true;
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#panelCollapsed ??= game.settings.get("litmv2", "heroPanelCollapsed");
		this.#applyPanelCollapsed(this.#panelCollapsed);
		for (const card of this.element.querySelectorAll(
			".theme-card[data-flip-key]",
		))
			if (this.#flipped.has(card.dataset.flipKey)) this.#applyFlip(card, true);
		const box = this.element.querySelector(".litm--hero-description");
		this.#nameToggle = this.element.querySelector(".litm--hero-name__toggle");
		this.#nameText = this.#nameToggle
			? document.createTextNode(this.#nameToggle.textContent)
			: null;
		this.#descAttrs = box
			? { action: box.dataset.action, tooltip: box.dataset.tooltip }
			: null;
		if (!this.#descAttrs) return;
		this.#measureDescription();
		// Resizing can cross the clamp or the wide breakpoint without a re-render.
		this.#resizeObserver ??= new ResizeObserver(() =>
			this.#measureDescription(),
		);
		this.#resizeObserver.observe(this.element);
	}

	/** @override */
	_onClose(options) {
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = null;
		super._onClose(options);
	}
}

export class ChallengeSheetLandscape extends ChallengeSheet {
	static DEFAULT_OPTIONS = LANDSCAPE_OPTIONS;
}

export class JourneySheetLandscape extends JourneySheet {
	static DEFAULT_OPTIONS = LANDSCAPE_OPTIONS;
}

export class FellowshipSheetLandscape extends FellowshipSheet {
	static DEFAULT_OPTIONS = LANDSCAPE_OPTIONS;
}
