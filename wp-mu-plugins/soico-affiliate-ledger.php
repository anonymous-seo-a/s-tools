<?php
/**
 * Plugin Name: soico Affiliate Ledger
 * Description: アフィリクリックと page_view をサーバ側で GA4(G-HN8PP1H83E) へ Measurement Protocol 直送する。ThirstyAffiliates のリダイレクトに相乗りし、クライアントGTM/ITP/新規タブ/遅延ロードに非依存で「記事→リンク→クリック」と母数(page_view)を計測する。クライアントJSを一切増やさないため PageSpeed に影響しない。
 * Version: 1.7.0
 * Author: soico
 *
 * 設置: mu-plugins/ に置く（自動有効化、停止不可）。
 * 秘密情報: API secret はリポジトリに置かない。サーバの mu-plugins/soico-al-secret.php に
 *   <?php define('SOICO_AL_API_SECRET','xxxx'); define('SOICO_AL_DEBUG', true);
 *   の形で定義する（別ファイル・git管理外）。検証中は SOICO_AL_DEBUG=true で DebugView のみに送り、
 *   レポートを汚さずに確認 → 確認後 false に切替える。
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'SOICO_AL_MEASUREMENT_ID', 'G-HN8PP1H83E' );
define( 'SOICO_AL_TABLE', 'soico_aff_clicks' );
define( 'SOICO_AL_CV_TABLE', 'soico_aff_conversions' );
define( 'SOICO_AL_DB_VERSION', '2' );

// API secret / DEBUG フラグはサーバ側の別ファイルから読む（リポジトリに含めない）。
if ( ! defined( 'SOICO_AL_API_SECRET' ) ) {
	$soico_al_secret = __DIR__ . '/soico-al-secret.php';
	if ( is_readable( $soico_al_secret ) ) {
		require_once $soico_al_secret;
	}
}

/* ===========================================================================
 * テーブル（クリック台帳 = 真実の源）
 * ======================================================================== */

add_action( 'init', 'soico_al_maybe_install' );
function soico_al_maybe_install() {
	if ( get_option( 'soico_al_db_version' ) === SOICO_AL_DB_VERSION ) {
		return;
	}
	global $wpdb;
	$table   = $wpdb->prefix . SOICO_AL_TABLE;
	$charset = $wpdb->get_charset_collate();
	require_once ABSPATH . 'wp-admin/includes/upgrade.php';
	dbDelta(
		"CREATE TABLE {$table} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			click_id CHAR(32) NOT NULL,
			created_at DATETIME NOT NULL,
			post_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
			link_id BIGINT UNSIGNED NOT NULL DEFAULT 0,
			advertiser VARCHAR(191) NOT NULL DEFAULT '',
			dest_host VARCHAR(191) NOT NULL DEFAULT '',
			ga_client_id VARCHAR(64) NOT NULL DEFAULT '',
			ga_session_id VARCHAR(32) NOT NULL DEFAULT '',
			referer TEXT NULL,
			ua VARCHAR(255) NOT NULL DEFAULT '',
			ip_hash CHAR(64) NOT NULL DEFAULT '',
			mp_sent TINYINT NOT NULL DEFAULT 0,
			PRIMARY KEY (id),
			UNIQUE KEY click_id (click_id),
			KEY post_id (post_id),
			KEY advertiser (advertiser),
			KEY created_at (created_at)
		) {$charset};"
	);
	// ASP 成果(CV) 台帳。subid = 台帳の click_id と突合してクリック→成果を接続する。
	$cv = $wpdb->prefix . SOICO_AL_CV_TABLE;
	dbDelta(
		"CREATE TABLE {$cv} (
			id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
			dedup_key CHAR(40) NOT NULL,
			asp VARCHAR(64) NOT NULL DEFAULT '',
			subid VARCHAR(64) NOT NULL DEFAULT '',
			status VARCHAR(32) NOT NULL DEFAULT '',
			reward DECIMAL(12,2) NOT NULL DEFAULT 0,
			order_id VARCHAR(191) NOT NULL DEFAULT '',
			occurred_at DATETIME NULL,
			imported_at DATETIME NOT NULL,
			raw TEXT NULL,
			PRIMARY KEY (id),
			UNIQUE KEY dedup_key (dedup_key),
			KEY subid (subid),
			KEY asp (asp)
		) {$charset};"
	);
	update_option( 'soico_al_db_version', SOICO_AL_DB_VERSION );
}

