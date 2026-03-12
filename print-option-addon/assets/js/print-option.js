/**
 * Print Option Addon – front-end script.
 *
 * Dynamically updates the per-item print total displayed on the
 * single product page when the customer changes the quantity or
 * toggles the "Print Option" checkbox.
 */
( function ( $ ) {
	'use strict';

	var perItemPrice = parseFloat( poaData.perItemPrice ) || 0;
	var currency     = poaData.currency || '$';

	/**
	 * Format a number as a price string.
	 *
	 * @param {number} amount
	 * @return {string}
	 */
	function formatPrice( amount ) {
		return currency + amount.toFixed( 2 );
	}

	/**
	 * Get the current product quantity.
	 *
	 * @return {number}
	 */
	function getQuantity() {
		var qty = parseInt( $( '.quantity input.qty' ).val(), 10 );
		return isNaN( qty ) || qty < 1 ? 1 : qty;
	}

	/**
	 * Update the print total line shown beneath the checkbox.
	 */
	function updatePrintTotal() {
		var $checkbox    = $( '#poa_print_option' );
		var $totalWrap   = $( '.poa-print-total' );
		var $totalAmount = $( '.poa-print-total-amount' );

		if ( $checkbox.is( ':checked' ) ) {
			var qty   = getQuantity();
			var total = perItemPrice * qty;
			$totalAmount.text( formatPrice( total ) );
			$totalWrap.show();
		} else {
			$totalWrap.hide();
		}
	}

	$( document ).ready( function () {
		// Toggle / quantity change.
		$( document ).on( 'change', '#poa_print_option', updatePrintTotal );
		$( document ).on( 'change input', '.quantity input.qty', updatePrintTotal );
	} );
}( jQuery ) );
