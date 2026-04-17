<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Stores a reversible log of patches per post, and applies reverts.
 *
 * History entries live in the `_qatool_history` post meta as a JSON array,
 * capped at 50 entries per post. Each entry holds the before/after values
 * (and — for builder-scoped patches — a snapshot of the previous builder
 * tree) so reverts never have to guess.
 */
class QATool_Revert {

	const META_KEY = '_qatool_history';
	const MAX      = 50;

	public static function record( $post_id, array $entry ) {
		$post_id = (int) $post_id;
		if ( ! $post_id ) return null;

		$entry = wp_parse_args( $entry, array(
			'id'           => wp_generate_uuid4(),
			'patch_type'   => '',
			'target'       => '',
			'before_value' => null,
			'after_value'  => null,
			'applied_at'   => time(),
			'applied_by'   => get_current_user_id(),
			'builder'      => null,
			'visual'       => null,
			'reverted_at'  => null,
		) );

		$log = self::get_log( $post_id );
		array_unshift( $log, $entry );
		$log = array_slice( $log, 0, self::MAX );
		update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $log, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) );
		return $entry;
	}

	public static function get_log( $post_id ) {
		$raw = get_post_meta( (int) $post_id, self::META_KEY, true );
		if ( empty( $raw ) ) return array();
		$parsed = is_array( $raw ) ? $raw : json_decode( $raw, true );
		return is_array( $parsed ) ? $parsed : array();
	}

	public static function find_entry( $post_id, $entry_id ) {
		foreach ( self::get_log( $post_id ) as $e ) {
			if ( ( $e['id'] ?? '' ) === $entry_id ) return $e;
		}
		return null;
	}

	public static function annotate( $post_id, $entry_id, array $patch ) {
		$log = self::get_log( $post_id );
		foreach ( $log as &$e ) {
			if ( ( $e['id'] ?? '' ) === $entry_id ) {
				$e = array_merge( $e, $patch );
				update_post_meta( $post_id, self::META_KEY, wp_slash( wp_json_encode( $log, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) ) );
				return $e;
			}
		}
		return null;
	}

	/**
	 * Reverse a previously recorded patch.
	 */
	public static function revert( $post_id, $entry_id ) {
		$entry = self::find_entry( $post_id, $entry_id );
		if ( ! $entry ) return new WP_Error( 'qatool_revert_unknown', __( 'History entry not found.', 'qatool' ) );
		if ( ! empty( $entry['reverted_at'] ) ) {
			return new WP_Error( 'qatool_revert_already', __( 'Entry has already been reverted.', 'qatool' ) );
		}

		$type   = $entry['patch_type'] ?? '';
		$target = $entry['target'] ?? '';
		$before = $entry['before_value'] ?? null;
		$builder = $entry['builder'] ?? null;

		switch ( $type ) {
			case 'meta-title':
			case 'meta-description':
			case 'canonical':
				$result = self::revert_seo_field( $post_id, $type, $entry );
				break;
			case 'alt-text':
				$result = self::revert_alt_text( $post_id, $target, $before, $builder, $entry );
				break;
			default:
				return new WP_Error( 'qatool_revert_unsupported', sprintf( __( 'Cannot revert patch type "%s".', 'qatool' ), $type ) );
		}

		if ( is_wp_error( $result ) ) return $result;

		self::annotate( $post_id, $entry_id, array( 'reverted_at' => time(), 'revert_details' => $result ) );
		return $result;
	}

	private static function revert_seo_field( $post_id, $type, $entry ) {
		$meta_key = $entry['meta_key'] ?? null;
		if ( ! $meta_key ) return new WP_Error( 'qatool_revert_no_meta', __( 'Original meta key missing.', 'qatool' ) );
		$before = $entry['before_value'] ?? '';
		if ( $before === '' || $before === null ) {
			delete_post_meta( $post_id, $meta_key );
		} else {
			update_post_meta( $post_id, $meta_key, wp_slash( $before ) );
		}
		return array( 'ok' => true, 'meta_key' => $meta_key, 'restored' => $before );
	}

	private static function revert_alt_text( $post_id, $target, $before, $builder, $entry ) {
		$alt = is_string( $before ) ? $before : '';
		if ( $builder === 'elementor' ) {
			$r = QATool_Elementor_Patcher::set_image_alt( $post_id, $target, $alt, false );
		} elseif ( $builder === 'breakdance' ) {
			$r = QATool_Breakdance_Patcher::set_image_alt( $post_id, $target, $alt, false );
		} else {
			$r = array( 'ok' => true, 'note' => 'no builder', 'restored_alt' => $alt );
		}
		$attachment_id = attachment_url_to_postid( $target );
		if ( $attachment_id && ! empty( $entry['attachment_before_alt'] ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', wp_slash( $entry['attachment_before_alt'] ) );
		} elseif ( $attachment_id ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', wp_slash( $alt ) );
		}
		return array( 'ok' => true, 'result' => $r, 'restored_alt' => $alt );
	}
}