/* ===========================================================================
 * アフィリクリック計測（Thirsty 相乗り）
 * ======================================================================== */

// リダイレクト応答のキャッシュを全層（CF エッジ / APO / ブラウザ）で禁止する。
// キャッシュされると (1) クリックが origin に届かず台帳ごと欠落 (2) subid 注入値が
// 固定化され全ユーザが同一 click_id で着地し CV 突合が汚染される（2026-07-02 crypto 301 で実害確認）。
add_action( 'ta_before_link_redirect', 'soico_al_no_cache_redirect', 5 );
add_action( 'ta_before_link_redirect_ajax', 'soico_al_no_cache_redirect', 5 );
function soico_al_no_cache_redirect() {
	if ( headers_sent() ) {
		return;
	}
	nocache_headers();
	header( 'Cache-Control: no-store, no-cache, must-revalidate, max-age=0' );
	header( 'CF-Edge-Cache: no-cache' );
}

add_action( 'ta_before_link_redirect', 'soico_al_capture', 10, 3 );
add_action( 'ta_before_link_redirect_ajax', 'soico_al_capture', 10, 3 );
function soico_al_capture( $thirstylink, $redirect_url, $redirect_type ) {
	try {
		soico_al_record( $thirstylink, $redirect_url );
	} catch ( \Throwable $e ) {
		error_log( '[soico-al click] ' . $e->getMessage() );
	}
}

