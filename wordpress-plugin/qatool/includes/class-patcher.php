<?php
if ( ! defined( 'ABSPATH' ) ) exit;

/**
 * Generic patcher. Routes to Elementor / Breakdance / generic WordPress patchers
 * based on the post's page builder.
 */
class QATool_Patcher {

	public static function url_to_post_id( $url ) {
		$id = url_to_postid( $url );
		if ( $id ) return $id;

		$path = wp_parse_url( $url, PHP_URL_PATH ) ?: '/';
		$slug = trim( preg_replace( '#.*/([^/]+)/?$#', '$1', $path ), '/' );
		if ( $slug ) {
			$page = get_page_by_path( $slug, OBJECT, array( 'page', 'post' ) );
			if ( $page ) return (int) $page->ID;
		}
		return 0;
	}

	public static function detect_builder( $post_id ) {
		if ( get_post_meta( $post_id, '_elementor_edit_mode', true ) === 'builder'
			|| get_post_meta( $post_id, '_elementor_data', true ) ) {
			return 'elementor';
		}
		$bd = get_post_meta( $post_id, 'breakdance_data', true );
		if ( ! empty( $bd ) ) return 'breakdance';
		return 'classic';
	}

	/**
	 * Apply a patch described by the Next.js scanner output.
	 *
	 * @param int   $post_id
	 * @param array $patch {type, target, value?, suggestion?}
	 * @param bool  $dry_run
	 * @return array|WP_Error
	 */
	public static function apply( $post_id, array $patch, $dry_run = false ) {
		$type = sanitize_key( $patch['type'] ?? '' );
		if ( ! $post_id || ! $type ) {
			return new WP_Error( 'qatool_patch_invalid', __( 'Missing post or patch type.', 'qatool' ) );
		}

		switch ( $type ) {
			case 'meta-title':
				return self::patch_seo_field( $post_id, 'title', $patch, $dry_run );
			case 'meta-description':
				return self::patch_seo_field( $post_id, 'description', $patch, $dry_run );
			case 'canonical':
				return self::patch_seo_field( $post_id, 'canonical', $patch, $dry_run );
			case 'alt-text':
				return self::patch_alt_text( $post_id, $patch, $dry_run );
			case 'image-dimensions':
				return self::patch_image_dimensions( $post_id, $patch, $dry_run );
			case 'add-viewport':
				return new WP_Error(
					'qatool_patch_theme',
					__( 'Viewport tag must be added in the theme header.php — the plugin cannot patch this automatically.', 'qatool' )
				);
		}
		return new WP_Error( 'qatool_patch_unsupported', sprintf( __( 'Unsupported patch type "%s".', 'qatool' ), $type ) );
	}

	private static function patch_seo_field( $post_id, $field, array $patch, $dry_run ) {
		$value = (string) ( $patch['value'] ?? $patch['suggestion'] ?? '' );
		if ( $value === '' ) {
			return new WP_Error( 'qatool_patch_empty', __( 'No value provided for patch.', 'qatool' ) );
		}

		$plugin = self::detect_seo_plugin();
		$meta_key = null;
		if ( $plugin === 'yoast' ) {
			$meta_key = array(
				'title'       => '_yoast_wpseo_title',
				'description' => '_yoast_wpseo_metadesc',
				'canonical'   => '_yoast_wpseo_canonical',
			)[ $field ] ?? null;
		} elseif ( $plugin === 'rankmath' ) {
			$meta_key = array(
				'title'       => 'rank_math_title',
				'description' => 'rank_math_description',
				'canonical'   => 'rank_math_canonical_url',
			)[ $field ] ?? null;
		} elseif ( $plugin === 'aioseo' ) {
			$meta_key = array(
				'title'       => '_aioseo_title',
				'description' => '_aioseo_description',
			)[ $field ] ?? null;
		} else {
			$meta_key = '_qatool_' . $field;
		}

		if ( ! $meta_key ) {
			return new WP_Error( 'qatool_patch_no_field', __( 'No matching SEO meta field.', 'qatool' ) );
		}

		if ( $dry_run ) {
			return array( 'ok' => true, 'dry_run' => true, 'meta_key' => $meta_key, 'value' => $value );
		}

		update_post_meta( $post_id, $meta_key, wp_slash( $value ) );
		return array( 'ok' => true, 'meta_key' => $meta_key, 'value' => $value );
	}

	private static function patch_alt_text( $post_id, array $patch, $dry_run ) {
		$target = esc_url_raw( $patch['target'] ?? '' );
		$alt    = (string) ( $patch['value'] ?? $patch['suggestion'] ?? '' );
		if ( ! $target ) {
			return new WP_Error( 'qatool_patch_no_target', __( 'Patch target (image URL) missing.', 'qatool' ) );
		}
		if ( $alt === '' ) {
			return new WP_Error( 'qatool_patch_no_alt', __( 'No alt text supplied.', 'qatool' ) );
		}

		$builder = self::detect_builder( $post_id );
		$attachment_id = attachment_url_to_postid( $target );
		$results = array();

		if ( $builder === 'elementor' ) {
			$results['elementor'] = QATool_Elementor_Patcher::set_image_alt( $post_id, $target, $alt, $dry_run );
		} elseif ( $builder === 'breakdance' ) {
			$results['breakdance'] = QATool_Breakdance_Patcher::set_image_alt( $post_id, $target, $alt, $dry_run );
		}

		if ( $attachment_id && ! $dry_run ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', wp_slash( $alt ) );
			$results['attachment'] = array( 'id' => $attachment_id, 'updated' => true );
		} elseif ( $attachment_id ) {
			$results['attachment'] = array( 'id' => $attachment_id, 'dry_run' => true );
		}

		return array( 'ok' => true, 'builder' => $builder, 'results' => $results );
	}

	private static function patch_image_dimensions( $post_id, array $patch, $dry_run ) {
		$target = esc_url_raw( $patch['target'] ?? '' );
		if ( ! $target ) {
			return new WP_Error( 'qatool_patch_no_target', __( 'Patch target (image URL) missing.', 'qatool' ) );
		}
		$attachment_id = attachment_url_to_postid( $target );
		if ( ! $attachment_id ) {
			return new WP_Error( 'qatool_patch_no_attachment', __( 'Could not map image to a media library attachment.', 'qatool' ) );
		}
		$meta = wp_get_attachment_metadata( $attachment_id );
		if ( empty( $meta['width'] ) || empty( $meta['height'] ) ) {
			return new WP_Error( 'qatool_patch_no_size', __( 'Attachment has no intrinsic size.', 'qatool' ) );
		}
		return array(
			'ok'     => true,
			'note'   => __( 'Image already has intrinsic dimensions; ensure the theme/template outputs width & height attributes.', 'qatool' ),
			'width'  => (int) $meta['width'],
			'height' => (int) $meta['height'],
		);
	}

	public static function detect_seo_plugin() {
		if ( defined( 'WPSEO_VERSION' ) || class_exists( 'WPSEO_Options' ) ) return 'yoast';
		if ( defined( 'RANK_MATH_VERSION' ) || class_exists( 'RankMath' ) ) return 'rankmath';
		if ( defined( 'AIOSEO_VERSION' ) || class_exists( 'AIOSEO\\Plugin\\AIOSEO' ) ) return 'aioseo';
		if ( defined( 'SEOPRESS_VERSION' ) ) return 'seopress';
		return null;
	}
}
