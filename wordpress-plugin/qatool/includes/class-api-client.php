<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QATool_Api_Client {

	const OPTION_KEY = 'qatool_settings';

	public static function get_settings() {
		$defaults = array(
			'endpoint' => '',
			'api_key'  => '',
			'max_pages' => 10,
		);
		return wp_parse_args( get_option( self::OPTION_KEY, array() ), $defaults );
	}

	public static function save_settings( array $settings ) {
		$clean = array(
			'endpoint'  => esc_url_raw( trim( $settings['endpoint'] ?? '' ) ),
			'api_key'   => sanitize_text_field( $settings['api_key'] ?? '' ),
			'max_pages' => max( 1, min( 100, (int) ( $settings['max_pages'] ?? 10 ) ) ),
		);
		update_option( self::OPTION_KEY, $clean );
		return $clean;
	}

	public static function request( $path, array $args = array() ) {
		$settings = self::get_settings();
		if ( empty( $settings['endpoint'] ) ) {
			return new WP_Error( 'qatool_no_endpoint', __( 'Set the QAtool endpoint first.', 'qatool' ) );
		}
		$url = trailingslashit( $settings['endpoint'] ) . ltrim( $path, '/' );
		$headers = array( 'accept' => 'application/json' );
		if ( ! empty( $settings['api_key'] ) ) {
			$headers['x-qatool-key'] = $settings['api_key'];
		}
		$defaults = array(
			'timeout' => 30,
			'headers' => $headers,
		);
		$response = wp_remote_request( $url, array_merge( $defaults, $args ) );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = wp_remote_retrieve_response_code( $response );
		$body = wp_remote_retrieve_body( $response );
		$data = json_decode( $body, true );
		if ( $code >= 400 || ! is_array( $data ) ) {
			$msg = is_array( $data ) && ! empty( $data['error'] ) ? $data['error'] : 'HTTP ' . $code;
			return new WP_Error( 'qatool_api_error', $msg );
		}
		return $data;
	}

	public static function discover( $site_url, $max = 10 ) {
		$path = 'api/discover?url=' . rawurlencode( $site_url ) . '&max=' . (int) $max;
		return self::request( $path, array( 'method' => 'GET' ) );
	}

	public static function scan( $page_url ) {
		$path = 'api/scan?url=' . rawurlencode( $page_url );
		return self::request( $path, array( 'method' => 'GET' ) );
	}
}