function soico_al_record( $thirstylink, $redirect_url ) {
	global $wpdb;

	// bot / ヘルスチェック / CLI クライアントは台帳に入れない（クリック実数の汚染防止）。
	if ( soico_al_is_bot_ua( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ) {
		return;
	}

	// 1) リンク（広告主）: Thirsty link の post_name = 銘柄slug。
	$link_id    = 0;
	$advertiser = '';
	if ( is_object( $thirstylink ) ) {
		if ( method_exists( $thirstylink, 'get_id' ) ) {
			$link_id = (int) $thirstylink->get_id();
		} elseif ( isset( $thirstylink->ID ) ) {
			$link_id = (int) $thirstylink->ID;
		}
	}
	if ( $link_id ) {
		$link_post = get_post( $link_id );
		if ( $link_post ) {
			$advertiser = $link_post->post_name;
		}
	}
	if ( '' === $advertiser && ! empty( $_SERVER['REQUEST_URI'] ) && preg_match( '#/recommends/([^/?]+)#', $_SERVER['REQUEST_URI'], $m ) ) {
		$advertiser = sanitize_title( $m[1] );
	}

	// 2) 流入記事(post_id): まず明示の ?src=、無ければ同一オリジン Referer（ITPで削られない）。
	$post_id = 0;
	if ( ! empty( $_GET['src'] ) && ctype_digit( (string) $_GET['src'] ) ) {
		$post_id = (int) $_GET['src'];
	}
	$referer = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( $_SERVER['HTTP_REFERER'] ) : '';
	if ( ! $post_id && $referer ) {
		$pid = url_to_postid( $referer );
		if ( $pid ) {
			$post_id = (int) $pid;
		}
	}

	// 3) GA4 の client_id / session_id（無ければ server で発行し cookie 共有）。
	$client_id  = soico_al_identity();
	$session_id = soico_al_session();

	// 4) 台帳に1行。click_id は subID 注入フィルタと共有（同一リクエスト → ASP成果と確実に突合）。
	$click_id  = soico_al_click_id();
	$dest_host = (string) wp_parse_url( $redirect_url, PHP_URL_HOST );
	$ua        = isset( $_SERVER['HTTP_USER_AGENT'] ) ? substr( $_SERVER['HTTP_USER_AGENT'], 0, 255 ) : '';
	$ip_hash   = hash( 'sha256', ( $_SERVER['REMOTE_ADDR'] ?? '' ) . '|' . wp_salt( 'auth' ) );

	$mp_sent = ( defined( 'SOICO_AL_API_SECRET' ) && SOICO_AL_API_SECRET && $client_id ) ? 1 : 0;

	$wpdb->insert(
		$wpdb->prefix . SOICO_AL_TABLE,
		array(
			'click_id'      => $click_id,
			'created_at'    => current_time( 'mysql' ),
			'post_id'       => $post_id,
			'link_id'       => $link_id,
			'advertiser'    => $advertiser,
			'dest_host'     => $dest_host,
			'ga_client_id'  => $client_id,
			'ga_session_id' => $session_id,
			'referer'       => $referer,
			'ua'            => $ua,
			'ip_hash'       => $ip_hash,
			'mp_sent'       => $mp_sent,
		)
	);

	// 5) GA4 へ affiliate_click を直送（非ブロッキング）。
	if ( $mp_sent ) {
		$params = array(
			'post_id'              => (string) $post_id,
			'advertiser'           => $advertiser,
			'link_id'              => (string) $link_id,
			'link_url'             => $redirect_url,
			'engagement_time_msec' => '1',
			'session_id'           => $session_id,
		);
		if ( $post_id ) {
			$params['article_title'] = (string) get_the_title( $post_id );
			$params['article_path']  = (string) wp_make_link_relative( get_permalink( $post_id ) );
		}
		soico_al_send_event( 'affiliate_click', $client_id, $params );
	}
}

/* ===========================================================================
 * サーバ側 page_view（母数完全化・PageSpeed非依存）
 * クライアント由来 page_view は GTM 側で停止し二重計上を防ぐ。
 * ======================================================================== */

add_action( 'template_redirect', 'soico_al_pageview', 1 );
function soico_al_pageview() {
	try {
		if ( ! soico_al_should_count_pageview() ) {
			return;
		}
		if ( ! defined( 'SOICO_AL_API_SECRET' ) || ! SOICO_AL_API_SECRET ) {
			return;
		}
		$post_id    = (int) get_queried_object_id();
		$client_id  = soico_al_identity();
		$session_id = soico_al_session();
		if ( ! $client_id ) {
			return;
		}

		$scheme        = is_ssl() ? 'https' : 'http';
		$host          = $_SERVER['HTTP_HOST'] ?? soico_al_cookie_domain();
		$page_location = esc_url_raw( $scheme . '://' . $host . ( $_SERVER['REQUEST_URI'] ?? '' ) );

		$params = array(
			'page_location'        => $page_location,
			'page_title'           => wp_get_document_title(),
			'engagement_time_msec' => '1',
			'session_id'           => $session_id,
		);
		$ref = isset( $_SERVER['HTTP_REFERER'] ) ? esc_url_raw( $_SERVER['HTTP_REFERER'] ) : '';
		if ( $ref && false === strpos( $ref, soico_al_cookie_domain() ) ) {
			$params['page_referrer'] = $ref;
		}
		if ( $post_id ) {
			$params['post_id'] = (string) $post_id;
		}
		soico_al_send_event( 'page_view', $client_id, $params );
	} catch ( \Throwable $e ) {
		error_log( '[soico-al pv] ' . $e->getMessage() );
	}
}

function soico_al_should_count_pageview() {
	if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return false;
	}
	if ( is_feed() || is_robots() || is_trackback() || is_preview() ) {
		return false;
	}
	// 記事/固定ページのみを母数とする（thirstylink 等 CPT・一覧・404 は除外）。
	if ( ! is_singular( array( 'post', 'page' ) ) ) {
		return false;
	}
	if ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
		return false; // 編集者の閲覧は除外
	}
	if ( soico_al_is_bot_ua( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ) {
		return false; // bot / Lighthouse / PSI は計測しない
	}
	return true;
}

// クリック台帳 / page_view 共通の bot 判定。空UA・クローラ・CLIクライアントを除外。
function soico_al_is_bot_ua( $ua ) {
	if ( '' === $ua ) {
		return true;
	}
	return (bool) preg_match(
		'/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pagespeed|gtmetrix|monitor|preview|facebookexternalhit|embed|curl|wget|python-requests|python-urllib|go-http-client|okhttp|httpclient|scrapy|phantomjs/i',
		$ua
	);
}

