<?php
/**
 * Plugin Name: QAtool
 * Plugin URI:  https://github.com/totteforsten/qatool
 * Description: Connects a WordPress site to the QAtool SEO & responsive scanner. Patches findings inline for Elementor and Breakdance.
 * Version:     0.1.0
 * Author:      QAtool
 * License:     GPL-2.0-or-later
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'QATOOL_VERSION', '0.1.0' );
define( 'QATOOL_PLUGIN_FILE', __FILE__ );
define( 'QATOOL_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'QATOOL_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once QATOOL_PLUGIN_DIR . 'includes/class-api-client.php';
require_once QATOOL_PLUGIN_DIR . 'includes/class-patcher.php';
require_once QATOOL_PLUGIN_DIR . 'includes/class-elementor-patcher.php';
require_once QATOOL_PLUGIN_DIR . 'includes/class-breakdance-patcher.php';
require_once QATOOL_PLUGIN_DIR . 'includes/class-admin.php';

add_action( 'plugins_loaded', function () {
	( new QATool_Admin() )->register();
} );
