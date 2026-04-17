<?php
if ( ! defined( 'ABSPATH' ) ) exit;

class QATool_Admin {

	const SLUG = 'qatool';
	const NONCE = 'qatool_admin';

	public function register() {
		add_action( 'admin_menu', array( $this, 'menu' ) );
		add_action( 'admin_init', array( $this, 'maybe_save_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'assets' ) );
		add_action( 'wp_ajax_qatool_scan', array( $this, 'ajax_scan' ) );
		add_action( 'wp_ajax_qatool_patch', array( $this, 'ajax_patch' ) );
		add_action( 'wp_ajax_qatool_revert', array( $this, 'ajax_revert' ) );
		add_action( 'wp_ajax_qatool_history', array( $this, 'ajax_history' ) );
		add_action( 'wp_ajax_qatool_attach_visual', array( $this, 'ajax_attach_visual' ) );
	}

	public function menu() {
		add_menu_page(
			__( 'QAtool', 'qatool' ),
			__( 'QAtool', 'qatool' ),
			'manage_options',
			self::SLUG,
			array( $this, 'render_page' ),
			'dashicons-search',
			81
		);
	}

	public function assets( $hook ) {
		if ( strpos( (string) $hook, self::SLUG ) === false ) return;
		wp_enqueue_style( 'qatool-admin', QATOOL_PLUGIN_URL . 'assets/admin.css', array(), QATOOL_VERSION );
		wp_enqueue_script( 'qatool-admin', QATOOL_PLUGIN_URL . 'assets/admin.js', array( 'wp-element', 'wp-api-fetch' ), QATOOL_VERSION, true );
		$settings = QATool_Api_Client::get_settings();
		wp_localize_script(
			'qatool-admin',
			'QATool',
			array(
				'ajaxUrl'        => admin_url( 'admin-ajax.php' ),
				'nonce'          => wp_create_nonce( self::NONCE ),
				'site'           => home_url( '/' ),
				'scannerBase'    => untrailingslashit( $settings['endpoint'] ),
				'scannerApiKey'  => $settings['api_key'],
				'diffThreshold'  => 5.0,
			)
		);
	}

	public function maybe_save_settings() {
		if ( ! current_user_can( 'manage_options' ) ) return;
		if ( empty( $_POST['qatool_settings_nonce'] ) ) return;
		if ( ! wp_verify_nonce( $_POST['qatool_settings_nonce'], 'qatool_save_settings' ) ) return;

		$settings = QATool_Api_Client::save_settings( array(
			'endpoint'  => wp_unslash( $_POST['endpoint'] ?? '' ),
			'api_key'   => wp_unslash( $_POST['api_key'] ?? '' ),
			'max_pages' => wp_unslash( $_POST['max_pages'] ?? '10' ),
		) );
		add_settings_error( 'qatool', 'saved', __( 'Settings saved.', 'qatool' ), 'updated' );
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) wp_die();
		$settings = QATool_Api_Client::get_settings();
		settings_errors( 'qatool' );
		?>
		<div class="wrap qatool-wrap">
			<h1><?php esc_html_e( 'QAtool — SEO & Responsive Audits', 'qatool' ); ?></h1>

			<h2><?php esc_html_e( 'Connection', 'qatool' ); ?></h2>
			<form method="post">
				<?php wp_nonce_field( 'qatool_save_settings', 'qatool_settings_nonce' ); ?>
				<table class="form-table">
					<tr>
						<th><label for="qatool-endpoint"><?php esc_html_e( 'Scanner endpoint', 'qatool' ); ?></label></th>
						<td>
							<input id="qatool-endpoint" name="endpoint" type="url" class="regular-text" value="<?php echo esc_attr( $settings['endpoint'] ); ?>" placeholder="https://your-qatool.vercel.app" />
							<p class="description"><?php esc_html_e( 'Base URL of your deployed Next.js app.', 'qatool' ); ?></p>
						</td>
					</tr>
					<tr>
						<th><label for="qatool-api-key"><?php esc_html_e( 'API key', 'qatool' ); ?></label></th>
						<td>
							<input id="qatool-api-key" name="api_key" type="text" class="regular-text" value="<?php echo esc_attr( $settings['api_key'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Must match QATOOL_API_KEY env var on the scanner.', 'qatool' ); ?></p>
						</td>
					</tr>
					<tr>
						<th><label for="qatool-max"><?php esc_html_e( 'Max pages per scan', 'qatool' ); ?></label></th>
						<td>
							<input id="qatool-max" name="max_pages" type="number" min="1" max="100" value="<?php echo (int) $settings['max_pages']; ?>" />
						</td>
					</tr>
				</table>
				<p><button class="button button-primary"><?php esc_html_e( 'Save', 'qatool' ); ?></button></p>
			</form>

			<hr />

			<h2><?php esc_html_e( 'Run a site scan', 'qatool' ); ?></h2>
			<p><?php esc_html_e( 'Scans your site via the Next.js app, then lets you apply inline fixes to Elementor/Breakdance pages here in WordPress. Deep scan adds Puppeteer-powered responsive, link, and UX checks (slower).', 'qatool' ); ?></p>
			<p>
				<button id="qatool-run" class="button button-primary" type="button"><?php esc_html_e( 'Scan this site', 'qatool' ); ?></button>
				<label style="margin-left:12px"><input type="checkbox" id="qatool-deep" /> <?php esc_html_e( 'Deep scan', 'qatool' ); ?></label>
				<label style="margin-left:12px"><input type="checkbox" id="qatool-verify" /> <?php esc_html_e( 'Visual-verify each patch', 'qatool' ); ?></label>
				<label style="margin-left:12px"><input type="checkbox" id="qatool-auto-revert" /> <?php esc_html_e( 'Auto-revert if diff > 5%', 'qatool' ); ?></label>
				<span id="qatool-status" class="qatool-status"></span>
			</p>
			<div id="qatool-results"></div>
		</div>
		<?php
	}

	public function ajax_scan() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'forbidden', 403 );