/* ===========================================================================
 * GA4 識別子（client_id / session_id）の取得・発行
 * クライアントgtagと同じ first-party cookie を共有する。
 * ======================================================================== */

function soico_al_identity() {
	$cid = soico_al_read_client_id();
	if ( $cid ) {
		return $cid;
	}
	// GA4 形式: GA1.1.<rand>.<firstSeenTs>
	$cid = wp_rand( 100000000, 2147483647 ) . '.' . time();
	soico_al_setcookie( '_ga', 'GA1.1.' . $cid, time() + 2 * YEAR_IN_SECONDS );
	return $cid;
}

function soico_al_read_client_id() {
	$ga = $_COOKIE['_ga'] ?? '';
	if ( preg_match( '/GA\d+\.\d+\.(\d+\.\d+)/', $ga, $m ) ) {
		return $m[1];
	}
	return '';
}

function soico_al_session() {
	$name = '_ga_' . substr( SOICO_AL_MEASUREMENT_ID, 2 ); // "G-" を除去
	$now  = time();
	$raw  = $_COOKIE[ $name ] ?? '';
	$sid  = '';
	$num  = 1;
	if ( $raw && preg_match( '/^GS\d+\.\d+\.(\d+)\.(\d+)\.\d+\.(\d+)/', $raw, $m ) ) {
		$sid       = $m[1];
		$num       = (int) $m[2];
		$last_seen = (int) $m[3];
		if ( ( $now - $last_seen ) >= 1800 ) { // 30分無活動 → 新セッション
			$sid = (string) $now;
			$num++;
		}
	}
	if ( '' === $sid ) {
		$sid = (string) $now;
	}
	// GS1.1.<sid>.<num>.<engaged>.<lastSeen>.0.0.0
	$value = 'GS1.1.' . $sid . '.' . $num . '.1.' . $now . '.0.0.0';
	soico_al_setcookie( $name, $value, time() + 2 * YEAR_IN_SECONDS );
	return $sid;
}

function soico_al_setcookie( $name, $value, $expires ) {
	if ( headers_sent() ) {
		return;
	}
	setcookie(
		$name,
		$value,
		array(
			'expires'  => $expires,
			'path'     => '/',
			'domain'   => '.' . soico_al_cookie_domain(),
			'secure'   => is_ssl(),
			'httponly' => false, // GA の _ga はクライアントgtagと共有するため JS から読める必要あり
			'samesite' => 'Lax',
		)
	);
	$_COOKIE[ $name ] = $value; // 同一リクエスト内で再利用
}

function soico_al_cookie_domain() {
	$host = (string) wp_parse_url( home_url(), PHP_URL_HOST );
	$host = preg_replace( '/^www\./', '', $host );
	return $host ?: 'soico.jp';
}

/* ===========================================================================
 * ASPサブID注入（記事→クリック→CV を ASP成果レポート経由で閉じる）
 *   Thirsty の ta_filter_redirect_url で、着地ASPのサブIDパラメータに click_id を載せる。
 *   ASP成果レポートに click_id が返れば、台帳の click_id と join → post_id（記事）へ到達。
 *   注入値 = soico_al_click_id()（同一リクエストで台帳記録と共有 → 確実に突合）。
 *   対応表は確認済みASPのみ有効化。未対応ASPのリンクは一切変更しない。
 * ======================================================================== */

add_filter( 'ta_filter_redirect_url', 'soico_al_inject_subid', 20, 3 );
function soico_al_inject_subid( $redirect_url, $thirstylink = null, $query_string = '' ) {
	try {
		$host  = (string) wp_parse_url( $redirect_url, PHP_URL_HOST );
		$param = soico_al_subid_param_for_host( $host );
		if ( '' === $param ) {
			return $redirect_url; // 未対応ASP → 無変更
		}
		if ( preg_match( '/[?&]' . preg_quote( $param, '/' ) . '=/', $redirect_url ) ) {
			return $redirect_url; // 既に同名param有り → 触らない
		}
		$sep = ( false === strpos( $redirect_url, '?' ) ) ? '?' : '&';
		return $redirect_url . $sep . rawurlencode( $param ) . '=' . rawurlencode( soico_al_click_id() );
	} catch ( \Throwable $e ) {
		error_log( '[soico-al subid] ' . $e->getMessage() );
		return $redirect_url; // 失敗してもリダイレクトを壊さない
	}
}

