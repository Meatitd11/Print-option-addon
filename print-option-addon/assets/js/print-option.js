/**
 * Print Option Addon – front-end script.
 *
 * When the "Print Option" checkbox is checked or the quantity changes, this
 * script calls the server via AJAX (poa_calculate_price) and updates:
 *
 *  1. .poa-total-price-amount — the "Total Price:" value inside the plugin's
 *     own widget (base price + print surcharge) × qty.
 *  2. p.price — the native WooCommerce product price element — replaced with
 *     the combined per-unit price (base + print surcharge).
 *
 * When the checkbox is unchecked the original WooCommerce price is restored
 * and the Total Price reverts to the base product total.
 *
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

	// -----------------------------------------------------------------------
	// DOM update helpers
	// -----------------------------------------------------------------------

	/**
	 * Update the "Total Price" widget amount and the WooCommerce p.price element.
	 *
	 * @param {string} unitPriceHtml  Formatted HTML for base + print per unit.
	 * @param {string} totalHtml      Formatted HTML for (base + print) × qty.
	 */
	function applyPriceDisplay( unitPriceHtml, totalHtml ) {
		// 1. Update the plugin's own "Total Price:" widget.
		var $totalAmount = $( '.poa-total-price-amount' );
		if ( $totalAmount.length && totalHtml ) {
			$totalAmount.html( totalHtml );
		}

		// 2. Replace the WooCommerce p.price with the combined per-unit price.
		var $wcPrice = $( 'p.price' ).first();
		if ( $wcPrice.length && unitPriceHtml ) {
			$wcPrice.html( unitPriceHtml );
		}
	}

	/**
	 * Restore the original WooCommerce price element and reset the Total Price
	 * widget to the base product total (no print surcharge).
	 */
	function restoreOriginalDisplay() {
		// Restore the WooCommerce native price.
		var $wcPrice = $( 'p.price' ).first();
		if ( $wcPrice.length && originalWcPriceHTML ) {
			$wcPrice.html( originalWcPriceHTML );
		}

		// Reset Total Price widget to base product price × qty (no print surcharge).
		var qty          = getQuantity();
		var baseTotal    = productPrice * qty;
		var $totalAmount = $( '.poa-total-price-amount' );
		if ( $totalAmount.length ) {
			if ( ajaxUrl && nonce && productId ) {
				// Fetch server-formatted base total.
				$.ajax( {
					url:    ajaxUrl,
					method: 'POST',
					data:   {
						action:       'poa_calculate_price',
						nonce:        nonce,
						product_id:   productId,
						variation_id: variationId,
						qty:          qty,
						has_print:    'no',
					},
					success: function ( response ) {
						if ( response && response.success && response.data ) {
							$totalAmount.html( response.data.total_html );
						} else {
							$totalAmount.html( formatPrice( baseTotal ) );
						}
					},
					error: function ( xhr, textStatus ) {
						if ( 'abort' !== textStatus ) {
							$totalAmount.html( formatPrice( baseTotal ) );
						}
					},
				} );
			} else {
				$totalAmount.html( formatPrice( baseTotal ) );
			}
		}
	}

	// -----------------------------------------------------------------------
	// Main update function
	// -----------------------------------------------------------------------

	/**
	 * Called whenever the checkbox state or the quantity changes.
	 *
	 * When checked, fires an AJAX request to retrieve WooCommerce-formatted
	 * prices from the server, then updates:
	 *   - .poa-total-price-amount (the "Total Price:" widget)
	 *   - p.price (the native WooCommerce price element)
	 *
	 * When unchecked, restores both elements to their original values.
	 * Falls back to client-side calculation if AJAX is unavailable or fails.
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
							response.data.total_html
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

		// Quantity spinner change – re-compute the total live.
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
