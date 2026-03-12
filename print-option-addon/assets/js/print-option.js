/**
 * Print Option Addon – front-end script.
 *
 * Dynamically updates the per-item print total AND the combined order total
 * displayed on the single product page when the customer changes the quantity
 * or toggles the "Print Option" checkbox.
 *
 * Also handles variable-product price changes so the displayed grand total
 * always reflects the currently selected variation price.
 */
( function ( $ ) {
	'use strict';

	var perItemPrice        = parseFloat( poaData.perItemPrice ) || 0;
	var productPrice        = parseFloat( poaData.productPrice ) || 0;
	var currency            = poaData.currency  || '$';
	var decimals            = parseInt( poaData.decimals, 10 );
	if ( isNaN( decimals ) || decimals < 0 ) { decimals = 2; }
	var decimalSep          = poaData.decimalSep  || '.';
	var thousandSep         = poaData.thousandSep || ',';
	var originalWcPriceHTML = '';

	/**
	 * Format a number as a localised price string.
	 *
	 * @param {number} amount
	 * @return {string}
	 */
	function formatPrice( amount ) {
		var fixed  = amount.toFixed( decimals );
		var parts  = fixed.split( '.' );
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
	 * Recalculate and refresh the print-total and order-total lines.
	 */
	function updatePrintTotal() {
		var $checkbox     = $( '#poa_print_option' );
		var $printWrap    = $( '.poa-print-total' );
		var $printAmount  = $( '.poa-print-total-amount' );
		var $orderWrap    = $( '.poa-order-total' );
		var $orderAmount  = $( '.poa-order-total-amount' );
		var $wcPrice      = $( 'p.price' ).first();

		var qty = getQuantity();

		if ( $checkbox.is( ':checked' ) ) {
			var printTotal = perItemPrice * qty;
			var orderTotal = ( productPrice * qty ) + printTotal;

			$printAmount.text( formatPrice( printTotal ) );
			$printWrap.show();

			$orderAmount.text( formatPrice( orderTotal ) );
			$orderWrap.show();

			// Sync the WooCommerce default price element to the combined total.
			if ( $wcPrice.length ) {
				var $amountSpan = $wcPrice.find( '.woocommerce-Price-amount' ).first();
				if ( $amountSpan.length ) {
					$amountSpan.html( '<bdi>' + formatPrice( orderTotal ) + '</bdi>' );
				} else {
					$wcPrice.html(
						'<span class="woocommerce-Price-amount amount"><bdi>' +
						formatPrice( orderTotal ) +
						'</bdi></span>'
					);
				}
			}
		} else {
			$printWrap.hide();
			$orderWrap.hide();

			// Restore the original WooCommerce price element.
			if ( $wcPrice.length && originalWcPriceHTML ) {
				$wcPrice.html( originalWcPriceHTML );
			}
		}
	}

	$( document ).ready( function () {
		// Save the original WooCommerce price HTML so it can be restored on uncheck.
		saveOriginalPrice();

		// Checkbox toggle.
		$( document ).on( 'change', '#poa_print_option', updatePrintTotal );

		// Quantity spinner change.
		$( document ).on( 'change input', '.quantity input.qty', updatePrintTotal );

		// Variable product: update productPrice when a variation is chosen.
		$( document ).on( 'found_variation', function ( event, variation ) {
			if ( variation && variation.display_price !== undefined ) {
				productPrice = parseFloat( variation.display_price ) || 0;
			}
			// WooCommerce updates the price DOM synchronously before firing
			// found_variation, but defer one tick to be safe.
			setTimeout( function () {
				saveOriginalPrice();
				updatePrintTotal();
			}, 0 );
		} );

		// Variable product: reset productPrice when variation selection is cleared.
		$( document ).on( 'reset_data', function () {
			productPrice = parseFloat( poaData.productPrice ) || 0;
			// WooCommerce resets the price DOM synchronously before firing
			// reset_data, but defer one tick to be safe.
			setTimeout( function () {
				saveOriginalPrice();
				updatePrintTotal();
			}, 0 );
		} );
	} );
}( jQuery ) );