function soico_al_subid_param_for_host( $host ) {
	foreach ( soico_al_asp_subid_map() as $needle => $param ) {
		if ( '' !== $needle && false !== strpos( $host, $needle ) ) {
			return $param;
		}
	}
	return '';
}

/**
 * 着地ASPホスト（部分一致） => サブIDパラメータ名。
 * 確認済みASPのみ有効化（未確認はコメントのまま）。新ASPは1行追加で対応。
 */
function soico_al_asp_subid_map() {
	return apply_filters(
		'soico_al_asp_subid_map',
		array(
			'afi-b.com' => 'id1',    // afb: 公式サポートの媒体サブID。成果レポート「キーワード」に返る（確認済）
			'82comb.net' => 'subid', // TCSアフィリエイト: 広告ごとに「トラッキング用パラメータ名」を全広告 subid に統一登録。値=click_id を成果に返す
			// 'accesstrade.net' => 'rk',    // 要ダッシュボード確認
			// 'felmat.net'      => 'args',  // 要ダッシュボード確認
			// 'rentracks.jp'    => '',
			// 'trafficgate.net' => '',
			// 'medipartner.jp'  => '',
		)
	);
}

/**
 * リクエスト内で一意の click_id。subID注入フィルタと台帳記録で共有する。
 */
function soico_al_click_id() {
	static $cid = null;
	if ( null === $cid ) {
		$cid = md5( uniqid( '', true ) . wp_rand() );
	}
	return $cid;
}

/* ===========================================================================
 * 読取 REST（リライト効果測定 連携）
 *   GET /wp-json/soico/v1/aff-clicks?start=YYYY-MM-DD&end=YYYY-MM-DD
 *   返却: { rows: [ { post_id, date, partner, clicks } ], start, end }
 *   台帳テーブル(真実の源)を post_id × 日 × advertiser 単位で集計して返す。
 *   GA4 を経由しないため DEBUG(shadow)中でも実データが取れる。
 *   認証: Application Password (edit_posts)。soico-aioseo-rest と同方式。
 * ======================================================================== */

add_action( 'rest_api_init', 'soico_al_register_routes' );
function soico_al_register_routes() {
	register_rest_route(
		'soico/v1',
		'/aff-clicks',
		array(
			'methods'             => 'GET',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
			'callback'            => 'soico_al_rest_aff_clicks',
		)
	);
	// クリック分析 UI 用: 記事 × リンク × クリック数 × ユニークユーザ を台帳から直集計。
	// 台帳を都度ライブ照会するため cron 非依存で常に最新（最大の遅延 = クリック発生〜DB insert）。
	register_rest_route(
		'soico/v1',
		'/aff-clicks/breakdown',
		array(
			'methods'             => 'GET',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
			'callback'            => 'soico_al_rest_breakdown',
		)
	);
	// ASP 成果(CV) 取込: 正規化済の成果行を冪等 upsert（subid = click_id）。
	register_rest_route(
		'soico/v1',
		'/conversions',
		array(
			'methods'             => 'POST',
			'permission_callback' => function () {
				return current_user_can( 'edit_posts' );
			},
			'callback'            => 'soico_al_rest_conversions_import',
		)
	);
}