		$settings = QATool_Api_Client::get_settings();
		$site_url = home_url( '/' );
		$discover = QATool_Api_Client::discover( $site_url, $settings['max_pages'] );
		if ( is_wp_error( $discover ) ) {
			wp_send_json_error( $discover->get_error_message() );
		}
		$urls = array_slice( (array) ( $discover['urls'] ?? array() ), 0, $settings['max_pages'] );
		$reports = array();
		$deep = isset( $_POST['deep'] ) && $_POST['deep'];
		foreach ( $urls as $url ) {
			$path = 'api/scan?url=' . rawurlencode( $url ) . ( $deep ? '&deep=1&viewports=mobile,desktop' : '' );
			$res = QATool_Api_Client::request( $path, array( 'method' => 'GET', 'timeout' => $deep ? 90 : 30 ) );
			if ( is_wp_error( $res ) ) {
				$reports[] = array( 'url' => $url, 'error' => $res->get_error_message() );
				continue;
			}
			$report = $res['report'] ?? null;
			if ( ! $report ) {
				$reports[] = array( 'url' => $url, 'error' => 'malformed response' );
				continue;
			}
			$post_id = QATool_Patcher::url_to_post_id( $report['url'] );
			$report['post_id'] = $post_id;
			$report['builder'] = $post_id ? QATool_Patcher::detect_builder( $post_id ) : null;
			$report['history'] = $post_id ? QATool_Revert::get_log( $post_id ) : array();
			$reports[] = $report;
		}
		wp_send_json_success( array( 'reports' => $reports, 'seo_plugin' => QATool_Patcher::detect_seo_plugin() ) );
	}

	public function ajax_revert() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'forbidden', 403 );

		$post_id  = (int) ( $_POST['post_id'] ?? 0 );
		$entry_id = sanitize_text_field( wp_unslash( $_POST['entry_id'] ?? '' ) );
		if ( ! $post_id || ! $entry_id ) wp_send_json_error( 'Missing post_id or entry_id.' );

		$result = QATool_Revert::revert( $post_id, $entry_id );
		if ( is_wp_error( $result ) ) wp_send_json_error( $result->get_error_message() );
		wp_send_json_success( array( 'result' => $result, 'history' => QATool_Revert::get_log( $post_id ) ) );
	}

	public function ajax_history() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'forbidden', 403 );
		$post_id = (int) ( $_POST['post_id'] ?? 0 );
		if ( ! $post_id ) wp_send_json_error( 'Missing post_id.' );
		wp_send_json_success( array( 'history' => QATool_Revert::get_log( $post_id ) ) );
	}

	public function ajax_attach_visual() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'forbidden', 403 );
		$post_id  = (int) ( $_POST['post_id'] ?? 0 );
		$entry_id = sanitize_text_field( wp_unslash( $_POST['entry_id'] ?? '' ) );
		$diff     = isset( $_POST['diff_percent'] ) ? (float) $_POST['diff_percent'] : null;
		$viewport = sanitize_text_field( wp_unslash( $_POST['viewport'] ?? 'desktop' ) );
		if ( ! $post_id || ! $entry_id || $diff === null ) wp_send_json_error( 'Missing fields.' );

		QATool_Revert::annotate( $post_id, $entry_id, array(
			'visual' => array(
				'diff_percent' => $diff,
				'viewport'     => $viewport,
				'captured_at'  => time(),
			),
		) );
		wp_send_json_success();
	}

	public function ajax_patch() {
		check_ajax_referer( self::NONCE, 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) wp_send_json_error( 'forbidden', 403 );

		$post_id = (int) ( $_POST['post_id'] ?? 0 );
		$patch_raw = wp_unslash( $_POST['patch'] ?? '' );
		$value  = sanitize_text_field( wp_unslash( $_POST['value'] ?? '' ) );
		$dry    = ! empty( $_POST['dry_run'] );

		$patch = json_decode( $patch_raw, true );
		if ( ! is_array( $patch ) ) wp_send_json_error( 'Invalid patch payload.' );
		if ( $value !== '' ) $patch['value'] = $value;

		$result = QATool_Patcher::apply( $post_id, $patch, $dry );
		if ( is_wp_error( $result ) ) wp_send_json_error( $result->get_error_message() );
		wp_send_json_success( $result );
	}
}
