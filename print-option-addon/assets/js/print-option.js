/**
 * Print Option Addon – front-end script.
 *
 * When the "Print Option" checkbox is checked this script:
 *  1. Calls the server via AJAX (poa_calculate_price) to get WooCommerce-
 *     formatted prices that correctly honour tax settings, currency position,
 *     thousand/decimal separators, etc.
 *  2. Replaces the content of the WooCommerce product price element (p.price)
 *     with the combined per-unit price (product price + print surcharge).
 *  3. Shows a "Subtotal" summary row below the price that reflects
 *     (unit price + print surcharge) × qty.
 *
 * Unchecking the box restores the original price HTML and hides the summary.
 * Variable-product variation changes are handled so the correct variation
 * price is always used.
 */
( function ( $ ) {
	'use strict';

	var perItemPrice        = parseFloat( poaData.perItemPrice ) || 0;
	var productPrice        = parseFloat( poaData.productPrice ) || 0;
	var currency            = poaData.currency    || '$';
	var decimals            = parseInt( poaData.decimals, 10 );
	if ( isNaN( decimals ) || decimals < 0 ) { decimals = 2; }
	var decimalSep          = poaData.decimalSep  || '.';
	var thousandSep         = poaData.thousandSep || ',';
	var ajaxUrl             = poaData.ajaxUrl     || '';
	var nonce               = poaData.nonce       || '';
	var productId           = parseInt( poaData.productId, 10 ) || 0;
	var i18n                = poaData.i18n        || {};
	var variationId         = 0;
	var originalWcPriceHTML = '';
	var pendingRequest      = null;

	// -----------------------------------------------------------------------
	// Helpers
	// -----------------------------------------------------------------------

	/**
	 * Format a raw number as a localised price string (client-side fallback).
	 *
	 * @param {number} amount
	 * @return {string}
	 */
	function formatPrice( amount ) {
		var fixed   = amount.toFixed( decimals );
		var parts   = fixed.split( '.' );
		var intPart = parts[0].replace( /\B(?=(\d{3})+(?!\d))/g, thousandSep );
		var result  = decimals > 0 ? intPart + decimalSep + parts[1] : intPart;
		return currency + result;
	}

	/**
	 * Save the current WooCommerce price element HTML so it can be restored
	 * when the print option checkbox is unchecked.
	 */
	function saveOriginalPrice() {
		var $el = $( 'p.price' ).first();
		if ( $el.length ) {
			originalWcPriceHTML = $el.html();
		}
	}

	/**
	 * Get the current product quantity entered by the customer.
	 *
	 * @return {number}
	 */
	function getQuantity() {
		var qty = parseInt( $( '.quantity input.qty' ).val(), 10 );
		return isNaN( qty ) || qty < 1 ? 1 : qty;
	}

	/**
	 * Return (and lazily create) the price-summary element that sits directly
	 * below the WooCommerce p.price element.
	 *
	 * @return {jQuery}
	 */
	function getSummaryEl() {
		var $existing = $( '.poa-price-summary' );
		if ( $existing.length ) {
			return $existing;
		}
		var $summary = $( '<div class="poa-price-summary" aria-live="polite"></div>' );
		$( 'p.price' ).first().after( $summary );
		return $summary;
	}

	// -----------------------------------------------------------------------
	// DOM update helpers
	// -----------------------------------------------------------------------

	/**
	 * Apply the server-returned price HTML to the WooCommerce price element
	 * and update the subtotal row below it.
	 *
	 * @param {string} unitPriceHtml  HTML from wc_price( unit price ).
	 * @param {string} subtotalHtml   HTML from wc_price( unit price × qty ).
	 */
	function applyPriceDisplay( unitPriceHtml, subtotalHtml ) {
		var $wcPrice = $( 'p.price' ).first();

		if ( $wcPrice.length && unitPriceHtml ) {
			// Replace the entire price content.  This correctly handles simple
			// products, products with a sale price (<del>/<ins>), and variable
			// products – we always show one clear combined-price figure.
			$wcPrice.html( unitPriceHtml );
		}

		if ( subtotalHtml ) {
			var label = ( i18n && i18n.subtotal ) ? i18n.subtotal : 'Subtotal';
			getSummaryEl()
				.html(
					'<span class="poa-summary-label">' + label + ':</span>' +
					'<span class="poa-summary-value">' + subtotalHtml + '</span>'
				)
				.show();
		}
	}

	/**
	 * Restore the original WooCommerce price element and hide the summary row.
	 */
	function restoreOriginalDisplay() {
		var $wcPrice = $( 'p.price' ).first();
		if ( $wcPrice.length && originalWcPriceHTML ) {
			$wcPrice.html( originalWcPriceHTML );
		}
		$( '.poa-price-summary' ).hide();
	}

	// -----------------------------------------------------------------------
	// Main update function
	// -----------------------------------------------------------------------

	/**
	 * Called whenever the checkbox state or the quantity changes.
	 *
	 * Fires an AJAX request to retrieve WooCommerce-formatted prices from the
	 * server, then updates the UI.  Falls back to a client-side calculation
	 * when the AJAX call is unavailable or fails.
	 */
	function updatePrintTotal() {
		var $checkbox = $( '#poa_print_option' );
		var qty       = getQuantity();
		var isPrintOn = $checkbox.is( ':checked' );

		// Cancel any in-flight request so rapid changes don't race.
		if ( pendingRequest ) {
			pendingRequest.abort();
			pendingRequest = null;
		}

		if ( ! isPrintOn ) {
			restoreOriginalDisplay();
			return;
		}

		if ( ajaxUrl && nonce && productId ) {
			pendingRequest = $.ajax( {
				url:    ajaxUrl,
				method: 'POST',
				data:   {
					action:       'poa_calculate_price',
					nonce:        nonce,
					product_id:   productId,
					variation_id: variationId,
					qty:          qty,
					has_print:    'yes',
				},
				success: function ( response ) {
					pendingRequest = null;
					if ( response && response.success && response.data ) {
						applyPriceDisplay(
							response.data.unit_price_html,
							response.data.subtotal_html
						);
					}
				},
				error: function ( xhr, textStatus ) {
					pendingRequest = null;
					// Only fall through to client-side calc if not intentionally aborted.
					if ( 'abort' !== textStatus ) {
						var unitTotal = productPrice + perItemPrice;
						applyPriceDisplay(
							formatPrice( unitTotal ),
							formatPrice( unitTotal * qty )
						);
					}
				},
			} );
		} else {
			// AJAX configuration unavailable – calculate client-side.
			var unitTotal = productPrice + perItemPrice;
			applyPriceDisplay(
				formatPrice( unitTotal ),
				formatPrice( unitTotal * qty )
			);
		}
	}

	// -----------------------------------------------------------------------
	// Event bindings
	// -----------------------------------------------------------------------

	$( document ).ready( function () {
		// Snapshot the original price so we can restore it on uncheck.
		saveOriginalPrice();

		// Checkbox toggle.
		$( document ).on( 'change', '#poa_print_option', updatePrintTotal );

		// Quantity spinner change – re-compute the subtotal live.
		$( document ).on( 'change input', '.quantity input.qty', updatePrintTotal );

		// Variable product: update productPrice and variationId when a
		// variation is selected.  WooCommerce updates the price DOM before
		// firing this event, so we defer one tick to capture the new HTML.
		$( document ).on( 'found_variation', function ( event, variation ) {
			if ( variation ) {
				if ( variation.display_price !== undefined ) {
					productPrice = parseFloat( variation.display_price ) || 0;
				}
				if ( variation.variation_id !== undefined ) {
					variationId = parseInt( variation.variation_id, 10 ) || 0;
				}
			}
			setTimeout( function () {
				saveOriginalPrice();
				updatePrintTotal();
			}, 0 );
		} );

		// Variable product: reset prices when variation selection is cleared.
		$( document ).on( 'reset_data', function () {
			productPrice = parseFloat( poaData.productPrice ) || 0;
			variationId  = 0;
			setTimeout( function () {
				saveOriginalPrice();
				updatePrintTotal();
			}, 0 );
		} );
	} );

}( jQuery ) );