function soico_al_rest_conversions_import( WP_REST_Request $req ) {
	global $wpdb;
	$cv_table = $wpdb->prefix . SOICO_AL_CV_TABLE;
	$asp  = sanitize_text_field( (string) $req->get_param( 'asp' ) );
	$rows = $req->get_param( 'rows' );
	if ( ! is_array( $rows ) ) {
		return new WP_Error( 'bad_rows', 'rows must be an array', array( 'status' => 400 ) );
	}
	$now = current_time( 'mysql' );
	$inserted = 0; $skipped = 0; $matched = 0;
	foreach ( $rows as $row ) {
		$subid = sanitize_text_field( (string) ( $row['subid'] ?? '' ) );
		if ( '' === $subid ) { $skipped++; continue; }
		$status   = sanitize_text_field( (string) ( $row['status'] ?? '' ) );
		$reward   = isset( $row['reward'] ) ? (float) $row['reward'] : 0;
		$order_id = sanitize_text_field( (string) ( $row['order_id'] ?? '' ) );
		$occurred = '';
		if ( ! empty( $row['occurred_at'] ) ) {
			$ts = strtotime( (string) $row['occurred_at'] );
			if ( $ts ) { $occurred = gmdate( 'Y-m-d H:i:s', $ts ); }
		}
		// 冪等キー: ASP の order_id があればそれ、無ければ内容ハッシュ。
		$dedup = sha1( $asp . '|' . $subid . '|' . $order_id . '|' . $occurred . '|' . $reward . '|' . $status );
		$exists = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$cv_table} WHERE dedup_key = %s", $dedup ) );
		if ( $exists ) { $skipped++; }
		else {
			$wpdb->insert( $cv_table, array(
				'dedup_key'   => $dedup,
				'asp'         => $asp,
				'subid'       => $subid,
				'status'      => $status,
				'reward'      => $reward,
				'order_id'    => $order_id,
				'occurred_at' => $occurred ?: null,
				'imported_at' => $now,
				'raw'         => isset( $row['raw'] ) ? wp_json_encode( $row['raw'] ) : null,
			) );
			$inserted++;
		}
		// この subid が台帳クリックに存在するか（突合率の可視化用）。
		if ( $wpdb->get_var( $wpdb->prepare(
			"SELECT 1 FROM {$wpdb->prefix}" . SOICO_AL_TABLE . " WHERE click_id = %s LIMIT 1", $subid ) ) ) {
			$matched++;
		}
	}
	return array( 'asp' => $asp, 'received' => count( $rows ), 'inserted' => $inserted, 'skipped' => $skipped, 'matched_to_click' => $matched );
}

