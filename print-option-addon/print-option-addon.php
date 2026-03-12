<?php
/**
 * Plugin Name: Print Option Addon for WooCommerce
 * Plugin URI:  https://github.com/Meatitd11/Print-option-addon
 * Description: Adds a "Print Option" checkbox to single product pages. Customers can opt-in for a second print design at a configurable per-item price.
 * Version:     1.0.2
 * Author:      Print Option Addon
 * Text Domain: print-option-addon
 * Domain Path: /languages
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * WC requires at least: 6.0
 * WC tested up to: 9.5
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'POA_VERSION', '1.0.2' );
define( 'POA_PLUGIN_FILE', __FILE__ );
define( 'POA_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'POA_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Declare compatibility with WooCommerce HPOS (High-Performance Order Storage)
 * before WooCommerce initialises to prevent the "incompatible plugins" notice.
 */
add_action( 'before_woocommerce_init', function () {
	if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
		\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
	}
} );

/**
 * Check that WooCommerce is active before doing anything.
 */
add_action( 'plugins_loaded', 'poa_init' );
function poa_init() {
	if ( ! class_exists( 'WooCommerce' ) ) {
		add_action( 'admin_notices', 'poa_missing_wc_notice' );
		return;
	}

	// Admin settings.
	add_filter( 'woocommerce_get_sections_products', 'poa_add_settings_section' );
	add_filter( 'woocommerce_get_settings_products', 'poa_get_settings', 10, 2 );
	add_filter( 'plugin_action_links_' . plugin_basename( POA_PLUGIN_FILE ), 'poa_plugin_action_links' );

	// Front-end: single product page.
	add_action( 'woocommerce_before_add_to_cart_button', 'poa_render_print_option' );

	// Enqueue scripts / styles on product pages.
	add_action( 'wp_enqueue_scripts', 'poa_enqueue_assets' );

	// Cart: capture the print option from POST data.
	add_filter( 'woocommerce_add_cart_item_data', 'poa_add_cart_item_data', 10, 3 );

	// Cart: display the print option as a line item meta.
	add_filter( 'woocommerce_get_item_data', 'poa_display_cart_item_data', 10, 2 );

	// Cart: add the print cost to the item price before totals are calculated.
	add_action( 'woocommerce_before_calculate_totals', 'poa_recalculate_cart_item_price', 20 );

	// Orders: persist the print option in order item meta.
	add_action( 'woocommerce_checkout_create_order_line_item', 'poa_save_order_item_meta', 10, 4 );
}

/**
 * Admin notice when WooCommerce is not active.
 */
function poa_missing_wc_notice() {
	echo '<div class="notice notice-error"><p>'
		. esc_html__( 'Print Option Addon requires WooCommerce to be installed and active.', 'print-option-addon' )
		. '</p></div>';
}

/**
 * Add a "Settings" link on the Plugins list page.
 *
 * @param array $links Existing plugin action links.
 * @return array
 */
function poa_plugin_action_links( $links ) {
	$settings_url  = admin_url( 'admin.php?page=wc-settings&tab=products&section=print_option' );
	$settings_link = '<a href="' . esc_url( $settings_url ) . '">' . esc_html__( 'Settings', 'print-option-addon' ) . '</a>';
	array_unshift( $links, $settings_link );
	return $links;
}

// ---------------------------------------------------------------------------
// Admin Settings
// ---------------------------------------------------------------------------

/**
 * Add "Print Option" section under WooCommerce > Settings > Products.
 *
 * @param array $sections Existing sections.
 * @return array
 */
function poa_add_settings_section( $sections ) {
	$sections['print_option'] = __( 'Print Option', 'print-option-addon' );
	return $sections;
}

/**
 * Return settings fields for the Print Option section.
 *
 * @param array  $settings        Existing settings.
 * @param string $current_section Current section slug.
 * @return array
 */
