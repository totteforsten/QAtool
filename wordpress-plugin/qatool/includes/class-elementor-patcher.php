<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QATool_Elementor_Patcher {

	/**
	 * Walk Elementor's _elementor_data JSON and update `settings.image.alt` (and
	 * related image fields) wherever the image URL matches.
	 */
	public static function set_image_alt( $post_id, $image_url, $alt, $dry_run = false ) {
		$raw = get_post_meta( $post_id, '_elementor_data', true );
		if ( empty( $raw ) ) {
			return array( 'ok' => false, 'reason' => 'no_elementor_data' );
		}

		$data = is_array( $raw ) ? $raw : json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return array( 'ok' => false, 'reason' => 'invalid_json' );
		}

		$count = 0;
		$previous = null;
		$target = self::normalize_url( $image_url );
		self::walk( $data, function ( &$node ) use ( $target, $alt, &$count, &$previous ) {
			if ( ! is_array( $node ) ) return;
			if ( isset( $node['widgetType'] ) ) {
				if ( in_array( $node['widgetType'], array( 'image', 'theme-site-logo' ), true ) ) {
					$settings = &$node['settings'];
					if ( isset( $settings['image']['url'] ) && self::normalize_url( $settings['image']['url'] ) === $target ) {
						if ( $previous === null ) $previous = $settings['image']['alt'] ?? '';
						$settings['image']['alt'] = $alt;
						$count++;
					}
				}
				if ( $node['widgetType'] === 'image-box' && isset( $node['settings']['image']['url'] )
					&& self::normalize_url( $node['settings']['image']['url'] ) === $target ) {
					if ( $previous === null ) $previous = $node['settings']['image']['alt'] ?? '';
					$node['settings']['image']['alt'] = $alt;
					$count++;
				}
				if ( in_array( $node['widgetType'], array( 'image-carousel', 'image-gallery' ), true ) && ! empty( $node['settings']['carousel'] ) ) {
					foreach ( $node['settings']['carousel'] as &$item ) {
						if ( isset( $item['url'] ) && self::normalize_url( $item['url'] ) === $target ) {
							if ( $previous === null ) $previous = $item['alt'] ?? '';
							$item['alt'] = $alt;
							$count++;
						}
					}
				}
			}
			if ( isset( $node['settings']['background_image']['url'] ) && self::normalize_url( $node['settings']['background_image']['url'] ) === $target ) {
				if ( $previous === null ) $previous = $node['settings']['background_image']['alt'] ?? '';
				$node['settings']['background_image']['alt'] = $alt;
				$count++;
			}
		} );

		if ( $count === 0 ) {
			return array( 'ok' => false, 'reason' => 'no_match' );
		}
		if ( $dry_run ) {
			return array( 'ok' => true, 'dry_run' => true, 'updated' => $count, 'before' => $previous );
		}

		$encoded = wp_slash( wp_json_encode( $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
		update_post_meta( $post_id, '_elementor_data', $encoded );

		// Bust Elementor cache for this post if possible.
		if ( class_exists( '\\Elementor\\Plugin' ) ) {
			try {
				\Elementor\Plugin::$instance->files_manager->clear_cache();
			} catch ( \Throwable $e ) {
				// ignore
			}
		}

		return array( 'ok' => true, 'updated' => $count, 'before' => $previous );
	}

	private static function walk( &$nodes, $cb ) {
		if ( ! is_array( $nodes ) ) return;
		foreach ( $nodes as &$node ) {
			if ( ! is_array( $node ) ) continue;
			$cb( $node );
			if ( ! empty( $node['elements'] ) && is_array( $node['elements'] ) ) {
				self::walk( $node['elements'], $cb );
			}
		}
	}

	private static function normalize_url( $url ) {
		$url = strtolower( (string) $url );
		$url = preg_replace( '#^https?:#', '', $url );
		return rtrim( $url, '/' );
	}
}