function soico_al_rest_breakdown( WP_REST_Request $req ) {
	global $wpdb;
	$table = $wpdb->prefix . SOICO_AL_TABLE;

	$end   = soico_al_norm_date( $req->get_param( 'end' ), current_time( 'Y-m-d' ) );
	$start = soico_al_norm_date( $req->get_param( 'start' ), date( 'Y-m-d', strtotime( $end . ' -29 day' ) ) );
	if ( $start > $end ) {
		$tmp = $start; $start = $end; $end = $tmp;
	}
	$post_filter = (int) $req->get_param( 'post_id' );
	$adv_filter  = sanitize_text_field( (string) $req->get_param( 'advertiser' ) );
	$limit       = (int) $req->get_param( 'limit' );
	$limit       = ( $limit > 0 && $limit <= 5000 ) ? $limit : 2000;

	$where  = array( 'post_id > 0', 'created_at >= %s', 'created_at <= %s' );
	$params = array( $start . ' 00:00:00', $end . ' 23:59:59' );
	if ( $post_filter > 0 ) {
		$where[]  = 'post_id = %d';
		$params[] = $post_filter;
	}
	if ( '' !== $adv_filter ) {
		$where[]  = 'advertiser = %s';
		$params[] = $adv_filter;
	}
	$where_sql = implode( ' AND ', $where );

	$sql = "SELECT post_id, link_id, advertiser, dest_host,
	               COUNT(*) AS clicks,
	               COUNT(DISTINCT ga_client_id) AS users,
	               MAX(created_at) AS last_click
	          FROM {$table}
	         WHERE {$where_sql}
	         GROUP BY post_id, link_id, advertiser, dest_host
	         ORDER BY clicks DESC
	         LIMIT %d";
	$params[] = $limit;
	$rows = $wpdb->get_results( $wpdb->prepare( $sql, $params ), ARRAY_A );

	// LIMIT を除いた WHERE 用パラメータ（補助集計で共有）。
	$base_params = array_slice( $params, 0, count( $params ) - 1 );

	// ASP 成果(CV): subid = click_id でクリックに突合し、(post_id, link_id) 単位で件数/報酬を集計。
	// JOIN によるクリック行の増殖を避けるため、クリック集計とは別クエリにする。
	$cv_table = $wpdb->prefix . SOICO_AL_CV_TABLE;
	$wt = array( 't.post_id > 0', 't.created_at >= %s', 't.created_at <= %s' );
	if ( $post_filter > 0 ) { $wt[] = 't.post_id = %d'; }
	if ( '' !== $adv_filter ) { $wt[] = 't.advertiser = %s'; }
	$wt_sql = implode( ' AND ', $wt );
	$cv_map = array();
	foreach ( (array) $wpdb->get_results( $wpdb->prepare(
		"SELECT t.post_id, t.link_id, COUNT(*) AS cv, COALESCE(SUM(c.reward),0) AS reward
		   FROM {$cv_table} c JOIN {$table} t ON t.click_id = c.subid
		  WHERE {$wt_sql}
		  GROUP BY t.post_id, t.link_id",
		$base_params ), ARRAY_A ) as $r ) {
		$cv_map[ (int) $r['post_id'] . '|' . (int) $r['link_id'] ] = array(
			'cv' => (int) $r['cv'], 'reward' => (float) $r['reward'],
		);
	}

	// 記事メタ(title/url)を post_id ごと1回だけ解決してキャッシュ。
	$meta = array();
	$out  = array();
	foreach ( (array) $rows as $r ) {
		$pid = (int) $r['post_id'];
		if ( ! isset( $meta[ $pid ] ) ) {
			$meta[ $pid ] = array(
				'title' => (string) get_the_title( $pid ),
				'url'   => (string) get_permalink( $pid ),
			);
		}
		$lid = (int) $r['link_id'];
		$cvr = $cv_map[ $pid . '|' . $lid ] ?? array( 'cv' => 0, 'reward' => 0 );
		$out[] = array(
			'post_id'    => $pid,
			'post_title' => $meta[ $pid ]['title'],
			'post_url'   => $meta[ $pid ]['url'],
			'link_id'    => $lid,
			'link_url'   => $lid ? home_url( '/recommends/' . $r['advertiser'] . '/' ) : '',
			'advertiser' => (string) $r['advertiser'],
			'dest_host'  => (string) $r['dest_host'],
			'clicks'     => (int) $r['clicks'],
			'users'      => (int) $r['users'],
			'cv'         => $cvr['cv'],
			'reward'     => $cvr['reward'],
			'last_click' => $r['last_click'],
		);
	}

	$totals = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT COUNT(*) AS clicks, COUNT(DISTINCT ga_client_id) AS users,
			        COUNT(DISTINCT post_id) AS posts, COUNT(DISTINCT advertiser) AS advertisers
			   FROM {$table} WHERE {$where_sql}",
			$base_params
		),
		ARRAY_A
	);
	$cv_totals = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT COUNT(*) AS cv, COALESCE(SUM(c.reward),0) AS reward
			   FROM {$cv_table} c JOIN {$table} t ON t.click_id = c.subid WHERE {$wt_sql}",
			$base_params
		),
		ARRAY_A
	);

	// 厳密ユニーク: 記事別 / 商材別の COUNT(DISTINCT client_id)。集約ピボットで行users合算の
	// 重複過大を避けるため実数を別途返す（同一ユーザが複数リンクを踏むと行合算は過大になる）。
	$users_by_post = array();
	foreach ( (array) $wpdb->get_results( $wpdb->prepare(
		"SELECT post_id, COUNT(DISTINCT ga_client_id) AS u FROM {$table} WHERE {$where_sql} GROUP BY post_id",
		$base_params ), ARRAY_A ) as $r ) {
		$users_by_post[ (string) (int) $r['post_id'] ] = (int) $r['u'];
	}
	$users_by_advertiser = array();
	foreach ( (array) $wpdb->get_results( $wpdb->prepare(
		"SELECT advertiser, COUNT(DISTINCT ga_client_id) AS u FROM {$table} WHERE {$where_sql} GROUP BY advertiser",
		$base_params ), ARRAY_A ) as $r ) {
		$users_by_advertiser[ (string) $r['advertiser'] ] = (int) $r['u'];
	}

	// 時系列: 単日レンジは時間バケット、複数日は日次。リライト施策とクリックの因果を視認するため。
	$bucket = ( $start === $end ) ? 'hour' : 'day';
	$fmt    = ( 'hour' === $bucket ) ? '%Y-%m-%d %H:00' : '%Y-%m-%d';
	// prepare は % をプレースホルダ扱いするので DATE_FORMAT の % は %% にエスケープする。
	$fmt_sql = str_replace( '%', '%%', $fmt );
	$series = array();
	foreach ( (array) $wpdb->get_results( $wpdb->prepare(
		"SELECT DATE_FORMAT(created_at, '{$fmt_sql}') AS t, COUNT(*) AS clicks,
		        COUNT(DISTINCT ga_client_id) AS users
		   FROM {$table} WHERE {$where_sql} GROUP BY t ORDER BY t",
		$base_params ), ARRAY_A ) as $r ) {
		$series[] = array( 't' => $r['t'], 'clicks' => (int) $r['clicks'], 'users' => (int) $r['users'] );
	}

	return array(
		'rows'                => $out,
		'start'               => $start,
		'end'                 => $end,
		'server_time'         => current_time( 'mysql' ),
		'bucket'              => $bucket,
		'series'              => $series,
		'users_by_post'       => $users_by_post,
		'users_by_advertiser' => $users_by_advertiser,
		'totals'              => array(
			'clicks'      => (int) ( $totals['clicks'] ?? 0 ),
			'users'       => (int) ( $totals['users'] ?? 0 ),
			'posts'       => (int) ( $totals['posts'] ?? 0 ),
			'advertisers' => (int) ( $totals['advertisers'] ?? 0 ),
			'cv'          => (int) ( $cv_totals['cv'] ?? 0 ),
			'reward'      => (float) ( $cv_totals['reward'] ?? 0 ),
		),
	);
}

