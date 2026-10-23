import { ChallengeSheet } from "../actor/challenge/challenge-sheet.js";
import { FellowshipSheet } from "../actor/fellowship/fellowship-sheet.js";
import { HeroSheet } from "../actor/hero/hero-sheet.js";
import { JourneySheet } from "../actor/journey/journey-sheet.js";
import { FLAGS } from "../system/config.js";
import { LitmActorSheet } from "./base-actor-sheet.js";
import { fellowshipSlot, fellowshipSlotAfterDrop } from "./card-order.js";
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
		actions: {
			toggleHeroPanel: HeroSheetCards._onToggleHeroPanel,
		},
	};

	/** Class on the sheet root while the wide portrait panel is folded away. */
	static PANEL_COLLAPSED_CLASS = "litm-hero-cards--panel-collapsed";

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
		if (!event.currentTarget.matches("[data-fellowship-card]"))
			return super._onDragStart(event);
		event.dataTransfer.setData(
			"text/plain",
			JSON.stringify({
				type: HeroSheetCards.FELLOWSHIP_CARD_DRAG,
				actorUuid: this.document.uuid,
			}),
		);
	}

	/** @override */
	async _onDrop(event) {
		const data =
			foundry.applications.ux.TextEditor.implementation.getDragEventData(event);
		if (data.type !== HeroSheetCards.FELLOWSHIP_CARD_DRAG)
			return super._onDrop(event);
		if (data.actorUuid !== this.document.uuid || !this.isEditable) return;
		const card = event.target.closest(".litm-hero-board__themes > .theme-card");
		if (!card || card.matches("[data-fellowship-card]")) return;
		const themeCards = [
			...card.parentElement.querySelectorAll(
				":scope > .theme-card:not([data-fellowship-card])",
			),
		];
		const slot = fellowshipSlot(
			this.document.getFlag("litmv2", FLAGS.fellowshipIndex),
			themeCards.length,
		);
		return this.document.setFlag(
			"litmv2",
			FLAGS.fellowshipIndex,
			fellowshipSlotAfterDrop(slot, themeCards.indexOf(card)),
		);
	}

	/** A theme dropped on the Fellowship card has no item to sort against. */
	_onSortItem(event, item) {
		if (event.target.closest("[data-fellowship-card]")) return;
		return super._onSortItem(event, item);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#panelCollapsed ??= game.settings.get("litmv2", "heroPanelCollapsed");
		this.#applyPanelCollapsed(this.#panelCollapsed);
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
