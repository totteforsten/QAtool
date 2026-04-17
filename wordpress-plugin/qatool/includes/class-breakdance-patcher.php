<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QATool_Breakdance_Patcher {

	/**
	 * Breakdance stores its tree in the `breakdance_data` post meta as JSON.
	 * The shape (subject to Breakdance version) looks roughly like:
	 *
	 *   {
	 *     "tree_json_string": "...",         // newer versions
	 *     "tree": { ... }                    // older versions
	 *   }
	 *
	 * Images appear as nodes with `type: "EssentialElements/Image"` (or similar)
	 * whose `properties.content.image` carries `{ url, alt, id, ... }`.
	 */
	public static function set_image_alt( $post_id, $image_url, $alt, $dry_run = false ) {
		$raw = get_post_meta( $post_id, 'breakdance_data', true );
		if ( empty( $raw ) ) {
			return array( 'ok' => false, 'reason' => 'no_breakdance_data' );
		}

		$wrapper = is_array( $raw ) ? $raw : json_decode( $raw, true );
		if ( ! is_array( $wrapper ) ) {
			// older versions: tree stored as JSON string directly
			$tree = json_decode( (string) $raw, true );
			if ( ! is_array( $tree ) ) {
				return array( 'ok' => false, 'reason' => 'invalid_json' );
			}
			$target = self::normalize_url( $image_url );
			$count = 0;
			self::walk( $tree, $target, $alt, $count );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count );
			update_post_meta( $post_id, 'breakdance_data', wp_slash( wp_json_encode( $tree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) );
			return array( 'ok' => true, 'updated' => $count );
		}

		$target = self::normalize_url( $image_url );
		$count = 0;

		if ( isset( $wrapper['tree_json_string'] ) && is_string( $wrapper['tree_json_string'] ) ) {
			$tree = json_decode( $wrapper['tree_json_string'], true );
			if ( ! is_array( $tree ) ) return array( 'ok' => false, 'reason' => 'invalid_inner_json' );
			self::walk( $tree, $target, $alt, $count );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count );
			$wrapper['tree_json_string'] = wp_json_encode( $tree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		} elseif ( isset( $wrapper['tree'] ) && is_array( $wrapper['tree'] ) ) {
			self::walk( $wrapper['tree'], $target, $alt, $count );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count );
		} else {
			self::walk( $wrapper, $target, $alt, $count );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count );
		}

		update_post_meta(
			$post_id,
			'breakdance_data',
			wp_slash( wp_json_encode( $wrapper, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) )
		);

		// Clear Breakdance CSS cache if available.
		if ( function_exists( 'Breakdance\\PluginAPI\\clear_cache' ) ) {
			try { \Breakdance\PluginAPI\clear_cache(); } catch ( \Throwable $e ) {}
		}

		return array( 'ok' => true, 'updated' => $count );
	}

	private static function walk( &$node, $target, $alt, &$count ) {
		if ( ! is_array( $node ) ) return;

		// Image nodes
		if ( isset( $node['properties']['content']['image']['url'] )
			&& self::normalize_url( $node['properties']['content']['image']['url'] ) === $target ) {
			$node['properties']['content']['image']['alt'] = $alt;
			$count++;
		}
		// Some widgets place it directly under properties.image.
		if ( isset( $node['properties']['image']['url'] )
			&& self::normalize_url( $node['properties']['image']['url'] ) === $target ) {
			$node['properties']['image']['alt'] = $alt;
			$count++;
		}

		foreach ( $node as $key => &$value ) {
			if ( is_array( $value ) ) {
				self::walk( $value, $target, $alt, $count );
			}
		}
	}

	private static function normalize_url( $url ) {
		$url = strtolower( (string) $url );
		$url = preg_replace( '#^https?:#', '', $url );
		return rtrim( $url, '/' );
	}
}