function soico_al_rest_aff_clicks( WP_REST_Request $req ) {
	global $wpdb;
	$table = $wpdb->prefix . SOICO_AL_TABLE;

	// 既定: 直近31日。created_at は WP ローカル時刻(JST)で保存されているため日付境界も JST。
	$end   = soico_al_norm_date( $req->get_param( 'end' ), current_time( 'Y-m-d' ) );
	$start = soico_al_norm_date( $req->get_param( 'start' ), date( 'Y-m-d', strtotime( $end . ' -30 day' ) ) );
	if ( $start > $end ) {
		$tmp = $start; $start = $end; $end = $tmp;
	}

	$rows = $wpdb->get_results(
		$wpdb->prepare(
			"SELECT post_id, DATE(created_at) AS date, advertiser AS partner, COUNT(*) AS clicks
			   FROM {$table}
			  WHERE post_id > 0
			    AND created_at >= %s
			    AND created_at <  %s
			  GROUP BY post_id, DATE(created_at), advertiser
			  ORDER BY date, post_id",
			$start . ' 00:00:00',
			$end . ' 23:59:59'
		),
		ARRAY_A
	);

	$out = array();
	foreach ( (array) $rows as $r ) {
		$out[] = array(
			'post_id' => (int) $r['post_id'],
			'date'    => $r['date'],
			'partner' => (string) $r['partner'],
			'clicks'  => (int) $r['clicks'],
		);
	}
	return array( 'rows' => $out, 'start' => $start, 'end' => $end );
}

function soico_al_norm_date( $v, $fallback ) {
	$v = is_string( $v ) ? trim( $v ) : '';
	return preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v ) ? $v : $fallback;
}

/* ===========================================================================
 * Measurement Protocol 送信（共通）
 * ======================================================================== */

function soico_al_send_event( $name, $client_id, $params ) {
	if ( defined( 'SOICO_AL_DEBUG' ) && SOICO_AL_DEBUG ) {
		$params['debug_mode'] = 1; // DebugView のみ（レポート非汚染）
	}
	$endpoint = 'https://www.google-analytics.com/mp/collect'
		. '?measurement_id=' . rawurlencode( SOICO_AL_MEASUREMENT_ID )
		. '&api_secret=' . rawurlencode( SOICO_AL_API_SECRET );
	$body = array(
		'client_id' => $client_id,
		'events'    => array(
			array(
				'name'   => $name,
				'params' => $params,
			),
		),
	);
	wp_remote_post(
		$endpoint,
		array(
			'blocking' => false,
			'timeout'  => 0.5,
			'headers'  => array( 'Content-Type' => 'application/json' ),
			'body'     => wp_json_encode( $body ),
		)
	);
}
