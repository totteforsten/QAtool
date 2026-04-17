<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QATool_Breakdance_Patcher {

	public static function set_image_alt( $post_id, $image_url, $alt, $dry_run = false ) {
		$raw = get_post_meta( $post_id, 'breakdance_data', true );
		if ( empty( $raw ) ) {
			return array( 'ok' => false, 'reason' => 'no_breakdance_data' );
		}

		$wrapper = is_array( $raw ) ? $raw : json_decode( $raw, true );
		$target = self::normalize_url( $image_url );
		$count = 0;
		$previous = null;

		if ( ! is_array( $wrapper ) ) {
			$tree = json_decode( (string) $raw, true );
			if ( ! is_array( $tree ) ) return array( 'ok' => false, 'reason' => 'invalid_json' );
			self::walk( $tree, $target, $alt, $count, $previous );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count, 'before' => $previous );
			update_post_meta( $post_id, 'breakdance_data', wp_slash( wp_json_encode( $tree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) );
			return array( 'ok' => true, 'updated' => $count, 'before' => $previous );
		}

		if ( isset( $wrapper['tree_json_string'] ) && is_string( $wrapper['tree_json_string'] ) ) {
			$tree = json_decode( $wrapper['tree_json_string'], true );
			if ( ! is_array( $tree ) ) return array( 'ok' => false, 'reason' => 'invalid_inner_json' );
			self::walk( $tree, $target, $alt, $count, $previous );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count, 'before' => $previous );
			$wrapper['tree_json_string'] = wp_json_encode( $tree, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		} elseif ( isset( $wrapper['tree'] ) && is_array( $wrapper['tree'] ) ) {
			self::walk( $wrapper['tree'], $target, $alt, $count, $previous );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count, 'before' => $previous );
		} else {
			self::walk( $wrapper, $target, $alt, $count, $previous );
			if ( $count === 0 ) return array( 'ok' => false, 'reason' => 'no_match' );
			if ( $dry_run ) return array( 'ok' => true, 'dry_run' => true, 'updated' => $count, 'before' => $previous );
		}

		update_post_meta(
			$post_id,
			'breakdance_data',
			wp_slash( wp_json_encode( $wrapper, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) )
		);

		if ( function_exists( 'Breakdance\\PluginAPI\\clear_cache' ) ) {
			try { \Breakdance\PluginAPI\clear_cache(); } catch ( \Throwable $e ) {}
		}

		return array( 'ok' => true, 'updated' => $count, 'before' => $previous );
	}

	private static function walk( &$node, $target, $alt, &$count, &$previous ) {
		if ( ! is_array( $node ) ) return;

		if ( isset( $node['properties']['content']['image']['url'] )
			&& self::normalize_url( $node['properties']['content']['image']['url'] ) === $target ) {
			if ( $previous === null ) $previous = $node['properties']['content']['image']['alt'] ?? '';
			$node['properties']['content']['image']['alt'] = $alt;
			$count++;
		}
		if ( isset( $node['properties']['image']['url'] )
			&& self::normalize_url( $node['properties']['image']['url'] ) === $target ) {
			if ( $previous === null ) $previous = $node['properties']['image']['alt'] ?? '';
			$node['properties']['image']['alt'] = $alt;
			$count++;
		}

		foreach ( $node as &$value ) {
			if ( is_array( $value ) ) {
				self::walk( $value, $target, $alt, $count, $previous );
			}
		}
	}

	private static function normalize_url( $url ) {
		$url = strtolower( (string) $url );
		$url = preg_replace( '#^https?:#', '', $url );
		return rtrim( $url, '/' );
	}
}
