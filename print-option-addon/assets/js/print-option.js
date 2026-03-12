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

	var perItemPrice = parseFloat( poaData.perItemPrice ) || 0;
	var productPrice = parseFloat( poaData.productPrice ) || 0;
	var currency     = poaData.currency  || '$';
	var decimals     = parseInt( poaData.decimals, 10 );
	if ( isNaN( decimals ) || decimals < 0 ) { decimals = 2; }
	var decimalSep  = poaData.decimalSep  || '.';
	var thousandSep = poaData.thousandSep || ',';

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

		var qty = getQuantity();

		if ( $checkbox.is( ':checked' ) ) {
			var printTotal = perItemPrice * qty;
			var orderTotal = ( productPrice * qty ) + printTotal;

			$printAmount.text( formatPrice( printTotal ) );
			$printWrap.show();

			$orderAmount.text( formatPrice( orderTotal ) );
			$orderWrap.show();
		} else {
			$printWrap.hide();
			$orderWrap.hide();
		}
	}

	$( document ).ready( function () {
		// Checkbox toggle.
		$( document ).on( 'change', '#poa_print_option', updatePrintTotal );

		// Quantity spinner change.
		$( document ).on( 'change input', '.quantity input.qty', updatePrintTotal );

		// Variable product: update productPrice when a variation is chosen.
		$( document ).on( 'found_variation', function ( event, variation ) {
			if ( variation && variation.display_price !== undefined ) {
				productPrice = parseFloat( variation.display_price ) || 0;
			}
			updatePrintTotal();
		} );

		// Variable product: reset productPrice when variation selection is cleared.
		$( document ).on( 'reset_data', function () {
			productPrice = parseFloat( poaData.productPrice ) || 0;
			updatePrintTotal();
		} );
	} );
}( jQuery ) );