function poa_get_settings( $settings, $current_section ) {
	if ( 'print_option' !== $current_section ) {
		return $settings;
	}

	return array(
		array(
			'title' => __( 'Print Option Settings', 'print-option-addon' ),
			'type'  => 'title',
			'desc'  => __( 'Configure the print option that appears on single product pages.', 'print-option-addon' ),
			'id'    => 'poa_settings_section_start',
		),
		array(
			'title'             => __( 'Per-Item Print Price ($)', 'print-option-addon' ),
			'desc'              => __( 'Price added per quantity unit when the customer selects the print option.', 'print-option-addon' ),
			'id'                => 'poa_per_item_price',
			'type'              => 'number',
			'default'           => '2',
			'desc_tip'          => true,
			'custom_attributes' => array(
				'min'  => '0',
				'step' => '0.01',
			),
		),
		array(
			'title'    => __( 'Checkbox Label', 'print-option-addon' ),
			'desc'     => __( 'Label shown next to the print option checkbox on the product page.', 'print-option-addon' ),
			'id'       => 'poa_checkbox_label',
			'type'     => 'text',
			'default'  => __( 'Add second print design', 'print-option-addon' ),
			'desc_tip' => true,
		),
		array(
			'type' => 'sectionend',
			'id'   => 'poa_settings_section_end',
		),
	);
}

/**
 * Helper: get the configured per-item price as a float.
 *
 * @return float
 */
function poa_get_per_item_price() {
	return (float) get_option( 'poa_per_item_price', '2' );
}

/**
 * Helper: get the configured checkbox label.
 *
 * @return string
 */
function poa_get_checkbox_label() {
	$label = get_option( 'poa_checkbox_label', __( 'Add second print design', 'print-option-addon' ) );
	return sanitize_text_field( $label );
}

// ---------------------------------------------------------------------------
// Front-end: Product Page
// ---------------------------------------------------------------------------

/**
 * Enqueue front-end assets on single product pages.
 */
function poa_enqueue_assets() {
	if ( ! is_product() ) {
		return;
	}

	wp_enqueue_style(
		'poa-styles',
		POA_PLUGIN_URL . 'assets/css/print-option.css',
		array(),
		POA_VERSION
	);

	wp_enqueue_script(
		'poa-script',
		POA_PLUGIN_URL . 'assets/js/print-option.js',
		array( 'jquery' ),
		POA_VERSION,
		true
	);

	// Fetch the base product price for the product currently being viewed.
	$product_id    = get_queried_object_id();
	$product       = wc_get_product( $product_id );
	$product_price = $product ? (float) $product->get_price() : 0.0;

	wp_localize_script(
		'poa-script',
		'poaData',
		array(
			'perItemPrice' => poa_get_per_item_price(),
			'productPrice' => $product_price,
			'currency'     => get_woocommerce_currency_symbol(),
			'decimals'     => wc_get_price_decimals(),
			'decimalSep'   => wc_get_price_decimal_separator(),
			'thousandSep'  => wc_get_price_thousand_separator(),
		)
	);
}

/**
 * Render the Print Option checkbox before the Add-to-Cart button.
 */
function poa_render_print_option() {
	$per_item_price = poa_get_per_item_price();
	$label          = poa_get_checkbox_label();

	$price_formatted = wc_price( $per_item_price );

	// Determine the initial "Total Price" to display (base product price × 1 qty, no print surcharge).
	$product_id    = get_queried_object_id();
	$product       = wc_get_product( $product_id );
	$product_price = $product ? (float) $product->get_price() : 0.0;
	$total_initial = wc_price( $product_price );
	?>
	<div class="poa-print-option">
		<p class="poa-title"><strong><?php esc_html_e( 'Print Option', 'print-option-addon' ); ?></strong></p>
		<label class="poa-checkbox-label" for="poa_print_option">
			<input
				type="checkbox"
				id="poa_print_option"
				name="poa_print_option"
				value="yes"
				class="poa-checkbox"
			/>
			<?php
			echo esc_html( $label );
			echo ' (';
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- wc_price returns trusted HTML.
			echo wp_kses_post( $price_formatted );
			echo ' ' . esc_html__( 'per item', 'print-option-addon' ) . ')';
			?>
		</label>
		<p class="poa-total-price">
			<?php esc_html_e( 'Total Price:', 'print-option-addon' ); ?>
			<span id="poa_total_price_display">
				<?php echo wp_kses_post( $total_initial ); ?>
			</span>
		</p>
	</div>
	<?php
}

// ---------------------------------------------------------------------------
// Cart Logic
// ---------------------------------------------------------------------------

/**
 * Store the print option selection in cart item data.
 *
 * The original product base price is captured here so that
 * poa_recalculate_cart_item_price() can always add the print cost on top
 * of the true base price, preventing compounding across multiple
 * calculate_totals() calls within the same request.
 *
 * @param array $cart_item_data  Existing cart item data.
 * @param int   $product_id      Product ID.
 * @param int   $variation_id    Variation ID (0 when not a variation).
 * @return array
 */
function poa_add_cart_item_data( $cart_item_data, $product_id, $variation_id ) {
	// phpcs:ignore WordPress.Security.NonceVerification.Missing -- WooCommerce handles add-to-cart nonce.
	if ( ! empty( $_POST['poa_print_option'] ) && 'yes' === sanitize_text_field( wp_unslash( $_POST['poa_print_option'] ) ) ) {
		// Resolve to the variation product when applicable so the correct price is stored.
		$lookup_id = $variation_id ? $variation_id : $product_id;
		$product   = wc_get_product( $lookup_id );

		$cart_item_data['poa_print_option']   = 'yes';
		$cart_item_data['poa_per_item_price'] = poa_get_per_item_price();
		// Store the original product price so recalculation never compounds.
		$cart_item_data['poa_base_price']     = $product ? (float) $product->get_price() : 0.0;
		// Unique key so WooCommerce treats items with/without the option as separate lines.
		$cart_item_data['poa_unique_key']     = wp_generate_password( 32, false );
	}
	return $cart_item_data;
}

/**
 * Display the print option in cart / checkout item meta.
 *
 * @param array $item_data Existing display data.
 * @param array $cart_item Cart item data.
 * @return array
 */
function poa_display_cart_item_data( $item_data, $cart_item ) {
	if ( empty( $cart_item['poa_print_option'] ) ) {
		return $item_data;
	}

	$per_item = (float) $cart_item['poa_per_item_price'];
	$qty      = (int) $cart_item['quantity'];
	$total    = $per_item * $qty;

	$item_data[] = array(
		'key'   => __( 'Print Option', 'print-option-addon' ),
		'value' => sprintf(
			/* translators: 1: per-item price, 2: quantity, 3: total print price */
			__( '%1$s × %2$d item(s) = %3$s', 'print-option-addon' ),
			wc_price( $per_item ),
			$qty,
			wc_price( $total )
		),
	);

	return $item_data;
}

/**
 * Add the print cost to the cart item price so it flows into all WooCommerce totals.
 *
 * Uses the stored base price (poa_base_price) rather than the product's current
 * get_price() value to ensure the print surcharge is added exactly once even
 * when WooCommerce calls calculate_totals() more than once per request.
 *
 * @param WC_Cart $cart Cart object.
 */
function poa_recalculate_cart_item_price( $cart ) {
	if ( is_admin() && ! defined( 'DOING_AJAX' ) ) {
		return;
	}

	foreach ( $cart->get_cart() as $cart_item ) {
		if ( empty( $cart_item['poa_print_option'] ) ) {
			continue;
		}

		$per_item   = (float) $cart_item['poa_per_item_price'];
		// Always derive from the stored original base price, not from get_price(),
		// which may already include a previous surcharge addition.
		$base_price = isset( $cart_item['poa_base_price'] )
			? (float) $cart_item['poa_base_price']
			: (float) $cart_item['data']->get_price();

		$cart_item['data']->set_price( $base_price + $per_item );
	}
}

/**
 * Save print option data to the WooCommerce order line item.
 *
 * @param WC_Order_Item_Product $item          Order line item.
 * @param string                $cart_item_key Cart item key.
 * @param array                 $values        Cart item values.
 * @param WC_Order              $order         Order object.
 */
function poa_save_order_item_meta( $item, $cart_item_key, $values, $order ) { // phpcs:ignore VariableAnalysis.CodeAnalysis.VariableAnalysis.UnusedVariable
	if ( empty( $values['poa_print_option'] ) ) {
		return;
	}

	$per_item = (float) $values['poa_per_item_price'];
	$qty      = (int) $item->get_quantity();
	$total    = $per_item * $qty;

	$item->add_meta_data( __( 'Print Option', 'print-option-addon' ), __( 'Yes', 'print-option-addon' ), true );
	$item->add_meta_data( __( 'Print Price per Item', 'print-option-addon' ), wc_price( $per_item ), true );
	$item->add_meta_data( __( 'Total Print Price', 'print-option-addon' ), wc_price( $total ), true );
}
